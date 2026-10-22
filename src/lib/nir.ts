/**
 * Le numéro de sécurité sociale est-il bien formé ?
 *
 * Quinze caractères : le sexe, l'année et le mois de naissance, le
 * département, la commune, un rang, puis une clé de deux chiffres égale à
 * 97 moins le reste de la division des treize premiers par 97.
 *
 * La Corse fait exception : son département s'écrit 2A ou 2B, qui valent
 * 19 et 18 dans le calcul de la clé.
 */
export function nirValide(v: string): boolean {
  const s = v.replace(/\s/g, '').toUpperCase()
  if (!/^[12]\d{4}(\d{2}|2[AB])\d{8}$/.test(s)) return false
  const corps = s.slice(0, 13).replace('2A', '19').replace('2B', '18')
  if (!/^\d{13}$/.test(corps)) return false
  return Number(s.slice(13)) === 97 - (Number(corps) % 97)
}

/** Présentation lisible : 1 80 01 75 056 012 89. */
export function nirFormate(v: string): string {
  const s = v.replace(/\s/g, '').toUpperCase()
  if (s.length !== 15) return s
  return [s.slice(0, 1), s.slice(1, 3), s.slice(3, 5), s.slice(5, 7), s.slice(7, 10), s.slice(10, 13), s.slice(13)].join(' ')
}
