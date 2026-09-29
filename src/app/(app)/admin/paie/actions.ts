'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { formatDate, money, round2 } from '@/lib/format'
import { brand, getBrandId } from '@/lib/brand'
import { cycleForMonth } from '@/lib/cycle'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { lignesPaie } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import { enregistrerBulletin } from '@/lib/paie/bulletins'

/**
 * Marque les éléments d'un mois comme envoyés au social : ils sortent de la
 * liste et ne pourront plus être envoyés deux fois.
 */
export async function cloturerPaie(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const mois = String(fd.get('mois') ?? '')
  const ids = fd.getAll('mission_id').map(String).filter(Boolean)
  if (!/^\d{4}-\d{2}$/.test(mois) || !ids.length) return

  const db = createServiceClient()
  const { data: lignes } = await db
    .from('inv_missions')
    .select('id, total_ht')
    .in('id', ids)
    .eq('status', 'approved')
    .is('payroll_batch_id', null)
  if (!lignes?.length) return

  const total = round2(lignes.reduce((s, l) => s + Number(l.total_ht), 0))
  const { data: lot } = await db
    .from('inv_payroll_batches')
    .insert({ cycle_month: mois, total_ht: total, lines: lignes.length, created_by: user.id })
    .select('id')
    .single()
  if (!lot) return

  await db
    .from('inv_missions')
    .update({ payroll_batch_id: lot.id, status: 'invoiced' })
    .in('id', lignes.map((l) => l.id))

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: lot.id,
    action: 'paie_envoyee',
    payload: { mois, lignes: lignes.length, total },
  })
  revalidatePath('/admin/paie')
}

export interface DepotBulletinsResult {
  error?: string
  success?: string
}

/** Dépôt manuel des bulletins du mois, en lot. */
export async function deposerBulletins(_prev: DepotBulletinsResult, fd: FormData): Promise<DepotBulletinsResult> {
  const user = await requireRole('admin')
  const fichiers = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
  if (!fichiers.length) return { error: 'Choisissez au moins un PDF.' }
  if (fichiers.length > 15) return { error: '15 bulletins au plus par dépôt.' }

  const ranges: string[] = []
  const ratees: string[] = []
  for (const f of fichiers) {
    const r = await enregistrerBulletin({
      pdf: Buffer.from(await f.arrayBuffer()),
      filename: f.name,
      source: 'upload',
      uploadedBy: user.id,
    })
    if (r.ok) ranges.push(`${r.personne} (${r.periode})`)
    else ratees.push(`${f.name} : ${r.error}`)
  }
  if (ranges.length) {
    await logAudit(null, {
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'bulletins_deposes',
      payload: { ranges: ranges.length, ratees: ratees.length },
    })
  }
  revalidatePath('/admin/paie')
  return {
    success: ranges.length ? `Classé : ${ranges.join(' · ')}` : undefined,
    error: ratees.length ? ratees.join(' · ') : undefined,
  }
}

export interface EnvoiSocial {
  message?: string
  error?: string
}

/**
 * Envoyer le récapitulatif de paie à qui prépare les bulletins.
 *
 * Jusqu'ici l'écran disait « téléchargez l'export, envoyez-le au social » :
 * le geste se faisait à la main, hors de la plateforme, et rien ne gardait
 * trace de ce qui était parti ni quand.
 *
 * Le message porte ce qui est acquis, personne par personne, et dit
 * franchement ce qui ne l'est pas encore : un récapitulatif silencieux sur
 * les lignes en attente ferait payer un mois incomplet sans que personne
 * s'en aperçoive avant le bulletin.
 */
export async function envoyerAuSocial(_prev: EnvoiSocial | null, fd: FormData): Promise<EnvoiSocial> {
  const user = await requireRole('admin')
  const mois = String(fd.get('mois') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return { error: 'Mois invalide.' }

  const destinataire = brand().payrollContact
  if (!destinataire) {
    return { error: 'Aucun interlocuteur paie n’est renseigné pour cette école.' }
  }

  const cycle = cycleForMonth(mois)
  const lignes = await lignesPaie(cycle.periodStart, cycle.periodEnd)
  const pretes = lignes.filter((l) => l.status === 'approved')
  if (!pretes.length) return { error: 'Rien de validé à envoyer pour ce mois.' }

  // Le détail par personne, tel qu'il se lira sur le bulletin.
  const parPersonne = new Map<string, typeof pretes>()
  for (const l of pretes) parPersonne.set(l.personne, [...(parPersonne.get(l.personne) ?? []), l])
  const detail = [...parPersonne.entries()].map(([personne, ls]) => ({
    personne,
    statut: EMPLOYMENT_LABEL[ls[0].statut],
    brut: round2(ls.filter((l) => l.base === 'brut').reduce((s, l) => s + l.total, 0)),
    net: round2(ls.filter((l) => l.base === 'net').reduce((s, l) => s + l.total, 0)),
    detail: ls.map(
      (l) =>
        `${formatDate(l.date)} — ${l.detail} — ${money(l.total)} ${l.base}` +
        (l.abattement > 0 ? ` (${money(round2(l.quantity * l.unit))} convenus, abattement ${l.abattement} %)` : '')
    ),
  }))

  // Ce qui n'est pas validé ne part pas, mais se dit.
  const attente = new Map<string, { n: number; total: number }>()
  for (const l of lignes.filter((x) => x.status !== 'approved')) {
    const c = attente.get(l.personne) ?? { n: 0, total: 0 }
    attente.set(l.personne, { n: c.n + 1, total: round2(c.total + l.total) })
  }

  const totalBrut = round2(detail.reduce((s, d) => s + d.brut, 0))
  const totalNet = round2(detail.reduce((s, d) => s + d.net, 0))

  await deliver({
    to: { email: destinataire.email, name: destinataire.name },
    ...templates.socialRecap({
      label: cycle.label,
      lignes: detail,
      totalBrut,
      totalNet,
      enAttente: [...attente.entries()].map(([personne, c]) => ({ personne, ...c })),
    }),
    template: 'social_recap',
    entityType: 'user',
    entityId: user.id,
  })

  // Le même geste ferme les lignes : les envoyer sans les marquer, c'est
  // les renvoyer une deuxième fois le mois suivant.
  const db = createServiceClient()
  const { data: lot } = await db
    .from('inv_payroll_batches')
    .insert({ cycle_month: mois, total_ht: round2(totalBrut + totalNet), lines: pretes.length, created_by: user.id })
    .select('id')
    .single()
  if (lot) {
    await db
      .from('inv_missions')
      .update({ payroll_batch_id: lot.id, status: 'invoiced' })
      .in('id', pretes.map((l) => l.id))
  }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: lot?.id ?? user.id,
    action: 'paie_envoyee_au_social',
    payload: { mois, destinataire: destinataire.email, lignes: pretes.length, totalBrut, totalNet },
  })
  revalidatePath('/remunerations')

  return {
    message:
      `Récapitulatif envoyé à ${destinataire.name} : ${pretes.length} ligne(s), ${money(totalBrut)} brut` +
      (totalNet ? ` + ${money(totalNet)} en net` : '') +
      (attente.size ? `. ${attente.size} personne(s) ont encore des lignes non validées, elles sont signalées dans le message.` : '.'),
  }
}

/**
 * Relancer les managers qui retiennent des prestations de salariés.
 *
 * La paie ne suit pas le rythme des factures : un bulletin se prépare plus
 * tôt qu'un virement, et une ligne validée trop tard bascule sur le mois
 * suivant. On relance donc à part, sans déranger ceux qui ne retiennent que
 * des lignes d'indépendants.
 */
export async function relancerPourLaPaie(_prev: EnvoiSocial | null, fd: FormData): Promise<EnvoiSocial> {
  const user = await requireRole('admin')
  const mois = String(fd.get('mois') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return { error: 'Mois invalide.' }

  const cycle = cycleForMonth(mois)
  const lignes = (await lignesPaie(cycle.periodStart, cycle.periodEnd)).filter(
    (l) => l.status === 'submitted' || l.status === 'manager_approved'
  )
  if (!lignes.length) return { message: 'Rien en attente : aucun manager à relancer pour la paie.' }

  const db = createServiceClient()
  const { data: brutes } = await db
    .from('inv_missions')
    .select('manager_id, total_ht, provider:inv_providers!inner(legal_name, employment_type)')
    .eq('brand', getBrandId())
    .in('id', lignes.map((l) => l.id))

  const parManager = new Map<string, { n: number; total: number; gens: Set<string> }>()
  for (const m of (brutes ?? []) as unknown as {
    manager_id: string
    total_ht: number
    provider: { legal_name: string } | null
  }[]) {
    const c = parManager.get(m.manager_id) ?? { n: 0, total: 0, gens: new Set<string>() }
    c.n++
    c.total += Number(m.total_ht)
    if (m.provider?.legal_name) c.gens.add(m.provider.legal_name)
    parManager.set(m.manager_id, c)
  }

  const { data: encadrants } = await db
    .from('inv_users')
    .select('id, email, full_name, email_unreachable_reason')
    .eq('brand', getBrandId())
    .in('id', [...parManager.keys()])
    .eq('is_active', true)

  let envoyes = 0
  const injoignables: string[] = []
  for (const m of encadrants ?? []) {
    if (m.email_unreachable_reason) {
      injoignables.push(`${m.full_name} (${m.email})`)
      continue
    }
    const c = parManager.get(m.id as string)!
    await deliver({
      to: { email: m.email as string, name: m.full_name as string },
      ...templates.socialReminder({
        name: m.full_name as string,
        count: c.n,
        total: round2(c.total),
        gens: [...c.gens],
        label: cycle.label,
      }),
      template: 'social_reminder',
      entityType: 'user',
      entityId: m.id as string,
    })
    envoyes++
  }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'relance_paie',
    payload: { mois, envoyes, lignes: lignes.length },
  })

  return {
    message: `Relance partie à ${envoyes} manager${envoyes > 1 ? 's' : ''} — ${lignes.length} prestation(s) de salariés en attente.`,
    error: injoignables.length ? `Adresse à corriger : ${injoignables.join(' · ')}` : undefined,
  }
}
