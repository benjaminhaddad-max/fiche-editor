'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { generateAndStorePdf } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { estAuteur, type Employment } from '@/lib/types'

/**
 * Corriger une note de droits d'auteur sans passer par un développeur.
 *
 * Nolwenn l'a demandé le 10 novembre : quand une note sort fausse (un tarif
 * mal saisi, une séance oubliée, un trop-versé), elle doit pouvoir la
 * reprendre elle-même. La correction se fait par une ligne de
 * régularisation, en brut, positive ou négative : la note garde ses lignes
 * d'origine, l'écart se lit noir sur blanc, et le précompte est recalculé
 * sur le nouveau brut. Rien n'est effacé.
 *
 * Seulement tant que la note n'est pas payée : après, c'est une nouvelle
 * note qu'il faut, pas une réécriture de celle que l'auteur a reçue.
 */
export async function ajouterRegularisation(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const invoiceId = String(fd.get('invoice_id') ?? '')
  const libelle = String(fd.get('libelle') ?? '').trim()
  const montant = round2(Number(String(fd.get('montant') ?? '').replace(',', '.').replace(/\s/g, '')))
  if (!invoiceId || !libelle || !Number.isFinite(montant) || montant === 0) return

  const db = createServiceClient()
  const { data: facture } = await db
    .from('inv_invoices')
    .select('id, status, provider:inv_providers(employment_type)')
    .eq('id', invoiceId)
    .maybeSingle()
  const f = facture as unknown as { id: string; status: string; provider: { employment_type: Employment } | null } | null
  if (!f || f.status === 'paid' || f.status === 'cancelled') return
  if (!estAuteur(f.provider?.employment_type)) return

  const { data: lignes } = await db
    .from('inv_invoice_lines')
    .select('total_ht, sort_order')
    .eq('invoice_id', invoiceId)
  const existantes = (lignes ?? []) as { total_ht: number; sort_order: number }[]
  const brutApres = round2(existantes.reduce((s, l) => s + Number(l.total_ht), 0) + montant)
  // Une note négative ne se paie pas : c'est un avoir, qui se traite à part.
  if (brutApres < 0) return

  const { error } = await db.from('inv_invoice_lines').insert({
    invoice_id: invoiceId,
    mission_id: null,
    description: libelle,
    category_name: 'Régularisation',
    pricing_type: 'forfait_mission',
    quantity: 1,
    unit_amount_ht: montant,
    total_ht: montant,
    vat_rate: 0,
    vat_amount: 0,
    total_ttc: montant,
    sort_order: Math.max(0, ...existantes.map((l) => Number(l.sort_order))) + 1,
  })
  if (error) throw new Error(`Régularisation impossible : ${error.message}`)

  await recalculerTotaux(db, invoiceId)
  await logAudit(null, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'regularisation_ajoutee',
    payload: { libelle, montant, brut_apres: brutApres },
  })
  try {
    await generateAndStorePdf(invoiceId)
  } catch (err) {
    console.error('[regularisation:pdf]', invoiceId, err)
  }
  revalidatePath('/remunerations', 'layout')
  revalidatePath('/admin/factures', 'layout')
}

/** Refaire le PDF d'une note générée, après une correction de fiche ou de ligne. */
export async function regenererPdf(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const invoiceId = String(fd.get('invoice_id') ?? '')
  if (!invoiceId) return
  const { data } = await createServiceClient()
    .from('inv_invoices')
    .select('pdf_source')
    .eq('id', invoiceId)
    .maybeSingle()
  // Un PDF déposé par le prestataire est le sien : on ne le remplace pas.
  if (!data || data.pdf_source === 'uploaded') return
  await generateAndStorePdf(invoiceId)
  await logAudit(null, { actorId: user.id, entityType: 'invoice', entityId: invoiceId, action: 'pdf_regenere' })
  revalidatePath('/admin/factures', 'layout')
}

async function recalculerTotaux(db: ReturnType<typeof createServiceClient>, invoiceId: string) {
  const { data } = await db.from('inv_invoice_lines').select('total_ht, vat_amount, total_ttc').eq('invoice_id', invoiceId)
  const l = (data ?? []) as { total_ht: number; vat_amount: number; total_ttc: number }[]
  const somme = (k: 'total_ht' | 'vat_amount' | 'total_ttc') => round2(l.reduce((s, x) => s + Number(x[k]), 0))
  await db
    .from('inv_invoices')
    .update({ subtotal_ht: somme('total_ht'), vat_amount: somme('vat_amount'), total_ttc: somme('total_ttc') })
    .eq('id', invoiceId)
}
