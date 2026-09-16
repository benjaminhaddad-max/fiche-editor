'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { POLES } from '@/lib/types'

export interface ContractResult {
  error?: string
  success?: string
}

const Echeance = z.object({
  label: z.string().trim().min(2),
  due_date: z.iso.date(),
  amount_ht: z.coerce.number<number>().nonnegative(),
})

const Contrat = z
  .object({
    provider_id: z.uuid('Choisissez la personne.'),
    contract_type: z.enum(POLES as [string, ...string[]]),
    title: z.string().trim().min(3, 'Donnez un intitulé au contrat.').max(200),
    manager_id: z.union([z.uuid(), z.literal('')]).optional(),
    start_date: z.iso.date('Date de début invalide.'),
    end_date: z.union([z.iso.date(), z.literal('')]).optional(),
    rate_type: z.enum(['forfait', 'mission', 'horaire', 'mensuel']),
    rate_amount: z.union([z.coerce.number<number>().nonnegative(), z.literal('')]).optional(),
    total_ht: z.union([z.coerce.number<number>().nonnegative(), z.literal('')]).optional(),
    conditions: z.string().trim().max(5000).optional(),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { message: 'La fin doit suivre le début.', path: ['end_date'] })

/**
 * Crée un contrat de n'importe quel pôle. Un forfait porte un échéancier :
 * ses échéances deviendront des prestations à leur date. Un tarif à la
 * mission, à l'heure ou au mois sert de référence aux déclarations.
 */
export async function creerContrat(_prev: ContractResult, fd: FormData): Promise<ContractResult> {
  const user = await requireRole('admin')
  const parsed = Contrat.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  let echeances: z.infer<typeof Echeance>[] = []
  try {
    const brut = JSON.parse(String(fd.get('echeances') ?? '[]')) as unknown[]
    echeances = brut
      .filter((e) => e && typeof e === 'object' && (e as { amount_ht?: unknown }).amount_ht !== '')
      .map((e) => Echeance.parse(e))
  } catch {
    return { error: 'Échéancier incomplet : chaque ligne demande un libellé, une date et un montant.' }
  }

  const somme = round2(echeances.reduce((s, e) => s + e.amount_ht, 0))
  const total = v.total_ht === '' || v.total_ht === undefined ? somme : Number(v.total_ht)
  if (v.rate_type === 'forfait' && echeances.length && Math.abs(somme - total) > 0.01) {
    return { error: `Les échéances font ${somme} € alors que le contrat en fait ${total} €.` }
  }

  const db = createServiceClient()
  // La catégorie comptable du pôle : les échéances deviendront des
  // prestations de cette catégorie.
  const { data: categorie } = await db
    .from('inv_categories')
    .select('id')
    .eq('pole', v.contract_type)
    .eq('is_active', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle()
  if (v.rate_type === 'forfait' && echeances.length && !v.manager_id) {
    return { error: 'Choisissez le manager référent : les échéances lui seront rattachées.' }
  }

  const { data: contrat, error } = await db
    .from('inv_coaching_contracts')
    .insert({
      provider_id: v.provider_id,
      contract_type: v.contract_type,
      title: v.title,
      manager_id: v.manager_id || null,
      category_id: categorie?.id ?? null,
      start_date: v.start_date,
      end_date: v.end_date || null,
      rate_type: v.rate_type,
      rate_amount: v.rate_amount === '' || v.rate_amount === undefined ? null : Number(v.rate_amount),
      total_ht: total,
      conditions: v.conditions || null,
      status: 'active',
    })
    .select('id')
    .single()
  if (error) return { error: `Création impossible : ${error.message}` }

  if (echeances.length) {
    const { error: e2 } = await db.from('inv_contract_instalments').insert(
      echeances.map((e, i) => ({ contract_id: contrat.id, label: e.label, due_date: e.due_date, amount_ht: e.amount_ht, sort_order: i + 1 }))
    )
    if (e2) return { error: `Contrat créé, mais échéancier non enregistré : ${e2.message}` }
  }

  const fichier = fd.get('file')
  if (fichier instanceof File && fichier.size > 0) {
    const erreur = await rangerDocument(contrat.id, v.provider_id, fichier)
    if (erreur) return { error: `Contrat créé, mais ${erreur.charAt(0).toLowerCase()}${erreur.slice(1)}` }
  }

  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: contrat.id, action: 'contrat_cree', payload: { total, echeances: echeances.length } })
  revalidatePath('/admin/contrats')
  return { success: 'Contrat enregistré. La personne le retrouve dans « Mes contrats ».' }
}

const MAX_PDF = 4 * 1024 * 1024

/** Range le PDF signé d'un contrat. Renvoie un message d'erreur, ou null. */
async function rangerDocument(contractId: string, providerId: string, fichier: File): Promise<string | null> {
  if (!fichier.name.toLowerCase().endsWith('.pdf') && fichier.type !== 'application/pdf') return 'Le contrat doit être un PDF.'
  if (fichier.size > MAX_PDF) return 'Le PDF ne doit pas dépasser 4 Mo.'
  const db = createServiceClient()
  const path = `${providerId}/contrat-${contractId}.pdf`
  const { error } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, Buffer.from(await fichier.arrayBuffer()), { contentType: 'application/pdf', upsert: true })
  if (error) return `Dépôt du PDF impossible : ${error.message}`
  await db.from('inv_coaching_contracts').update({ document_path: path }).eq('id', contractId)
  return null
}

/** Dépose ou remplace le contrat signé. */
export async function deposerDocumentContrat(_prev: ContractResult, fd: FormData): Promise<ContractResult> {
  const user = await requireRole('admin')
  const id = String(fd.get('contract_id') ?? '')
  const fichier = fd.get('file')
  if (!id || !(fichier instanceof File) || fichier.size === 0) return { error: 'Choisissez le PDF du contrat.' }
  const { data: c } = await createServiceClient().from('inv_coaching_contracts').select('provider_id').eq('id', id).maybeSingle()
  if (!c) return { error: 'Contrat introuvable.' }
  const erreur = await rangerDocument(id, c.provider_id, fichier)
  if (erreur) return { error: erreur }
  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: id, action: 'contrat_document' })
  revalidatePath('/admin/contrats', 'layout')
  return { success: 'Contrat signé enregistré.' }
}

export async function changerStatutContrat(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(fd.get('contract_id') ?? '')
  const statut = String(fd.get('status') ?? '')
  if (!id || !['active', 'ended', 'cancelled'].includes(statut)) return
  await createServiceClient().from('inv_coaching_contracts').update({ status: statut }).eq('id', id)
  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: id, action: `contrat_${statut}` })
  revalidatePath('/admin/contrats', 'layout')
}
