import { round2 } from '@/lib/format'
import { cycleForMonth } from '@/lib/cycle'
import { effectifsParCoach, labConfigure } from '@/lib/lab'
import { createServiceClient } from '@/lib/supabase/service'

export interface Regularisation {
  coach: string
  contrat: number
  reel: number
  montant: number
  detail: string
}

export interface BilanEffectifs {
  verifies: number
  regularisees: Regularisation[]
  ignorees: string[]
}

/**
 * La régularisation d'effectif, à la dernière échéance du semestre.
 *
 * Un contrat de coaching fixe un effectif au moment où on l'écrit, mais des
 * élèves arrivent en cours de semestre. Comme on paie par semestre, on
 * compte une dernière fois à la date du dernier versement et on ajoute la
 * différence : tant d'élèves de plus, au même prorata que le contrat.
 *
 * On ne retire jamais rien. Un effectif qui a baissé ne donne pas lieu à une
 * reprise : le travail a été fait, et réclamer un trop-perçu sur un semestre
 * écoulé ne se fait pas.
 */
export async function regulariserEffectifs(
  echeance: string,
  opts: { appliquer?: boolean } = {}
): Promise<BilanEffectifs> {
  const out: BilanEffectifs = { verifies: 0, regularisees: [], ignorees: [] }
  if (!labConfigure()) {
    out.ignorees.push('Diploma Lab n’est pas relié : LAB_SUPABASE_URL ou LAB_SUPABASE_SERVICE_KEY manque.')
    return out
  }

  const db = createServiceClient()
  const effectifs = await effectifsParCoach()
  if (effectifs.size === 0) {
    out.ignorees.push('Aucun effectif lu dans Diploma Lab.')
    return out
  }

  // Les contrats dont une échéance tombe précisément à cette date : c'est
  // elle qui marque la fin du semestre.
  const { data: contrats } = await db
    .from('inv_coaching_contracts')
    .select(
      `id, headcount, rate_base_amount, rate_base_headcount, manager_id, category_id, contract_type,
       provider:inv_providers!inner(id, legal_name, pay_abatement, user:inv_users!inv_providers_user_id_fkey(email)),
       instalments:inv_contract_instalments!inner(due_date, label)`
    )
    .eq('status', 'active')
    .not('rate_base_headcount', 'is', null)
    .eq('instalments.due_date', echeance)

  const now = new Date().toISOString()

  for (const c of (contrats ?? []) as unknown as {
    id: string
    headcount: number | null
    rate_base_amount: number | null
    rate_base_headcount: number | null
    manager_id: string | null
    category_id: string | null
    contract_type: string
    provider: { id: string; legal_name: string; pay_abatement: number; user: { email: string } | { email: string }[] | null }
    instalments: { due_date: string; label: string }[]
  }[]) {
    out.verifies++
    const u = Array.isArray(c.provider.user) ? c.provider.user[0] : c.provider.user
    const lu = u?.email ? effectifs.get(u.email.toLowerCase()) : undefined
    if (!lu) {
      out.ignorees.push(`${c.provider.legal_name} : introuvable dans Diploma Lab`)
      continue
    }

    const ecart = lu.eleves - Number(c.headcount ?? 0)
    if (ecart <= 0) continue

    const parEleve = Number(c.rate_base_amount) / Number(c.rate_base_headcount)
    const montant = round2(ecart * parEleve)
    if (montant <= 0) continue

    const periode = echeance.slice(0, 7)
    const libelle =
      `Régularisation d’effectif — ${ecart} étudiant${ecart > 1 ? 's' : ''} de plus que le contrat ` +
      `(${lu.eleves} suivis contre ${c.headcount}) — ${lu.detail}`

    out.regularisees.push({
      coach: c.provider.legal_name,
      contrat: Number(c.headcount ?? 0),
      reel: lu.eleves,
      montant,
      detail: lu.detail,
    })
    if (!opts.appliquer) continue

    // Déjà régularisé à cette date ? On ne repasse pas deux fois.
    const { data: deja } = await db
      .from('inv_missions')
      .select('id')
      .eq('provider_id', c.provider.id)
      .eq('start_date', echeance)
      .eq('regularisation', true)
      .maybeSingle()
    if (deja) continue

    const abattement = Number(c.provider.pay_abatement ?? 0)
    await db.from('inv_missions').insert({
      provider_id: c.provider.id,
      manager_id: c.manager_id,
      category_id: c.category_id,
      detail: libelle,
      start_date: echeance,
      end_date: echeance,
      pricing_type: 'forfait_mission',
      quantity: 1,
      unit_amount_ht: montant,
      abatement_rate: abattement,
      total_ht: round2(montant * (1 - abattement / 100)),
      status: 'manager_approved',
      origin: 'contract',
      regularisation: true,
      regul_period: periode,
      submitted_at: now,
      manager_approved_at: now,
      manager_approved_by: c.manager_id,
    })

    // L'effectif du contrat suit, pour que le semestre suivant reparte juste.
    await db.from('inv_coaching_contracts').update({ headcount: lu.eleves }).eq('id', c.id)
  }

  return out
}

/** Le mois d'une échéance, en toutes lettres — pour le compte rendu. */
export function moisEcheance(date: string): string {
  return cycleForMonth(date.slice(0, 7)).label
}
