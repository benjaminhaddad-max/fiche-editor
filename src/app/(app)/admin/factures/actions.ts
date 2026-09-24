'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { rafraichirPaiements, syncInvoiceToPennylane } from '@/lib/invoice/pennylane'
import { enregistrerFactureDiverse } from '@/lib/invoice/misc'
import { cycleForDate, todayParis } from '@/lib/cycle'
import { relancerDeclarations } from '@/lib/relances'
import { createServiceClient } from '@/lib/supabase/service'

const ids = (fd: FormData) => fd.getAll('invoice_id').map(String).filter(Boolean)

function rafraichir() {
  // « layout » : la liste et chaque page de facture.
  revalidatePath('/admin/factures', 'layout')
}

/** Transmises → validées : elles partent dans la file Pennylane. */
export async function validerFactures(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const liste = ids(fd)
  if (!liste.length) return
  await createServiceClient()
    .from('inv_invoices')
    .update({ status: 'validated', validated_at: new Date().toISOString(), validated_by: user.id })
    .in('id', liste)
    .eq('status', 'sent')
  for (const id of liste) await logAudit(null, { actorId: user.id, entityType: 'invoice', entityId: id, action: 'facture_validee' })
  rafraichir()
}

export interface LotResultat {
  ok: number
  erreurs: { numero: string; message: string }[]
}

/** Envoie une sélection dans Pennylane, une par une (le débit est limité). */
export async function envoyerPennylane(_prev: LotResultat | null, fd: FormData): Promise<LotResultat> {
  const user = await requireRole('admin')
  const db = createServiceClient()
  const out: LotResultat = { ok: 0, erreurs: [] }
  for (const id of ids(fd)) {
    const r = await syncInvoiceToPennylane(id)
    await logAudit(null, {
      actorId: user.id,
      entityType: 'invoice',
      entityId: id,
      action: r.ok ? 'pennylane_sync' : 'pennylane_sync_failed',
      payload: r.ok ? { pennylane_invoice_id: r.pennylaneInvoiceId } : { error: r.error },
    })
    if (r.ok) out.ok++
    else {
      const { data } = await db.from('inv_invoices').select('number').eq('id', id).maybeSingle()
      out.erreurs.push({ numero: data?.number ?? id, message: r.error ?? 'erreur inconnue' })
    }
  }
  rafraichir()
  return out
}

export async function marquerPayees(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const liste = ids(fd)
  if (!liste.length) return
  await createServiceClient()
    .from('inv_invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', liste)
    .in('status', ['sent', 'validated'])
  for (const id of liste) await logAudit(null, { actorId: user.id, entityType: 'invoice', entityId: id, action: 'mark_paid' })
  rafraichir()
}

/**
 * Renvoie au prestataire une facture qu'il a déposée : incomplète, mauvais
 * montant, mentions manquantes. Il en dépose une nouvelle, qui repart seule.
 */
export async function demanderNouvelleFacture(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(fd.get('invoice_id') ?? '')
  const motif = String(fd.get('motif') ?? '').trim()
  if (!id || motif.length < 3) return

  const db = createServiceClient()
  const { data: f } = await db
    .from('inv_invoices')
    .update({ status: 'issued', sent_at: null, validated_at: null, validated_by: null })
    .eq('id', id)
    .eq('kind', 'platform')
    .eq('pdf_source', 'uploaded')
    .in('status', ['sent', 'validated'])
    .select('id, number, provider_id, provider:inv_providers(user:inv_users!inv_providers_user_id_fkey(id, email, full_name))')
    .maybeSingle()
  if (!f) return

  const dest = (f as unknown as { provider: { user: { id: string; email: string; full_name: string } | null } | null }).provider?.user
  if (dest) {
    // Le motif part dans la messagerie : la réponse du prestataire y restera attachée.
    const { data: fil } = await db
      .from('inv_threads')
      .insert({
        provider_id: f.provider_id,
        manager_id: user.id,
        subject: `Facture ${f.number} à refaire`,
        created_by: user.id,
        invoice_id: f.id,
      })
      .select('id')
      .single()
    if (fil) {
      await db.from('inv_messages').insert({
        thread_id: fil.id,
        author_id: user.id,
        body: `${motif}\n\nDéposez la facture corrigée depuis Facturation › ${f.number} : elle repartira automatiquement.`,
      })
      await deliver({
        to: { email: dest.email, name: dest.full_name },
        ...templates.messageReceived({
          recipientName: dest.full_name,
          authorName: user.full_name,
          subject: `Facture ${f.number} à refaire`,
          excerpt: motif,
          href: `/factures/${f.id}`,
        }),
        template: 'invoice_redo',
        entityType: 'invoice',
        entityId: f.id,
        providerId: f.provider_id,
      })
    }
  }
  await logAudit(null, { actorId: user.id, entityType: 'invoice', entityId: id, action: 'facture_a_refaire', payload: { motif } })
  rafraichir()
}

export interface DepotDiversResult {
  error?: string
  success?: string
}

/** Dépôt manuel d'une ou plusieurs factures diverses. */
export async function deposerFacturesDiverses(_prev: DepotDiversResult, fd: FormData): Promise<DepotDiversResult> {
  // Les managers déposent aussi : ce sont eux qui reçoivent les factures.
  const user = await requireRole('manager', 'admin')
  const fichiers = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  const categoryId = String(fd.get('category_id') ?? '') || null
  if (!fichiers.length) return { error: 'Choisissez au moins un PDF.' }
  if (fichiers.length > 10) return { error: '10 factures au plus par dépôt.' }

  const faites: string[] = []
  const ratees: string[] = []
  for (const f of fichiers) {
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      ratees.push(`${f.name} : ce n’est pas un PDF`)
      continue
    }
    const r = await enregistrerFactureDiverse({
      pdf: Buffer.from(await f.arrayBuffer()),
      filename: f.name,
      submittedBy: user.id,
      channel: 'upload',
      categoryId,
    })
    if (r.ok) {
      faites.push(`${r.fournisseur} ${r.numero}${r.fournisseurCree ? ' (fournisseur créé)' : ''}`)
      await logAudit(null, { actorId: user.id, entityType: 'invoice', entityId: r.invoiceId!, action: 'facture_diverse_deposee' })
    } else ratees.push(`${f.name} : ${r.error}`)
  }
  rafraichir()
  revalidatePath('/factures-diverses')
  return {
    success: faites.length ? `Enregistrée${faites.length > 1 ? 's' : ''} dans les validées : ${faites.join(' · ')}` : undefined,
    error: ratees.length ? ratees.join(' · ') : undefined,
  }
}

/** Relit l'état de paiement dans Pennylane et met les factures à jour. */
export async function actualiserPaiements(): Promise<void> {
  const user = await requireRole('admin')
  const r = await rafraichirPaiements()
  await logAudit(null, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: user.id,
    action: 'paiements_actualises',
    payload: { verifiees: r.verifiees, payees: r.payees.length, erreurs: r.erreurs.slice(0, 5) },
  })
  rafraichir()
}

/**
 * Rattache à un manager une facture arrivée d'une adresse inconnue.
 *
 * Tant que personne n'est désigné, la facture reste dans la pile à valider
 * et n'entre pas en compta : c'est ce geste qui l'y fait entrer.
 */
export async function rattacherExpediteur(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(fd.get('invoice_id') ?? '')
  const managerId = String(fd.get('manager_id') ?? '')
  if (!id || !managerId) return

  const db = createServiceClient()
  const { data: encadrant } = await db
    .from('inv_users')
    .select('id')
    .eq('id', managerId)
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
    .maybeSingle()
  if (!encadrant) return

  const now = new Date().toISOString()
  const { data: facture } = await db
    .from('inv_invoices')
    .update({
      submitted_by: managerId,
      validated_by: user.id,
      validated_at: now,
      status: 'validated',
      inbound_match: 'manuel',
    })
    .eq('id', id)
    .is('submitted_by', null)
    .select('id, number, inbound_from')
    .maybeSingle()
  if (!facture) return

  await logAudit(null, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: 'facture_rattachee',
    payload: { manager_id: managerId, expediteur: facture.inbound_from },
  })
  revalidatePath('/remunerations')
}

export interface RelanceResultat {
  message?: string
  error?: string
}

/**
 * Envoie la relance du mois, tout de suite, sans attendre le travail
 * automatique. Chacun reçoit le message qui le concerne : un lien d'entrée
 * pour qui n'est jamais venu, la date limite pour qui doit encore déclarer,
 * la date de réception des factures pour les managers.
 */
export async function relancerMaintenant(): Promise<RelanceResultat> {
  const user = await requireRole('manager', 'admin')
  const cycle = cycleForDate(todayParis())

  try {
    // Un manager ne relance que ses prestataires ; l'administration relance
    // tout le monde, managers compris.
    const r = await relancerDeclarations(cycle, user.id, user.role === 'manager' ? user.id : undefined)
    const morceaux = [
      r.rappeles && `${r.rappeles} rappel(s) de déclaration`,
      r.invites && `${r.invites} invitation(s) envoyée(s)`,
      r.managers && `${r.managers} manager(s) prévenu(s) pour les factures`,
      r.fiches && `${r.fiches} fiche(s) incomplète(s) relancée(s)`,
      r.ignores && `${r.ignores} personne(s) ayant déjà déclaré, laissées tranquilles`,
    ].filter(Boolean)
    return {
      message: morceaux.length ? `Relance partie : ${morceaux.join(', ')}.` : 'Personne à relancer.',
      error: r.echecs.length ? `Non remis : ${r.echecs.join(', ')}` : undefined,
    }
  } catch (err) {
    return { error: `Relance impossible : ${(err as Error).message}` }
  }
}
