/**
 * Le même code sert les deux écoles.
 *
 * La marque active est choisie par NEXT_PUBLIC_BRAND, comme sur Diploma Lab
 * et Medibox Lab : un dépôt, plusieurs déploiements Vercel, une seule base.
 * La variable est figée à la compilation, donc serveur et navigateur sont
 * toujours d'accord sur la marque d'un déploiement donné.
 *
 * Tout ce qui distingue une école vit ici. Ce qui n'y est pas — un « Diploma »
 * écrit en dur au fil du code — deviendrait faux sur l'autre déploiement sans
 * que rien ne le signale.
 */

export type BrandId = 'diploma' | 'linova'

export const DEFAULT_BRAND: BrandId = 'diploma'

export interface BrandConfig {
  id: BrandId
  /** Nom d'usage, celui qu'on écrit aux gens. */
  name: string
  /** Nom du produit, en haut de la page et dans l'onglet. */
  appTitle: string
  description: string
  siteUrl: string
  /** Couleur de la barre du navigateur sur mobile. */
  themeColor: string
  logos: { cream: string; navy: string }
  /** Qui reçoit les factures : c'est cette société qui est facturée. */
  company: {
    name: string
    legalForm: string
    address: string
    postalCode: string
    city: string
    siret: string
    vatNumber: string
  }
  email: { senderName: string; senderEmail: string }
  /** Adresse où déposer une facture reçue par mail, quand il y en a une. */
  inboundEmail: string | null
}

export const BRANDS: Record<BrandId, BrandConfig> = {
  diploma: {
    id: 'diploma',
    name: 'Diploma Santé',
    appTitle: 'Diploma Invoice',
    description:
      'Déclarez vos prestations, suivez vos factures et vos paiements.',
    siteUrl: 'https://facturation.diploma-sante.fr',
    themeColor: '#0e1e35',
    logos: { cream: '/logo-diploma-invoice.webp', navy: '/logo-diploma-invoice-navy.webp' },
    company: {
      name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Diploma Santé',
      legalForm: process.env.NEXT_PUBLIC_COMPANY_LEGAL_FORM ?? '',
      address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? '',
      postalCode: process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE ?? '',
      city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? '',
      siret: process.env.NEXT_PUBLIC_COMPANY_SIRET ?? '',
      vatNumber: process.env.NEXT_PUBLIC_COMPANY_VAT ?? '',
    },
    email: {
      senderName: 'Facturation Diploma Santé',
      senderEmail: 'facturation@diploma-sante.fr',
    },
    inboundEmail: process.env.DEPOT_FACTURES_EMAIL ?? null,
  },
  linova: {
    id: 'linova',
    name: 'Linova',
    appTitle: 'Linova Invoice',
    description:
      'Déclarez vos prestations, suivez vos factures et vos paiements.',
    siteUrl: 'https://facturation.linova-education.fr',
    // À reprendre dès que la charte Linova est arrêtée : couleur, logos et
    // coordonnées de facturation sont provisoires et doivent être justes
    // avant qu'une facture ne parte au nom de cette société.
    themeColor: '#0e1e35',
    logos: { cream: '/logo-linova-invoice.webp', navy: '/logo-linova-invoice-navy.webp' },
    company: {
      name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Linova Education',
      legalForm: process.env.NEXT_PUBLIC_COMPANY_LEGAL_FORM ?? '',
      address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? '',
      postalCode: process.env.NEXT_PUBLIC_COMPANY_POSTAL_CODE ?? '',
      city: process.env.NEXT_PUBLIC_COMPANY_CITY ?? '',
      siret: process.env.NEXT_PUBLIC_COMPANY_SIRET ?? '',
      vatNumber: process.env.NEXT_PUBLIC_COMPANY_VAT ?? '',
    },
    email: {
      senderName: 'Facturation Linova',
      senderEmail: process.env.BREVO_SENDER_EMAIL ?? 'facturation@linova-education.fr',
    },
    inboundEmail: process.env.DEPOT_FACTURES_EMAIL ?? null,
  },
}

/** Une valeur inconnue ne doit jamais ouvrir l'école voisine : on retombe sur Diploma. */
export function normalizeBrandId(v: string | undefined | null): BrandId {
  return v === 'linova' ? 'linova' : DEFAULT_BRAND
}
