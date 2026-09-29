/**
 * Recherche d'un prestataire par son nom, partagée par les onglets de
 * « Prestations » (paramètre `?q=` de l'adresse).
 *
 * Insensible à la casse et aux accents, et chaque mot tapé doit apparaître :
 * « danial alm », « ALMGADMEE » ou « przybylo » retrouvent la bonne personne,
 * quel que soit l'ordre prénom / nom saisi dans sa fiche.
 */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function correspondPrestataire(nom: string | null | undefined, q: string | null | undefined): boolean {
  const mots = normaliser(q ?? '').split(' ').filter(Boolean)
  if (mots.length === 0) return true
  const cible = normaliser(nom ?? '')
  return mots.every((m) => cible.includes(m))
}
