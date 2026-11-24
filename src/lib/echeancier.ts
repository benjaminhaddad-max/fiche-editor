/**
 * Échéancier de paiement selon le type d'intervenant — demande de Nolwenn
 * (Medibox, 9 novembre 2026).
 *
 * Les professeurs sont payés chaque mois. Les tuteurs et les coachs, non :
 * au premier semestre ils ont trois versements — fin septembre, fin octobre,
 * rien en novembre, fin décembre. Leur travail de novembre se paie donc avec
 * celui de décembre.
 *
 * Concrètement : le mois « sans versement », on ne leur établit pas de
 * bordereau. Leurs prestations validées restent en attente, sans bordereau
 * ni facture, et le bordereau de décembre les reprend toutes (il prend tout
 * ce qui est validé jusqu'à la fin de son mois). Rien n'est perdu, rien
 * n'est compté deux fois.
 *
 * La règle ne vaut que pour Medibox : Diploma et Linova n'ont pas de
 * tuteurs étiquetés ainsi, et leurs paiements restent mensuels.
 */

export type ProfilEcheancier = 'mensuel' | 'tuteur_coach'

/**
 * Mois (1 à 12) où les tuteurs et coachs ne sont pas payés. Le travail de
 * ces mois-là part avec le mois suivant.
 *
 * Seul novembre est connu (S1). Le S2 n'a pas encore été précisé par
 * Nolwenn : tant qu'il ne l'est pas, les autres mois restent mensuels.
 */
export const MOIS_SANS_VERSEMENT_TUTEURS: readonly number[] = [11]

/** Écoles où l'échéancier tuteurs/coachs s'applique. */
export const ECOLES_ECHEANCIER: readonly string[] = ['medibox']

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Ce qu'on sait de la personne : sa fiche (type d'intervenant, étiquettes),
 * ou, à défaut, ses seules étiquettes.
 */
export type QuiEcheancier =
  | readonly string[]
  | null
  | undefined
  | {
      intervenant_type?: string | null
      tags?: readonly string[] | null
      /** Groupe d'échéancier de la fiche : s'il y en a un, il remplace la règle par défaut. */
      groupe?: { mois_sans_versement: readonly number[] } | null
    }

/**
 * Tuteur ou coach ? Le type d'intervenant de la fiche fait foi (champ posé le
 * 19/11/2026). Sans type, on lit les étiquettes saisies à la main :
 * « tuteur », « Tutrice », « Coach Medibox »… On lit le mot, pas
 * l'orthographe exacte. Quelqu'un qui est aussi « prof » reste payé chaque
 * mois : on ne retarde pas un cours.
 */
export function profilEcheancier(qui: QuiEcheancier): ProfilEcheancier {
  if (qui && !Array.isArray(qui)) {
    const fiche = qui as { intervenant_type?: string | null; tags?: readonly string[] | null }
    if (fiche.intervenant_type) {
      return fiche.intervenant_type === 'tuteur' || fiche.intervenant_type === 'coach'
        ? 'tuteur_coach'
        : 'mensuel'
    }
    return profilEcheancier(fiche.tags ?? null)
  }
  const mots = ((qui as readonly string[] | null | undefined) ?? []).map(sansAccents)
  if (mots.some((t) => /\b(prof|professeur|professeure|enseignant)/.test(t))) return 'mensuel'
  if (mots.some((t) => /\b(tut(eur|rice)|coach)/.test(t))) return 'tuteur_coach'
  return 'mensuel'
}

/**
 * Faut-il établir le bordereau de ce mois ('YYYY-MM') pour ce prestataire ?
 * Non pour un tuteur ou un coach Medibox en novembre.
 */
export function versementCeMois(
  cycleMonth: string,
  qui: QuiEcheancier,
  brand: string | null | undefined
): boolean {
  // Un groupe d'échéancier prime : ses mois sans versement valent pour tous
  // ses membres, quelle que soit l'école ou le type d'intervenant.
  if (qui && !Array.isArray(qui)) {
    const groupe = (qui as { groupe?: { mois_sans_versement: readonly number[] } | null }).groupe
    if (groupe) return !groupe.mois_sans_versement.includes(Number(cycleMonth.slice(5, 7)))
  }
  if (!brand || !ECOLES_ECHEANCIER.includes(brand)) return true
  if (profilEcheancier(qui) !== 'tuteur_coach') return true
  const mois = Number(cycleMonth.slice(5, 7))
  return !MOIS_SANS_VERSEMENT_TUTEURS.includes(mois)
}

/** Le mois ('YYYY-MM') où sera payé le travail d'un mois donné. */
export function moisDeVersement(
  cycleMonth: string,
  qui: QuiEcheancier,
  brand: string | null | undefined
): string {
  let [an, mois] = cycleMonth.split('-').map(Number)
  for (let i = 0; i < 12; i++) {
    const m = `${an}-${String(mois).padStart(2, '0')}`
    if (versementCeMois(m, qui, brand)) return m
    mois++
    if (mois > 12) {
      mois = 1
      an++
    }
  }
  return cycleMonth
}
