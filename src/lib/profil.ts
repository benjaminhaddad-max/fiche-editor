import { isSalaried, type Provider } from '@/lib/types'

/**
 * Ce qui manque encore à une fiche pour qu'on puisse payer la personne.
 *
 * On crée un compte avec un nom et un email — deux secondes, depuis un
 * contrat ou un bon de mission. Le reste, c'est à la personne de le remplir
 * en arrivant : elle seule connaît son SIRET et son IBAN, et une saisie
 * faite par quelqu'un d'autre finit toujours par une erreur de virement.
 */
export function champsManquants(p: Pick<
  Provider,
  'employment_type' | 'legal_name' | 'siret' | 'address_line1' | 'postal_code' | 'city' | 'iban' | 'phone'
>): string[] {
  const manque: string[] = []
  if (!p.legal_name?.trim()) manque.push('votre nom ou raison sociale')
  if (!p.address_line1?.trim() || !p.postal_code?.trim() || !p.city?.trim()) manque.push('votre adresse')
  if (!p.phone?.trim()) manque.push('votre téléphone')
  // Un salarié ne facture pas : ni SIRET ni IBAN de facturation à demander,
  // son virement de paie passe par le dossier du social.
  if (!isSalaried(p.employment_type)) {
    if (!p.siret?.trim()) manque.push('votre numéro de SIRET')
    if (!p.iban?.trim()) manque.push('votre IBAN')
  }
  return manque
}

/** Peut-on émettre une facture pour cette personne ? */
export function ficheComplete(p: Parameters<typeof champsManquants>[0]): boolean {
  return champsManquants(p).length === 0
}
