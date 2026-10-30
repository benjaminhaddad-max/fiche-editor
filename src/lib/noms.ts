/**
 * Comparer deux écritures d'un même nom.
 *
 * Une personne porte deux noms dans l'outil : celui de son compte
 * (inv_users.full_name, « Prof Agnès ») et celui de sa fiche
 * (inv_providers.legal_name, « Agnès CANDIOTTI »). Les écrans de l'équipe
 * montrent le premier, les bordereaux et les factures le second. Il faut donc
 * savoir dire quand les deux désignent la même chose — et quand deux
 * personnes différentes portent le même nom.
 */
export function cleNom(nom: string | null | undefined): string {
  if (!nom) return ''
  return nom
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** « caroline » et « Caroline » sont le même nom ; « Clarisse » et « PLATEL Clarisse » non. */
export function memeNom(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = cleNom(a)
  return x !== '' && x === cleNom(b)
}

/**
 * Ce qui ne distingue personne : le titre qu'on met devant un prénom et la
 * forme juridique qu'on colle derrière. « Prof Faustine » et « Faustine »
 * désignent deux personnes qu'on confondra, pas deux noms différents.
 */
const QUALIFICATIFS = new Set([
  'prof', 'coach', 'dr', 'mr', 'm', 'mme', 'monsieur', 'madame',
  'ei', 'eirl', 'eurl', 'sarl', 'sas', 'sasu', 'me',
])

/** Les mots qui nomment vraiment quelqu'un, dans son nom de compte ou de fiche. */
export function motsNom(nom: string | null | undefined): Set<string> {
  return new Set(cleNom(nom).split(' ').filter((mot) => mot !== '' && !QUALIFICATIFS.has(mot)))
}

const inclusDans = (petit: Set<string>, grand: Set<string>) =>
  petit.size > 0 && [...petit].every((mot) => grand.has(mot))

/**
 * Deux personnes qu'on risque de confondre au moment de payer.
 *
 * On passe chacune avec tous les noms sous lesquels elle apparaît, et on
 * répond oui dès qu'un nom de l'une est contenu dans un nom de l'autre :
 * « Mathilde » contre « Mathilde », mais aussi « Faustine » contre « Prof
 * Faustine ». Rien ne les sépare à l'écran, et c'est là que le virement part
 * au mauvais compte.
 */
export function nomsConfondables(unes: (string | null | undefined)[], autres: (string | null | undefined)[]): boolean {
  const a = unes.map(motsNom).filter((s) => s.size > 0)
  const b = autres.map(motsNom).filter((s) => s.size > 0)
  return a.some((x) => b.some((y) => inclusDans(x, y) || inclusDans(y, x)))
}
