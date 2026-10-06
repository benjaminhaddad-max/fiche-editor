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
  /** Teintes de la charte, pour les emails et les documents. */
  palette: { dark: string; accent: string; light: string; ink: string }
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
  /** Qui prépare les bulletins : c'est à elle que part le récapitulatif de paie. */
  payrollContact: { name: string; email: string } | null
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
    palette: { dark: '#0e1e35', accent: '#c8a44b', light: '#f7f4ee', ink: '#0e1e35' },
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
    payrollContact: { name: 'Shirel Benchetrit', email: 'shirel.benchetrit@diploma-sante.fr' },
  },
  linova: {
    id: 'linova',
    name: 'Linova',
    appTitle: 'Linova Invoice',
    description:
      'Déclarez vos prestations, suivez vos factures et vos paiements.',
    siteUrl: 'https://facturation.linova-education.fr',
    // Bleu nuit de la charte Linova.
    themeColor: '#182d3c',
    // Le logotype est posé en vectoriel, sans retouche : la charte interdit
    // d'en déformer les tracés. Ces fichiers servent aux emails, où un SVG
    // en ligne ne passe pas partout.
    logos: { cream: '/logo/linova-logotype.svg', navy: '/logo/linova-logotype.svg' },
    // Relevées dans public/logo/LISEZ-MOI.md : bleu nuit, bleu lagon,
    // blanc cassé, noir charbon. Le jaune vif ne sert qu'aux alertes.
    palette: { dark: '#182d3c', accent: '#6da3a4', light: '#efefef', ink: '#222222' },
    // Relevé au registre des entreprises (SIREN 943 551 341, créée le
    // 9 avril 2025). Ces lignes s'impriment sur les factures des
    // prestataires : elles ne se devinent pas, elles se vérifient.
    company: {
      name: 'Linova Formation',
      legalForm: 'SAS',
      address: '85 avenue Ledru-Rollin',
      postalCode: '75012',
      city: 'Paris',
      siret: '94355134100010',
      vatNumber: 'FR35943551341',
    },
    email: {
      senderName: 'Facturation Linova',
      senderEmail: process.env.BREVO_SENDER_EMAIL ?? 'facturation@linova-education.fr',
    },
    inboundEmail: process.env.DEPOT_FACTURES_EMAIL ?? null,
    // À renseigner dès que Linova aura son interlocuteur paie : sans lui, le
    // bouton d'envoi se désactive plutôt que d'écrire à l'aveugle.
    payrollContact: null,
  },
}

/** Une valeur inconnue ne doit jamais ouvrir l'école voisine : on retombe sur Diploma. */
/**
 * Les SIRET de nos propres sociétés.
 *
 * Deux prestataires les avaient recopiés sur leur fiche — celui de Diploma
 * Santé pour l'une, celui de Linova pour l'autre. Leurs factures sortaient
 * au nom de la société qui les paie, et la comptabilité les rattachait au
 * fournisseur qui porte ce SIREN : un autre que le leur, avec un autre IBAN.
 * On ne peut pas être son propre fournisseur.
 */
export function siretsMaison(): string[] {
  return Object.values(BRANDS)
    .map((b) => (b.company.siret ?? '').replace(/\D/g, ''))
    .filter((s) => s.length >= 9)
}

export const estSiretMaison = (siret: string | null | undefined): boolean => {
  const s = (siret ?? '').replace(/\D/g, '')
  if (s.length < 9) return false
  return siretsMaison().some((m) => m.slice(0, 9) === s.slice(0, 9))
}

export function normalizeBrandId(v: string | undefined | null): BrandId {
  return v === 'linova' ? 'linova' : DEFAULT_BRAND
}
