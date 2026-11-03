/**
 * Quel mouvement bancaire un reçu justifie-t-il ?
 *
 * Trois indices : le montant, la date, le nom. Le montant décide — deux
 * paiements Anthropic du même jour ne se distinguent que par lui. La date
 * tolère cinq jours : une carte est débitée un à trois jours après l'achat,
 * et un reçu est parfois daté de l'émission plutôt que du paiement. Le nom
 * écarte le paiement voisin qui aurait le même montant par hasard.
 *
 * Aucun appel ici : ce fichier ne fait que comparer, pour être testé seul.
 */

export interface RecuLu {
  fournisseur: string | null
  marque: string | null
  date: string | null
  montant: number | null
  devise: string
}

export interface MouvementCandidat {
  id: number
  date: string
  libelle: string
  montant: number
  fournisseur: string | null
}

export interface Candidat {
  id: number
  date: string
  libelle: string
  montant: number
  /** Le même montant au centime (reçu en euros seulement). */
  montantExact: boolean
  /** Le nom du reçu se retrouve dans le libellé ou le fournisseur. */
  nomCoherent: boolean
  ecartJours: number
}

export const TOLERANCE_JOURS = 5

/** Ces mots-là ne disent rien de qui a été payé. */
const VIDES = new Set([
  'inc', 'llc', 'ltd', 'limited', 'sas', 'sarl', 'sa', 'gmbh', 'bv', 'pbc', 'corp', 'corporation',
  'company', 'co', 'the', 'and', 'ireland', 'europe', 'emea', 'france', 'international', 'technologies',
  'technology', 'services', 'payments', 'holdings', 'group', 'online', 'www', 'com', 'io', 'ai', 'app',
  'card', 'carte', 'paiement', 'payment', 'subscription', 'receipt', 'invoice', 'facture',
])

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Les mots qui nomment l'émetteur : « Anysphere, Inc. » → anysphere. */
export function motsDuNom(...noms: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      noms.flatMap((n) => norm(n).split(' ')).filter((m) => m.length >= 3 && !VIDES.has(m) && !/^\d+$/.test(m))
    ),
  ]
}

export function nomCoherent(recu: Pick<RecuLu, 'fournisseur' | 'marque'>, m: Pick<MouvementCandidat, 'libelle' | 'fournisseur'>): boolean {
  const mots = motsDuNom(recu.fournisseur, recu.marque)
  if (!mots.length) return false
  // On compare aussi sans espaces : « ELEVENLABS.IO » contre « Eleven Labs ».
  const cible = ` ${norm(m.libelle)} ${norm(m.fournisseur)} `
  const colle = cible.replace(/ /g, '')
  return mots.some((mot) => cible.includes(` ${mot} `) || cible.includes(` ${mot}`) || (mot.length >= 5 && colle.includes(mot)))
}

/**
 * La fourchette d'euros qu'une unité de devise peut donner une fois débitée.
 * Large pour le dollar (cours de 2026 et frais de la banque compris), mais
 * pas au point de proposer les cinquante paiements Anthropic de la semaine.
 */
function change(devise: string): [number, number] {
  if (devise === 'USD') return [0.82, 0.97]
  if (devise === 'GBP') return [1.08, 1.25]
  if (devise === 'CHF') return [0.98, 1.12]
  return [0.6, 1.6]
}

const jours = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000)

/**
 * Les mouvements qui pourraient porter ce reçu, du plus probable au moins.
 *
 * En euros : même montant au centime, ou nom cohérent à moins de 2 % près
 * (un pourboire ajouté, une régularisation de taxe) — ceux-là ne partent
 * jamais tout seuls. En devise : la banque a converti, le montant ne peut
 * pas coïncider ; on garde ce qui porte le bon nom dans une fourchette de
 * change large, et c'est toujours une main qui tranche.
 */
export function candidats(recu: RecuLu, mouvements: MouvementCandidat[]): Candidat[] {
  if (recu.montant === null || !recu.date) return []
  const euros = recu.devise === 'EUR'
  const out: Candidat[] = []
  for (const m of mouvements) {
    const ecart = jours(recu.date, m.date)
    if (ecart > TOLERANCE_JOURS) continue
    const coherent = nomCoherent(recu, m)
    const exact = euros && Math.abs(m.montant - recu.montant) < 0.005
    const proche = euros
      ? Math.abs(m.montant - recu.montant) <= Math.max(0.5, recu.montant * 0.02)
      : m.montant >= recu.montant * change(recu.devise)[0] && m.montant <= recu.montant * change(recu.devise)[1]
    if (exact || (coherent && proche)) {
      out.push({ id: m.id, date: m.date, libelle: m.libelle, montant: m.montant, montantExact: exact, nomCoherent: coherent, ecartJours: ecart })
    }
  }
  // En devise, le plus proche du cours moyen d'abord.
  const milieu = euros ? 1 : (change(recu.devise)[0] + change(recu.devise)[1]) / 2
  const ecartCours = (c: Candidat) => Math.abs(c.montant / recu.montant! - milieu)
  return out.sort(
    (a, b) =>
      Number(b.montantExact && b.nomCoherent) - Number(a.montantExact && a.nomCoherent) ||
      Number(b.montantExact) - Number(a.montantExact) ||
      Number(b.nomCoherent) - Number(a.nomCoherent) ||
      (euros ? 0 : ecartCours(a) - ecartCours(b)) ||
      a.ecartJours - b.ecartJours
  )
}

/**
 * Le seul cas qui part sans qu'on regarde : un reçu en euros, un seul
 * mouvement au même montant au centime dans la fenêtre, et ce mouvement
 * porte le nom du fournisseur. Deux paiements Anthropic identiques à deux
 * jours d'écart, c'est déjà un choix — il revient à quelqu'un.
 */
export function rapprochementSur(recu: RecuLu, liste: Candidat[]): Candidat | null {
  if (recu.devise !== 'EUR') return null
  const exacts = liste.filter((c) => c.montantExact)
  if (exacts.length !== 1 || !exacts[0].nomCoherent) return null
  return exacts[0]
}
