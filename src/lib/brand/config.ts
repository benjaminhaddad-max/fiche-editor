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

export type BrandId = 'diploma' | 'linova' | 'medibox'

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
  /** Null tant que la marque n'a pas son propre fichier : on écrit son nom. */
  logos: { cream: string; navy: string } | null
  /** Teintes de la charte, pour les emails et les documents. */
  palette: { dark: string; accent: string; light: string; ink: string }
  /**
   * Les couleurs de l'interface, quand elles diffèrent de celles du
   * globals.css — qui sont celles de Diploma.
   *
   * Toute l'application se peint avec ces variables : navy pour le rail et
   * les boutons, or pour les accents, crème pour les fonds. Elles étaient
   * figées dans la feuille de style, si bien que Medibox et Linova
   * s'affichaient en bleu nuit et or de Diploma. Une marque qui laisse ce
   * champ vide garde ces couleurs-là.
   */
  ui?: Record<string, string>
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
  medibox: {
    id: 'medibox',
    name: 'Medibox',
    appTitle: 'Medibox Invoice',
    description:
      'Déclarez vos prestations, suivez vos factures et vos paiements.',
    siteUrl: 'https://facturation.medibox.fr',
    themeColor: '#0f3d4c',
    // Pas de logotype Medibox dans public/. Et surtout pas de repli sur
    // logo-mark.svg : ce fichier est le logo de Diploma Santé, pas une marque
    // neutre — Nolwenn a ouvert son espace et y a vu le logo de Diploma.
    // Sans fichier propre, on écrit le nom, et c'est tout.
    logos: null,
    // Charte graphique Medibox 2026 : nuit, violet, lavande. Le violet sert
    // aux accents et jamais aux grands aplats — les fonds sont nuit ou blancs.
    palette: { dark: '#07050D', accent: '#6D4FD0', light: '#F5F3FF', ink: '#140E2E' },
    ui: {
      // Fonds sombres : rail, bandeaux. « Nuit » et ses voisines.
      '--color-navy': '#140E2E',
      '--color-navy-light': '#24194a',
      '--color-navy-dark': '#07050D',
      '--color-navy-soft': '#4C2FA8',
      // L'accent remplace l'or : violet, indigo au survol, lavande en clair.
      '--color-gold': '#6D4FD0',
      '--color-gold-light': '#A78BFA',
      '--color-gold-dark': '#4C2FA8',
      // Les fonds clairs remplacent la crème : blanc et lilas pâle.
      '--color-cream': '#F5F3FF',
      '--color-cream-muted': '#FBFAFF',
      '--color-cream-deep': '#E6E0FA',
      '--color-line': '#E6E0FA',
      '--color-stone': '#8B82A6',
      '--color-muted': '#6B6480',
    },
    // Relevé au registre des entreprises : SIREN 930 619 051, SAS créée le
    // 1er juillet 2024, enseignement supérieur (85.42Z). Clé de TVA et clé de
    // Luhn du SIRET vérifiées — ces lignes s'impriment sur chaque facture de
    // prestataire et sur chaque contrat, elles ne se devinent pas.
    //
    // La raison sociale est « Medibox France » : c'est elle qui engage, et
    // c'est elle qui doit figurer sur les documents. « Medibox » tout court
    // reste le nom d'usage, affiché à l'écran.
    company: {
      name: 'Medibox France',
      legalForm: 'SAS',
      address: '8 bis rue de Tunis',
      postalCode: '75011',
      city: 'Paris',
      siret: '93061905100012',
      vatNumber: 'FR61930619051',
    },
    email: {
      senderName: 'Facturation Medibox',
      senderEmail: 'facturation@medibox.fr',
    },
    inboundEmail: null,
    // À renseigner quand Medibox aura son interlocuteur paie.
    payrollContact: null,
  },
}

/**
 * Une marque peut-elle émettre des factures ?
 *
 * Les mentions légales de l'émetteur sont obligatoires sur une facture. Une
 * marque dont la société n'est pas renseignée se monte, s'administre et
 * reçoit des déclarations, mais n'émet rien : mieux vaut un bouton bloqué
 * qu'une facture fausse à rattraper chez le comptable.
 */
export function marqueFacturable(id: BrandId): boolean {
  const c = BRANDS[id].company
  return Boolean(c.name && c.address && c.postalCode && c.city && c.siret)
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
  // hasOwn et non `in` : `'constructor' in BRANDS` vaut vrai et ferait
  // passer n'importe quoi pour une marque.
  return v != null && Object.hasOwn(BRANDS, v) ? (v as BrandId) : DEFAULT_BRAND
}

/** La marque de ce déploiement : celle figée dans NEXT_PUBLIC_BRAND. */
export function deploymentBrandId(): BrandId {
  return normalizeBrandId(process.env.NEXT_PUBLIC_BRAND)
}

/**
 * Les marques que ce déploiement accepte.
 *
 * Par défaut la sienne, et elle seule : Linova Invoice reste Linova Invoice.
 * Diploma Invoice en sert plusieurs — `BRANDS_SERVIES=diploma,medibox` — et
 * c'est là que le sélecteur de marque a un sens. Un déploiement qui ne sert
 * qu'une marque n'a pas de sélecteur et ne change pour personne.
 */
export function servedBrandIds(): BrandId[] {
  const brut = (process.env.NEXT_PUBLIC_BRANDS_SERVIES ?? '').trim()
  const deploiement = deploymentBrandId()
  if (!brut) return [deploiement]
  const ids = brut
    .split(',')
    .map((s) => s.trim())
    .filter((s) => Object.hasOwn(BRANDS, s)) as BrandId[]
  // La marque du déploiement en tête, et jamais absente : une variable mal
  // tapée ne doit pas fermer la porte à ceux qui entrent ici tous les jours.
  return [deploiement, ...ids.filter((id) => id !== deploiement)]
}
