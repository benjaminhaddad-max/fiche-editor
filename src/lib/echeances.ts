import { PROGRAMME_LABEL } from '@/lib/contracts'
import { createServiceClient } from '@/lib/supabase/service'
import { brandScope, getBrandId } from '@/lib/brand'
import { montantVerse, tauxAbattement } from '@/lib/abattement'
import type { Pole } from '@/lib/types'

interface Contrat {
  id: string
  provider_id: string
  manager_id: string | null
  category_id: string | null
  contract_type: string
  title: string | null
  program: string | null
  academic_year: string | null
  headcount: number | null
  status: string
  pay_basis: 'brut' | 'net' | null
}

interface Due {
  id: string
  label: string
  due_date: string
  amount_ht: number
  contract: Contrat | null
}

/** Une échéance échue que personne n'a encore portée sur le mois. */
export interface EcheanceProposee {
  id: string
  label: string
  dueDate: string
  montant: number
  providerId: string
  providerNom: string
  managerId: string | null
}

const REQUETE = `id, label, due_date, amount_ht,
   contract:inv_coaching_contracts(id, provider_id, manager_id, category_id, contract_type,
     title, program, academic_year, headcount, status, pay_basis)`

/**
 * Les échéances arrivées à terme qui n'ont pas encore de prestation.
 *
 * Elles ne deviennent plus des prestations toutes seules : elles sont
 * proposées. Une échéance ouverte d'office venait s'ajouter à ce que la
 * personne avait déclaré de son côté, et le mois était compté deux fois —
 * Alexandra et Danial ont chacun eu leur coaching en double. Personne ne
 * s'en apercevait avant le récapitulatif, parfois après l'envoi à la paie.
 *
 * Proposer coûte un clic ; ouvrir d'office coûte un doublon.
 */
export async function echeancesProposees(
  aujourdhui: string,
  filtre: { providerId?: string; managerId?: string } = {}
): Promise<EcheanceProposee[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_contract_instalments')
    .select(REQUETE)
    .lte('due_date', aujourdhui)
    .is('mission_id', null)
    .order('due_date')

  const dues = ((data ?? []) as unknown as Due[]).filter(
    (e) =>
      e.contract?.status === 'active' &&
      (!filtre.providerId || e.contract.provider_id === filtre.providerId) &&
      (!filtre.managerId || e.contract.manager_id === filtre.managerId)
  )
  if (dues.length === 0) return []

  // Le nom se lit sur la proposition : « 1 100 € » sans savoir pour qui ne
  // veut rien dire sur un écran de manager. La borne d'école est ici, et
  // c'est elle qui écarte les contrats d'une autre marque.
  const { data: fiches } = await db
    .from('inv_providers')
    .select('id, legal_name')
    .eq('brand', getBrandId())
    .in('id', [...new Set(dues.map((e) => e.contract!.provider_id))])
  const nom = new Map((fiches ?? []).map((f) => [f.id as string, f.legal_name as string]))

  return dues
    .filter((e) => nom.has(e.contract!.provider_id))
    .map((e) => ({
      id: e.id,
      label: e.label,
      dueDate: e.due_date,
      montant: Number(e.amount_ht),
      providerId: e.contract!.provider_id,
      providerNom: nom.get(e.contract!.provider_id)!,
      managerId: e.contract!.manager_id,
    }))
}

/**
 * Porte une échéance sur le mois, à la demande.
 *
 * Le contrat signé tient lieu d'accord du manager : la ligne arrive
 * « validée par le manager » et part dans le bordereau. Ce qui change, c'est
 * qui déclenche — quelqu'un qui sait si le travail a déjà été déclaré.
 */
export async function ouvrirUneEcheance(
  instalmentId: string,
  opts: { providerId?: string } = {}
): Promise<{ ok: boolean; error?: string; missionId?: string }> {
  const db = createServiceClient()
  const { data: brut } = await db
    .from('inv_contract_instalments')
    .select(REQUETE)
    .eq('id', instalmentId)
    .maybeSingle()

  const e = brut as unknown as Due | null
  const c = e?.contract
  if (!e || !c) return { ok: false, error: 'Échéance introuvable.' }
  if (c.status !== 'active') return { ok: false, error: 'Ce contrat n’est plus en cours.' }
  // Déjà portée : deux clics au même moment ne doivent pas faire deux lignes.
  const { data: dejaLa } = await db
    .from('inv_contract_instalments')
    .select('mission_id')
    .eq('id', instalmentId)
    .maybeSingle()
  if (dejaLa?.mission_id) return { ok: false, error: 'Cette échéance est déjà portée sur le mois.' }
  if (opts.providerId && c.provider_id !== opts.providerId) {
    return { ok: false, error: 'Cette échéance n’est pas la vôtre.' }
  }

  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, pay_abatement, abatement_exempt_poles')
    .eq('brand', getBrandId())
    .eq('id', c.provider_id)
    .maybeSingle()
  if (!fiche) return { ok: false, error: 'Fiche prestataire introuvable.' }

  const { data: cats } = await db
    .from('inv_categories')
    .select('id, pole')
    .in('brand', brandScope())
    .eq('is_active', true)
    .order('sort_order')
  const categorie = c.category_id ?? cats?.find((x) => x.pole === c.contract_type)?.id
  if (!c.manager_id || !categorie) {
    return { ok: false, error: `Contrat incomplet : ${!c.manager_id ? 'manager' : 'catégorie'} manquant.` }
  }

  const abattu = tauxAbattement(fiche, cats?.find((x) => x.id === categorie)?.pole as Pole | undefined)
  // Ce libellé part tel quel sur la facture et dans Pennylane.
  const detail = c.program
    ? `Coaching pédagogique ${PROGRAMME_LABEL[c.program] ?? c.program} — ${c.academic_year} — ${e.label.toLowerCase()}${c.headcount ? ` — ${c.headcount} étudiants suivis` : ''}`
    : `${c.title ?? 'Contrat'} — ${e.label.toLowerCase()}`
  const now = new Date().toISOString()

  const { data: mission, error } = await db
    .from('inv_missions')
    .insert({
      provider_id: c.provider_id,
      manager_id: c.manager_id,
      category_id: categorie,
      detail,
      start_date: e.due_date,
      end_date: e.due_date,
      pay_basis: c.pay_basis ?? null,
      pricing_type: 'forfait_mission',
      quantity: 1,
      unit_amount_ht: e.amount_ht,
      abatement_rate: abattu,
      total_ht: montantVerse(Number(e.amount_ht), abattu),
      status: 'manager_approved',
      origin: 'contract',
      submitted_at: now,
      manager_approved_at: now,
      manager_approved_by: c.manager_id,
    })
    .select('id')
    .single()
  if (error || !mission) return { ok: false, error: error?.message ?? 'Enregistrement impossible.' }

  await db.from('inv_contract_instalments').update({ mission_id: mission.id }).eq('id', e.id)
  return { ok: true, missionId: mission.id }
}
