import { activeBrandId } from '@/lib/brand/actif'
import type { BillingCycle } from '@/lib/cycle'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

type Db = ReturnType<typeof createServiceClient>

/** Heure de Paris à laquelle part l'alerte : 4 h avant la fin du dernier jour de vérification. */
export const HEURE_VEILLE = 20

/** Ce qu'un manager n'a pas encore validé, prestataire par prestataire. */
export interface AttenteManager {
  managerId: string
  nom: string
  email: string | null
  n: number
  total: number
  prestataires: { nom: string; n: number; total: number }[]
}

/** Une facture commencée par le prestataire, jamais transmise (il manque son PDF). */
export interface FactureSansPdf {
  id: string
  prestataire: string
  number: string
  total: number
  depuis: string
}

/** L'heure qu'il est à Paris, de 0 à 23. */
export function heureParis(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(now))
}

/**
 * Les prestations du cycle encore « à valider », regroupées par manager.
 *
 * Ce sont elles qui décident du bordereau : ce qui n'est pas validé le
 * dernier soir n'y entre pas, et le prestataire n'est pas payé ce mois-ci.
 */
export async function prestationsEnAttente(db: Db, cycle: BillingCycle): Promise<AttenteManager[]> {
  const { data } = await db
    .from('inv_missions')
    .select(
      `manager_id, total_ht,
       provider:inv_providers(legal_name),
       manager:inv_users!inv_missions_manager_id_fkey(full_name, email)`
    )
    .eq('brand', await activeBrandId())
    .eq('status', 'submitted')
    .lte('start_date', cycle.periodEnd)

  const parManager = new Map<string, AttenteManager & { parPresta: Map<string, { n: number; total: number }> }>()
  for (const m of (data ?? []) as unknown as {
    manager_id: string | null
    total_ht: number
    provider: { legal_name: string } | null
    manager: { full_name: string; email: string } | null
  }[]) {
    const id = m.manager_id ?? 'sans-manager'
    const g =
      parManager.get(id) ??
      {
        managerId: id,
        nom: m.manager?.full_name ?? 'Sans manager',
        email: m.manager?.email ?? null,
        n: 0,
        total: 0,
        prestataires: [],
        parPresta: new Map(),
      }
    g.n++
    g.total += Number(m.total_ht)
    const nom = m.provider?.legal_name ?? '—'
    const p = g.parPresta.get(nom) ?? { n: 0, total: 0 }
    g.parPresta.set(nom, { n: p.n + 1, total: p.total + Number(m.total_ht) })
    parManager.set(id, g)
  }

  return [...parManager.values()]
    .map(({ parPresta, ...g }) => ({
      ...g,
      total: round2(g.total),
      prestataires: [...parPresta.entries()]
        .map(([nom, p]) => ({ nom, n: p.n, total: round2(p.total) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Les factures restées « en attente du PDF ».
 *
 * Qui fournit sa propre facture la crée, puis doit déposer son PDF : tant
 * qu'il ne l'a pas fait, elle n'est ni transmise ni validée, et la tâche du
 * matin ne la voit pas. En novembre 2026, celles de Clément Chevalier et de
 * Dounia Yazidi sont restées ainsi une semaine, sans que personne le sache.
 */
export async function facturesSansPdf(db: Db): Promise<FactureSansPdf[]> {
  const { data } = await db
    .from('inv_invoices')
    .select('id, number, total_ttc, issued_at, provider:inv_providers(legal_name)')
    .eq('brand', await activeBrandId())
    .eq('status', 'issued')
    .order('issued_at', { ascending: true })
  return ((data ?? []) as unknown as {
    id: string
    number: string
    total_ttc: number
    issued_at: string
    provider: { legal_name: string } | null
  }[]).map((f) => ({
    id: f.id,
    prestataire: f.provider?.legal_name ?? '—',
    number: f.number,
    total: Number(f.total_ttc),
    depuis: f.issued_at,
  }))
}

/**
 * La veille de clôture, à 20 h : à Ben (et aux admins de l'école) ce que
 * chaque manager n'a pas encore validé ; à chaque manager, sa propre liste.
 */
export async function alerterVeilleVerification(db: Db, cycle: BillingCycle) {
  const attente = await prestationsEnAttente(db, cycle)
  const sansPdf = await facturesSansPdf(db)
  if (attente.length === 0 && sansPdf.length === 0) return { managers: 0, admins: 0, sansPdf: 0 }

  const t = await templates()
  const { data: admins } = await db
    .from('inv_users')
    .select('email, full_name')
    .in('brand', [await activeBrandId(), 'all'])
    .eq('role', 'admin')
    .eq('is_active', true)
  for (const a of (admins ?? []) as { email: string; full_name: string }[]) {
    await deliver({
      to: { email: a.email, name: a.full_name },
      ...t.veilleVerificationAdmin({ adminName: a.full_name, label: cycle.label, reviewEnd: cycle.reviewEnd, attente, sansPdf }),
      template: 'veille_verification_admin',
    })
  }

  let managers = 0
  for (const g of attente) {
    if (!g.email) continue
    await deliver({
      to: { email: g.email, name: g.nom },
      ...t.veilleVerificationManager({ name: g.nom, label: cycle.label, attente: g }),
      template: 'veille_verification_manager',
      entityType: 'user',
      entityId: g.managerId,
    })
    managers++
  }
  return { managers, admins: admins?.length ?? 0, prestations: attente.reduce((s, g) => s + g.n, 0), sansPdf: sansPdf.length }
}
