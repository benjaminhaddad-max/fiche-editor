import { activeBrandId } from '@/lib/brand/actif'
import { estAcquise, lignesPaie, type LignePaie } from '@/lib/paie'
import { createServiceClient } from '@/lib/supabase/service'
import { etatDispense, type Dispense, type EtatDispense } from './dispense'
import { comptePartage } from './exceptions'
import { maintenantParis } from './calendrier'
import { controler, lireSaisie, type Anomalie, type Salarie, type Saisie } from './saisie'
import { groupeDuProfil, type GroupeSocial, type ProfilSocial } from './types'

export const COLONNES_FICHE =
  'id, user_id, legal_name, phone, employment_type, silae_matricule, social_profile, social_entry_date, social_exit_date, social_a_verifier, social_sans_relance, user:inv_users!inv_providers_user_id_fkey(full_name, email, phone, is_active)'

interface FicheBrute {
  id: string
  user_id: string | null
  legal_name: string
  phone: string | null
  silae_matricule: string | null
  social_profile: ProfilSocial | null
  social_entry_date: string | null
  social_exit_date: string | null
  social_a_verifier?: boolean
  social_sans_relance?: boolean
  user: { full_name: string; email: string; phone: string | null; is_active: boolean } | null
}

export function salarieDeLaFiche(f: FicheBrute): Salarie {
  // Compte partagé voulu (matricule 00048) : le salarié garde son nom, le
  // titulaire du compte est seulement « celui qui remplit ».
  const partage = comptePartage(f.silae_matricule)
  return {
    providerId: f.id,
    userId: f.user_id,
    nom: partage ? f.legal_name : (f.user?.full_name ?? f.legal_name),
    declarant: partage ? partage.declarant : null,
    sansRelance: !!f.social_sans_relance,
    email: f.user?.email ?? null,
    // Le SMS part au numéro de la fiche, sinon à celui du compte.
    telephone: f.phone || f.user?.phone || null,
    profil: f.social_profile ?? 'fixe',
    matricule: f.silae_matricule,
    entree: f.social_entry_date,
    sortie: f.social_exit_date,
    aVerifier: !!f.social_a_verifier && !partage,
  }
}

/** Tous les salariés de l'école (fiches rattachées à l'Espace Social). */
export async function salaries(): Promise<Salarie[]> {
  const { data } = await createServiceClient()
    .from('inv_providers')
    .select(COLONNES_FICHE)
    .eq('brand', await activeBrandId())
    .not('social_profile', 'is', null)
  return ((data ?? []) as unknown as FicheBrute[])
    .filter((f) => !f.user || f.user.is_active)
    .map(salarieDeLaFiche)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/**
 * Présent ce mois-ci : entré avant la fin du mois, pas sorti avant son
 * début. Une sortie dans le mois est encore sollicitée (solde de tout
 * compte), plus le mois suivant.
 */
export function presentLeMois(s: Salarie, period: string): boolean {
  const debut = `${period}-01`
  const [y, m] = period.split('-').map(Number)
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  if (s.entree && s.entree > fin) return false
  if (s.sortie && s.sortie < debut) return false
  return true
}

export interface LigneSocial {
  salarie: Salarie
  groupe: GroupeSocial
  saisie: Saisie
  /** Net des missions validées par les managers (vacataires). */
  netMissions: number
  /** Le net des missions acquises à l'instant, avant tout figeage. */
  netEnCours: number
  missions: LignePaie[]
  /** Missions déclarées qu'aucun manager n'a encore validées. */
  missionsEnAttente: number
  anomalies: Anomalie[]
  /** La dernière dispense de mutuelle signée, et où elle en est aujourd'hui. */
  dispense: Dispense | null
  etatDispense: EtatDispense
}

/** La dernière dispense signée de chaque fiche (la plus récente fait foi). */
export async function dernieresDispenses(ids?: string[]): Promise<Map<string, Dispense>> {
  let q = createServiceClient()
    .from('inv_mutuelle_dispenses')
    .select('id, provider_id, situation, organisme, echeance, signe_le, signature, document')
    .order('signed_at', { ascending: false })
  if (ids) q = q.in('provider_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const { data } = await q
  const out = new Map<string, Dispense>()
  for (const d of (data ?? []) as (Dispense & { provider_id: string })[]) if (!out.has(d.provider_id)) out.set(d.provider_id, d)
  return out
}

/** Missions d'un mois pour les vacataires, par fiche. */
async function missionsParFiche(period: string): Promise<Map<string, LignePaie[]>> {
  const [y, m] = period.split('-').map(Number)
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const lignes = await lignesPaie(`${period}-01`, fin)
  const out = new Map<string, LignePaie[]>()
  for (const l of lignes) out.set(l.providerId, [...(out.get(l.providerId) ?? []), l])
  return out
}

/** Le tableau du mois : chaque salarié présent, sa saisie, ses contrôles. */
export async function tableauDuMois(period: string, groupe?: GroupeSocial): Promise<LigneSocial[]> {
  const db = createServiceClient()
  const [tous, { data: saisies }, missions, dispenses] = await Promise.all([
    salaries(),
    db.from('inv_payroll_inputs').select('*').eq('period', period),
    missionsParFiche(period),
    dernieresDispenses(),
  ])
  const aujourdhui = maintenantParis().date
  const parFiche = new Map((saisies ?? []).map((x) => [x.provider_id as string, x as Record<string, unknown>]))
  return tous
    .filter((s) => presentLeMois(s, period))
    .filter((s) => !groupe || groupeDuProfil(s.profil) === groupe)
    .map((s) => {
      const saisie = lireSaisie(parFiche.get(s.providerId), period)
      const ms = s.profil === 'vacataire' ? (missions.get(s.providerId) ?? []) : []
      const acquises = ms.filter((l) => estAcquise(l.status))
      const live = Math.round(acquises.reduce((t, l) => t + l.total, 0) * 100) / 100
      // Une fois validé, le net est figé : c'est lui qui part dans le fichier.
      const netMissions = saisie.missions_total ?? live
      const dispense = dispenses.get(s.providerId) ?? null
      const etat = etatDispense(dispense, aujourdhui)
      return {
        salarie: s,
        groupe: groupeDuProfil(s.profil),
        saisie,
        netMissions,
        netEnCours: live,
        missions: ms,
        missionsEnAttente: ms.length - acquises.length,
        anomalies: controler(s, saisie, netMissions, etat),
        dispense,
        etatDispense: etat,
      }
    })
}

export async function ligneDuSalarie(providerId: string, period: string): Promise<LigneSocial | null> {
  const lignes = await tableauDuMois(period)
  return lignes.find((l) => l.salarie.providerId === providerId) ?? null
}
