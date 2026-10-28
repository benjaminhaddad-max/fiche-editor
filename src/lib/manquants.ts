import { cycleForDate, todayParis, type BillingCycle } from '@/lib/cycle'
import { champsManquants } from '@/lib/profil'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { echeancesProposees } from '@/lib/echeances'
import type { Employment, Provider } from '@/lib/types'

export interface Manquant {
  providerId: string
  userId: string
  nom: string
  email: string
  employment: Employment
  /** Ce qui empêche de le payer, dit à la troisième personne. */
  manque: string[]
  /** Jamais entré : ni lien consommé, ni fiche complétée. */
  jamaisVenu: boolean
  /** Adresse dont on sait qu'elle ne reçoit rien. */
  injoignable: string | null
  /** Dernier mois déclaré, 'YYYY-MM', ou null s'il n'a jamais rien déclaré. */
  dernierMois: string | null
  /** Une échéance de contrat l'attend : il n'a rien à saisir, juste à la porter. */
  echeance: { id: string; label: string; montant: number } | null
  responsable: string | null
}

/** Treize mois en arrière, bornés au premier du mois. */
function reculDUnAn(cycle: BillingCycle): string {
  const [an, mois] = cycle.periodStart.split('-').map(Number)
  return new Date(Date.UTC(an - 1, mois - 2, 1)).toISOString().slice(0, 10)
}

/** « votre IBAN » s'adresse à l'intéressé ; cette page parle de lui. */
const aLaTroisiemePersonne = (m: string) => m.replace(/^votre /, '').replace(/^vos /, '')

interface FicheBrute extends Pick<
  Provider,
  'id' | 'employment_type' | 'legal_name' | 'siret' | 'address_line1' | 'postal_code'
  | 'city' | 'iban' | 'phone' | 'social_security_number' | 'onboarding_complete'
> {
  default_manager_id: string | null
}

/**
 * Qui n'a rien déclaré ce mois-ci, nommément.
 *
 * Le compteur « 23 personnes sur 35 » dit qu'il manque du monde sans dire
 * qui : il fallait ouvrir les fiches une à une pour le savoir. Nolwenn l'a
 * demandé pour Medibox, où douze personnes manquaient à l'appel.
 *
 * Toutes les absences ne se valent pas, et c'est tout l'intérêt de la
 * liste : quelqu'un qui déclare chaque mois et qui a oublié celui-ci se
 * relance ; un compte ouvert et jamais utilisé ne se relance pas, il se
 * range. Et une échéance de contrat qui attend d'être portée n'est pas une
 * absence du tout — la personne n'a rien à saisir.
 */
export async function prestatairesSansDeclaration(
  filtre: { managerId?: string } = {}
): Promise<Manquant[]> {
  const cycle = cycleForDate(todayParis())
  const db = createServiceClient()
  const marque = await activeBrandId()

  // Un manager ne voit que les siens : rattachés par défaut, ou dont il a
  // déjà validé une prestation. Même règle que la relance.
  let siens: Set<string> | null = null
  if (filtre.managerId) {
    const [{ data: parDefaut }, { data: parMission }] = await Promise.all([
      db.from('inv_providers').select('id').eq('brand', marque).eq('default_manager_id', filtre.managerId),
      db.from('inv_missions').select('provider_id').eq('brand', marque).eq('manager_id', filtre.managerId),
    ])
    siens = new Set([
      ...(parDefaut ?? []).map((f) => f.id as string),
      ...(parMission ?? []).map((m) => m.provider_id as string),
    ])
  }

  const [{ data: gens }, { data: invitations }, { data: toutes }, { data: responsables }, echeances] =
    await Promise.all([
      db
        .from('inv_users')
        .select(
          'id, email, full_name, email_unreachable_reason, provider:inv_providers!inv_providers_user_id_fkey(id, onboarding_complete, employment_type, legal_name, siret, iban, address_line1, postal_code, city, phone, social_security_number, default_manager_id)'
        )
        .eq('brand', marque)
        .eq('role', 'prestataire')
        .eq('is_active', true),
      db.from('inv_invitations').select('user_id, exchanges'),
      // Treize mois d'historique, pas seulement le mois en cours : c'est lui
      // qui distingue un oubli d'un compte qui n'a jamais servi. Au-delà
      // d'un an, « jamais déclaré » et « plus déclaré depuis longtemps »
      // appellent la même décision, et tout relire coûterait cher.
      db
        .from('inv_missions')
        .select('provider_id, start_date')
        .eq('brand', marque)
        .gte('start_date', reculDUnAn(cycle)),
      db.from('inv_users').select('id, full_name').eq('brand', marque).in('role', ['manager', 'admin']),
      echeancesProposees(cycle.periodEnd, filtre.managerId ? { managerId: filtre.managerId } : {}),
    ])

  const venus = new Set(
    (invitations ?? []).filter((i) => Number(i.exchanges ?? 0) > 0).map((i) => i.user_id as string)
  )
  const nomDuResponsable = new Map((responsables ?? []).map((u) => [u.id as string, u.full_name as string]))

  const dernierMois = new Map<string, string>()
  const aDeclare = new Set<string>()
  for (const m of toutes ?? []) {
    const id = m.provider_id as string
    const mois = String(m.start_date).slice(0, 7)
    if (mois >= cycle.periodStart.slice(0, 7) && mois <= cycle.periodEnd.slice(0, 7)) aDeclare.add(id)
    const vu = dernierMois.get(id)
    if (!vu || mois > vu) dernierMois.set(id, mois)
  }

  const parProvider = new Map(echeances.map((e) => [e.providerId, e]))

  const out: Manquant[] = []
  for (const u of (gens ?? []) as unknown as {
    id: string
    email: string
    full_name: string
    email_unreachable_reason: string | null
    provider: FicheBrute[] | FicheBrute | null
  }[]) {
    const fiche = Array.isArray(u.provider) ? u.provider[0] : u.provider
    if (!fiche) continue
    if (siens && !siens.has(fiche.id)) continue
    if (aDeclare.has(fiche.id)) continue

    const e = parProvider.get(fiche.id)
    const vu = dernierMois.get(fiche.id) ?? null
    out.push({
      providerId: fiche.id,
      userId: u.id,
      nom: fiche.legal_name || u.full_name,
      email: u.email,
      employment: fiche.employment_type,
      manque: champsManquants(fiche).map(aLaTroisiemePersonne),
      jamaisVenu: !venus.has(u.id) && !fiche.onboarding_complete,
      injoignable: u.email_unreachable_reason,
      // Le mois en cours est exclu par aDeclare : ce qui reste est antérieur.
      dernierMois: vu,
      echeance: e ? { id: e.id, label: e.label, montant: e.montant } : null,
      responsable: fiche.default_manager_id ? nomDuResponsable.get(fiche.default_manager_id) ?? null : null,
    })
  }

  // Ceux qui déclarent d'habitude d'abord : c'est là que la relance sert.
  return out.sort((a, b) => {
    if (Boolean(a.echeance) !== Boolean(b.echeance)) return a.echeance ? -1 : 1
    if ((a.dernierMois ?? '') !== (b.dernierMois ?? '')) return (b.dernierMois ?? '').localeCompare(a.dernierMois ?? '')
    return a.nom.localeCompare(b.nom, 'fr')
  })
}

/**
 * Combien de personnes manquent, sans construire la liste.
 *
 * Le compteur s'affiche sur chaque page du mois : il ne peut pas se payer
 * la relecture de l'historique et des échéances que la liste, elle, détaille.
 */
export async function nombreSansDeclaration(filtre: { managerId?: string } = {}): Promise<number> {
  const cycle = cycleForDate(todayParis())
  const db = createServiceClient()
  const marque = await activeBrandId()

  const [{ data: gens }, { data: mois }] = await Promise.all([
    db
      .from('inv_providers')
      .select('id, default_manager_id, user:inv_users!inv_providers_user_id_fkey!inner(is_active, role)')
      .eq('brand', marque)
      .eq('user.role', 'prestataire')
      .eq('user.is_active', true),
    db
      .from('inv_missions')
      .select('provider_id, manager_id')
      .eq('brand', marque)
      .gte('start_date', cycle.periodStart)
      .lte('start_date', cycle.periodEnd),
  ])

  const aDeclare = new Set((mois ?? []).map((m) => m.provider_id as string))
  let siens: Set<string> | null = null
  if (filtre.managerId) {
    const { data: parMission } = await db
      .from('inv_missions')
      .select('provider_id')
      .eq('brand', marque)
      .eq('manager_id', filtre.managerId)
    siens = new Set((parMission ?? []).map((m) => m.provider_id as string))
  }

  return (gens ?? []).filter((f) => {
    if (aDeclare.has(f.id as string)) return false
    if (!siens) return true
    return siens.has(f.id as string) || f.default_manager_id === filtre.managerId
  }).length
}
