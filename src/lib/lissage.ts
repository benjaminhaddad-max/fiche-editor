import { montantVerse } from '@/lib/abattement'
import { round2 } from '@/lib/format'
import { repartir } from '@/lib/lissage-calcul'
import type { createServiceClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceClient>

/**
 * Lissage : étaler ce qui a été fait sur une période en plusieurs parts
 * mensuelles.
 *
 * Le besoin : un auto-entrepreneur qui ne doit pas dépasser son plafond de
 * chiffre d'affaires. Le travail reste déclaré et validé comme d'habitude
 * (le contrôle ne bouge pas) ; ce qui change, c'est quand il est payé.
 *
 * Mécanique : les missions de la période passent « lissée » à la validation
 * et ne partent dans aucun bordereau. Chaque mois, une part est portée comme
 * une mission ordinaire sur la fiche de celui qui facture et reçoit — le
 * prestataire lui-même, ou un tiers comme son conjoint. Elle suit alors le
 * chemin normal : bordereau, facture déposée, rapprochement du montant. La
 * facture reste une facture de la plateforme, une par mois, d'un montant qui
 * est exactement celui du bordereau.
 */

const dernierJour = (mois: string) => {
  const [a, m] = mois.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/**
 * Recalcule les parts pas encore portées : le total des missions lissées,
 * moins ce qui est déjà porté, réparti sur ce qui reste. La somme des parts
 * égale ainsi toujours le total des missions.
 */
export async function recalculerLissage(db: Db, lissageId: string): Promise<void> {
  const [{ data: ms }, { data: es }] = await Promise.all([
    db.from('inv_missions').select('total_ht').eq('lissage_id', lissageId).eq('status', 'lissee'),
    db.from('inv_lissage_echeances').select('id, montant_ht, mission_id, rang').eq('lissage_id', lissageId).order('rang'),
  ])
  const total = round2(((ms ?? []) as { total_ht: number }[]).reduce((n, m) => n + Number(m.total_ht), 0))
  const echeances = (es ?? []) as { id: string; montant_ht: number; mission_id: string | null }[]
  const portees = round2(echeances.filter((e) => e.mission_id).reduce((n, e) => n + Number(e.montant_ht), 0))
  const restantes = echeances.filter((e) => !e.mission_id)
  if (restantes.length === 0) return
  const parts = repartir(Math.max(0, round2(total - portees)), restantes.length)
  for (const [i, e] of restantes.entries()) {
    if (Number(e.montant_ht) !== parts[i]) {
      await db.from('inv_lissage_echeances').update({ montant_ht: parts[i] }).eq('id', e.id).is('mission_id', null)
    }
  }
}

/**
 * Appelée à l'envoi des bordereaux, juste après la validation des managers :
 *  1. les missions validées de la période passent « lissée » ;
 *  2. les parts dues ce mois-ci sont portées sur la fiche bénéficiaire,
 *     une fois la période écoulée (le total est alors connu).
 * Rien n'est payé ici : les parts rejoignent le bordereau normal du mois.
 */
export async function appliquerLissages(
  db: Db,
  brand: string,
  cycle: { month: string; periodEnd: string },
  auteurId?: string | null
): Promise<{ lissees: number; portees: number }> {
  const { data: plans } = await db
    .from('inv_lissages')
    .select('id, provider_id, beneficiaire_id, titre, mois_debut_source, mois_fin_source')
    .eq('brand', brand)
    .eq('actif', true)
  let lissees = 0
  let portees = 0
  const now = new Date().toISOString()

  for (const plan of (plans ?? []) as {
    id: string
    provider_id: string
    beneficiaire_id: string
    titre: string
    mois_debut_source: string
    mois_fin_source: string
  }[]) {
    const { data: converties } = await db
      .from('inv_missions')
      .update({ status: 'lissee', lissage_id: plan.id })
      .eq('provider_id', plan.provider_id)
      .eq('status', 'approved')
      .is('statement_id', null)
      .is('invoice_id', null)
      .gte('start_date', `${plan.mois_debut_source}-01`)
      .lte('start_date', dernierJour(plan.mois_fin_source))
      .select('id')
    lissees += converties?.length ?? 0
    await recalculerLissage(db, plan.id)

    // La période n'est pas finie : le total n'est pas connu, rien à porter.
    if (cycle.month < plan.mois_fin_source) continue

    const { data: dues } = await db
      .from('inv_lissage_echeances')
      .select('id, rang, mois, montant_ht')
      .eq('lissage_id', plan.id)
      .is('mission_id', null)
      .lte('mois', cycle.month)
      .order('rang')
    if (!dues?.length) continue

    // Le manager et la catégorie viennent des missions étalées.
    const { data: modele } = await db
      .from('inv_missions')
      .select('manager_id, category_id')
      .eq('lissage_id', plan.id)
      .order('start_date')
      .limit(1)
      .maybeSingle()
    if (!modele) continue
    const { count: total } = await db
      .from('inv_lissage_echeances')
      .select('id', { count: 'exact', head: true })
      .eq('lissage_id', plan.id)
    const { data: source } = await db.from('inv_providers').select('legal_name').eq('id', plan.provider_id).maybeSingle()

    for (const e of dues as { id: string; rang: number; mois: string; montant_ht: number }[]) {
      const montant = Number(e.montant_ht)
      if (montant <= 0) continue
      const { data: mission } = await db
        .from('inv_missions')
        .insert({
          brand,
          provider_id: plan.beneficiaire_id,
          manager_id: modele.manager_id,
          category_id: modele.category_id,
          detail: `${plan.titre} — part ${e.rang}/${total ?? '?'}${source?.legal_name ? ` (missions de ${source.legal_name})` : ''}`,
          start_date: `${e.mois}-01`,
          end_date: `${e.mois}-01`,
          pricing_type: 'forfait_mission',
          quantity: 1,
          unit_amount_ht: montant,
          abatement_rate: 0,
          total_ht: montantVerse(montant, 0),
          status: 'approved',
          origin: 'manager',
          submitted_at: now,
          manager_approved_at: now,
          manager_approved_by: modele.manager_id,
          admin_approved_at: now,
          admin_approved_by: auteurId ?? null,
          lissage_id: plan.id,
        })
        .select('id')
        .single()
      if (!mission) continue
      // Une part, une mission : deux envois au même moment n'en font pas deux.
      const { data: prise } = await db
        .from('inv_lissage_echeances')
        .update({ mission_id: mission.id })
        .eq('id', e.id)
        .is('mission_id', null)
        .select('id')
      if (!prise?.length) await db.from('inv_missions').delete().eq('id', mission.id)
      else portees++
    }
  }
  return { lissees, portees }
}
