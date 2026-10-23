import { estAuteur, isSalaried, type Provider } from '@/lib/types'

/**
 * Ce qui manque encore à une fiche pour qu'on puisse payer la personne.
 *
 * On crée un compte avec un nom et un email — deux secondes, depuis un
 * contrat ou un bon de mission. Le reste, c'est à la personne de le remplir
 * en arrivant : elle seule connaît son SIRET et son IBAN, et une saisie
 * faite par quelqu'un d'autre finit toujours par une erreur de virement.
 */
/** Le SIRET est-il encore à venir ? */
export const siretEnCours = (siret: string | null | undefined): boolean =>
  /^en\s*cours$/i.test((siret ?? '').trim())

export function champsManquants(p: Pick<
  Provider,
  | 'employment_type' | 'legal_name' | 'siret' | 'address_line1' | 'postal_code' | 'city' | 'iban' | 'phone'
  | 'social_security_number'
>): string[] {
  const manque: string[] = []
  if (!p.legal_name?.trim()) manque.push('votre nom ou raison sociale')
  if (!p.address_line1?.trim() || !p.postal_code?.trim() || !p.city?.trim()) manque.push('votre adresse')
  if (!p.phone?.trim()) manque.push('votre téléphone')
  // Un salarié ne facture pas : ni SIRET ni IBAN de facturation à demander,
  // son virement de paie passe par le dossier du social.
  if (estAuteur(p.employment_type)) {
    // Pas de SIRET : un artiste-auteur n'est pas tenu d'en avoir. En
    // revanche son numéro de sécurité sociale est indispensable — c'est
    // par lui que l'Urssaf identifie l'auteur dans la déclaration de
    // précompte que la société dépose pour lui.
    if (!p.iban?.trim()) manque.push('votre IBAN')
    if (!p.social_security_number?.trim()) manque.push('votre numéro de sécurité sociale')
  } else if (!isSalaried(p.employment_type)) {
    // « En cours » est accepté à la signature du contrat — l'auto-entreprise
    // se crée souvent après. Mais une facture ne peut pas sortir sans le
    // numéro définitif : c'est ce que le contrat promet, et c'est la
    // mention obligatoire de l'émetteur.
    if (!p.siret?.trim()) manque.push('votre numéro de SIRET')
    else if (siretEnCours(p.siret)) manque.push('votre numéro de SIRET définitif (il est encore « en cours »)')
    if (!p.iban?.trim()) manque.push('votre IBAN')
  }
  return manque
}

/** Peut-on émettre une facture pour cette personne ? */
export function ficheComplete(p: Parameters<typeof champsManquants>[0]): boolean {
  return champsManquants(p).length === 0
}
