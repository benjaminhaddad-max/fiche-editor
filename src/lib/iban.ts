/**
 * Contrôle d'IBAN par la clé (norme ISO 13616, modulo 97).
 *
 * Un IBAN mal recopié passe le contrôle de forme mais fait échouer le
 * virement — et Pennylane refuse la fiche fournisseur entière. Mieux vaut le
 * dire au prestataire au moment où il le saisit.
 */
export function normaliserIban(valeur: string | null | undefined): string {
  return (valeur ?? '').replace(/\s+/g, '').toUpperCase()
}

export function ibanValide(valeur: string | null | undefined): boolean {
  const iban = normaliserIban(valeur)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false

  // On place les quatre premiers caractères à la fin, on remplace chaque
  // lettre par son rang + 9, et le reste de la division par 97 doit faire 1.
  const chiffres = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) =>
    String(c.charCodeAt(0) - 55)
  )
  let reste = 0
  for (const ch of chiffres) reste = (reste * 10 + Number(ch)) % 97
  return reste === 1
}

/** IBAN affichable par groupes de 4, comme sur un RIB. */
export function formaterIban(valeur: string | null | undefined): string {
  return normaliserIban(valeur).replace(/(.{4})/g, '$1 ').trim()
}
