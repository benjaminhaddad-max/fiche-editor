/**
 * La fiche d'un auteur payé en droits d'auteur : ce qui manque pour le
 * payer et le déclarer, et les justificatifs qui arrivent à échéance.
 *
 * Règles de travail de Nolwenn (13/11/2026). Rien ici ne modifie la fiche :
 * on calcule, l'écran affiche, l'administration décide.
 */
import { a1Expire, a1Valide, estFrance, modeleSuggere, type ProfilDA } from './net-auteur'

/** Délai d'alerte avant l'échéance d'un justificatif. Version de travail. */
export const JOURS_ALERTE = 30

export const STATUT_FICHE_LABEL: Record<string, string> = {
  complete: 'Complète',
  incomplete: 'Incomplète',
  a_valider: 'À valider',
}

export const MODELE_LABEL: Record<string, string> = {
  '1': 'Modèle 1 — ancien modèle (archivé)',
  '2': 'Modèle 2 — résident fiscal français (16,03 %)',
  '3': 'Modèle 3 — non-résident, affilié en France, sans A1 (6,5 %)',
  '4': 'Modèle 4 — avec formulaire A1 (aucun précompte)',
}

export interface FicheDA extends ProfilDA {
  legal_name?: string | null
  social_security_number?: string | null
  address_line1?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string | null
  iban?: string | null
  a1_issuer?: string | null
  da_profile_status?: string | null
}

export interface PieceDA {
  kind: string
  expires_at: string | null
}

export interface Alerte {
  niveau: 'rouge' | 'orange'
  texte: string
}

const plusJours = (jour: string, n: number) => {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Ce qu'il manque à la fiche, en clair. Liste vide : rien ne manque. */
export function manquesFicheDA(f: FicheDA, pieces: PieceDA[], jour?: string): string[] {
  const j = jour ?? new Date().toISOString().slice(0, 10)
  const manques: string[] = []
  if (!f.social_security_number) manques.push('numéro de sécurité sociale')
  if (!f.address_line1 || !f.postal_code || !f.city) manques.push('adresse complète')
  if (!f.country) manques.push('pays de l’adresse')
  if (!f.tax_residence_country) manques.push('pays de résidence fiscale')
  if (!f.iban) manques.push('IBAN')

  const nonResident = f.tax_residence_country && !estFrance(f.tax_residence_country)
  if (nonResident && !pieces.some((p) => p.kind === 'residence_fiscale')) {
    manques.push('attestation de résidence fiscale')
  }
  const modele = f.da_model ?? modeleSuggere(f, j).modele?.toString()
  if (modele === '4') {
    if (!f.a1_number || !f.a1_start) manques.push('numéro et date de début du A1')
    if (!f.a1_issuer) manques.push('organisme du A1')
    if (!pieces.some((p) => p.kind === 'a1')) manques.push('copie du formulaire A1')
  }
  return manques
}

/** Le statut que la fiche devrait porter, d'après ce qui manque. */
export function statutCalcule(f: FicheDA, pieces: PieceDA[], jour?: string): 'complete' | 'incomplete' | 'a_valider' {
  if (manquesFicheDA(f, pieces, jour).length > 0) return 'incomplete'
  // Modèle 3 et 4 : règles non encore validées par le comptable.
  const j = jour ?? new Date().toISOString().slice(0, 10)
  const m = f.da_model ?? modeleSuggere(f, j).modele?.toString()
  return m === '3' || m === '4' ? 'a_valider' : 'complete'
}

/**
 * Les alertes de la fiche : justificatif expiré ou proche de l'échéance,
 * A1 expiré (repli en modèle 3), modèle posé qui contredit la résidence,
 * adresse à l'étranger sans résidence fiscale renseignée.
 */
export function alertesFicheDA(f: FicheDA, pieces: (PieceDA & { label?: string | null })[], jour?: string): Alerte[] {
  const j = jour ?? new Date().toISOString().slice(0, 10)
  const limite = plusJours(j, JOURS_ALERTE)
  const alertes: Alerte[] = []
  const nom = (k: string) => (k === 'a1' ? 'Formulaire A1' : k === 'residence_fiscale' ? 'Attestation de résidence fiscale' : 'Justificatif')

  for (const p of pieces) {
    if (!p.expires_at) continue
    if (p.expires_at < j) alertes.push({ niveau: 'rouge', texte: `${nom(p.kind)} expiré(e) depuis le ${fr(p.expires_at)}.` })
    else if (p.expires_at <= limite) alertes.push({ niveau: 'orange', texte: `${nom(p.kind)} expire le ${fr(p.expires_at)}.` })
  }
  if (f.a1_end && a1Valide(f, j) && f.a1_end <= limite) {
    alertes.push({ niveau: 'orange', texte: `Le A1 se termine le ${fr(f.a1_end)} : passage en modèle 3 ensuite.` })
  }
  if (a1Expire(f, j) && (f.da_model === '4' || (!f.da_model && f.tax_residence_country && !estFrance(f.tax_residence_country)))) {
    alertes.push({ niveau: 'rouge', texte: 'A1 absent ou expiré : les notes passent en modèle 3.' })
  }
  const suggere = modeleSuggere(f, j).modele
  if (f.da_model && suggere && f.da_model !== String(suggere) && f.da_model !== '1') {
    alertes.push({
      niveau: 'orange',
      texte: `Modèle ${f.da_model} posé, mais la résidence fiscale et le A1 appellent le modèle ${suggere}.`,
    })
  }
  if (f.da_model === '1') alertes.push({ niveau: 'orange', texte: 'Modèle 1 archivé : il se lit comme le 2. Choisir un modèle actuel.' })
  if (!f.tax_residence_country && f.country && !estFrance(f.country)) {
    alertes.push({
      niveau: 'orange',
      texte: `Adresse à l’étranger (${f.country}) sans résidence fiscale renseignée : le modèle 2 s’applique par défaut.`,
    })
  }
  return alertes
}

function fr(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
