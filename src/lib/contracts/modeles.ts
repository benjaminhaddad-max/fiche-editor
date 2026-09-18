import { grilleEnTexte } from '@/lib/contracts/commissions'
import { COMPANY } from '@/lib/types'
import type { Employment, Pole } from '@/lib/types'

/**
 * Modèles de contrat proposés aux managers.
 *
 * Chaque modèle décrit un profil : statut, rémunération de base, articles.
 * Le texte est figé au moment de l'envoi — un modèle corrigé plus tard ne
 * modifie pas un contrat déjà signé.
 *
 * Ce sont des modèles de travail : ils engagent la société, une relecture
 * par un conseil juridique reste nécessaire avant le premier envoi.
 */
export interface Article {
  titre: string
  texte: string
}

export interface CorpsContrat {
  intitule: string
  profil: string
  resume: string[]
  articles: Article[]
}

export interface Parametres {
  nom: string
  email: string
  telephone: string | null
  adresse: string | null
  siret: string | null
  debut: string
  fin: string | null
  montant: number | null
  precisions: string | null
}

export interface Modele {
  cle: string
  nom: string
  pole: Pole
  employment: Employment
  rateType: 'mensuel' | 'mission' | 'horaire' | 'forfait'
  rateAmount: number | null
  /** Le forfait mensuel devient chaque mois une prestation à facturer. */
  monthlyAuto: boolean
  /** Un apprenti signe un CERFA : sa signature ne passe pas par ici. */
  signable: boolean
  resume: string
  corps: (p: Parametres) => CorpsContrat
}

const dateFr = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—'

const euros = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

const entete = (p: Parametres): Article => ({
  titre: 'Les parties',
  texte:
    `${COMPANY.name}${COMPANY.legalForm ? `, ${COMPANY.legalForm}` : ''}, dont le siège est situé ${COMPANY.address}, ` +
    `${COMPANY.postalCode} ${COMPANY.city}, immatriculée sous le numéro ${COMPANY.siret}, ci-après « la société »,\n\n` +
    `et ${p.nom}${p.siret ? `, immatriculé(e) sous le numéro ${p.siret}` : ''}${p.adresse ? `, demeurant ${p.adresse}` : ''}, ` +
    `joignable à ${p.email}${p.telephone ? ` et au ${p.telephone}` : ''}, ci-après « le prestataire ».`,
})

const CONFIDENTIALITE: Article = {
  titre: 'Confidentialité et données personnelles',
  texte:
    'Le prestataire garde confidentielle toute information relative aux élèves, aux candidats et à l’organisation ' +
    'de la société, pendant la durée du contrat et après son terme. Les données personnelles auxquelles il accède ' +
    'ne servent qu’à l’exécution des missions confiées et ne sont jamais conservées sur un support personnel.',
}

const INDEPENDANCE: Article = {
  titre: 'Indépendance',
  texte:
    'Le prestataire exerce en toute indépendance : il organise librement son temps, reste maître de ses moyens, et ' +
    'n’est dans aucun lien de subordination avec la société. Il déclare être à jour de ses obligations sociales et ' +
    'fiscales et s’engage à en justifier sur demande.',
}

const FACTURATION: Article = {
  titre: 'Facturation et paiement',
  texte:
    'Les prestations sont récapitulées chaque mois sur la plateforme Diploma Invoice. Le premier jour du mois ' +
    'suivant, le prestataire reçoit son bordereau : il dispose de deux jours pour transmettre sa facture, réglée ' +
    'le troisième jour, ou le premier jour ouvré suivant.',
}

const LITIGES: Article = {
  titre: 'Droit applicable',
  texte:
    'Le présent contrat est soumis au droit français. En cas de désaccord, les parties rechercheront une solution ' +
    'amiable avant toute action ; à défaut, les tribunaux du ressort du siège de la société seront compétents.',
}

const resiliation = (preavis: string): Article => ({
  titre: 'Durée et résiliation',
  texte:
    `Chaque partie peut mettre fin au contrat à tout moment, par écrit, moyennant un préavis de ${preavis}. Les ` +
    'prestations engagées avant la fin du préavis restent dues. En cas de manquement grave, le contrat peut être ' +
    'rompu sans préavis.',
})

const commissionnement = (fixe: boolean): Article => ({
  titre: 'Commissionnement',
  texte:
    `Chaque inscription obtenue donne lieu à une commission, selon la grille suivante, ${
      fixe ? 'fixe pour la durée du contrat' : 'susceptible d’être revue d’un commun accord selon les performances'
    } :\n\n${grilleEnTexte().join('\n')}\n\n` +
    'Une commission est due lorsque l’inscription est confirmée et encaissée par la société. Elle est arrêtée sur ' +
    'la plateforme par le responsable commercial avant la fin de chaque mois.',
})

function freelance(cle: string, nom: string, montant: number, heures: string): Modele {
  return {
    cle,
    nom,
    pole: 'commercial',
    employment: 'independant',
    rateType: 'mensuel',
    rateAmount: montant,
    monthlyAuto: true,
    signable: true,
    resume: `${euros(montant)} par mois (${heures}) + grille de commissionnement variable`,
    corps: (p) => ({
      intitule: `Contrat de prestation de services — ${nom.toLowerCase()}`,
      profil: nom,
      resume: [
        `Rémunération fixe : ${euros(p.montant ?? montant)} hors taxes par mois, pour ${heures}.`,
        'Commissionnement selon la grille annexée, revue d’un commun accord selon les performances.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
      ],
      articles: [
        entete(p),
        {
          titre: 'Objet',
          texte:
            'La société confie au prestataire une mission de développement commercial : traitement des demandes ' +
            'entrantes, appels sortants, accompagnement des candidats jusqu’à leur inscription et suivi des ' +
            `réinscriptions. Le prestataire y consacre en moyenne ${heures}.`,
        },
        {
          titre: 'Rémunération fixe',
          texte:
            `La société verse au prestataire un forfait mensuel de ${euros(p.montant ?? montant)} hors taxes, ` +
            'indépendant du nombre d’inscriptions obtenues. Ce montant pourra être revu d’un commun accord selon ' +
            'les performances constatées.',
        },
        commissionnement(false),
        FACTURATION,
        INDEPENDANCE,
        CONFIDENTIALITE,
        resiliation('quinze jours'),
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }),
  }
}

export const MODELES: Modele[] = [
  freelance('freelance_temps_plein', 'Freelance temps plein', 500, '25 heures par semaine'),
  freelance('freelance_temps_partiel', 'Freelance temps partiel', 250, '12 heures par semaine'),
  {
    cle: 'freelance_evenements',
    nom: 'Freelance pour événements',
    pole: 'commercial',
    employment: 'independant',
    rateType: 'mission',
    rateAmount: 120,
    monthlyAuto: false,
    signable: true,
    resume: '120 € la journée, 60 € la demi-journée, à la mission',
    corps: (p) => ({
      intitule: 'Contrat de prestation de services — événements',
      profil: 'Freelance pour événements',
      resume: [
        'Rémunération : 120 € hors taxes la journée, 60 € la demi-journée.',
        'Chaque événement fait l’objet d’un bon de mission accepté avant sa réalisation.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
      ],
      articles: [
        entete(p),
        {
          titre: 'Objet',
          texte:
            'Le prestataire intervient lors des événements organisés par la société — journées portes ouvertes, ' +
            'salons, webinaires, concours blancs — pour accueillir, informer et orienter les candidats.',
        },
        {
          titre: 'Rémunération',
          texte:
            'Chaque intervention est rémunérée 120 € hors taxes la journée et 60 € hors taxes la demi-journée. Les ' +
            'événements sont proposés par bon de mission sur la plateforme : le prestataire les accepte ou les ' +
            'refuse librement, aucun volume n’étant garanti de part ni d’autre.',
        },
        commissionnement(false),
        FACTURATION,
        INDEPENDANCE,
        CONFIDENTIALITE,
        resiliation('huit jours'),
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }),
  },
  {
    cle: 'alternant',
    nom: 'Alternant',
    pole: 'commercial',
    employment: 'alternant',
    rateType: 'mensuel',
    rateAmount: null,
    monthlyAuto: false,
    signable: false,
    resume: 'Salaire (contrat d’apprentissage CERFA) + grille de commissionnement fixe',
    corps: (p) => ({
      intitule: 'Annexe au contrat d’apprentissage — commissionnement',
      profil: 'Alternant',
      resume: [
        'Le contrat de travail est le CERFA d’apprentissage, signé par ailleurs.',
        'Cette annexe fixe le commissionnement, versé en prime sur la paie.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ''}`,
      ],
      articles: [
        entete(p),
        {
          titre: 'Objet',
          texte:
            'La présente annexe complète le contrat d’apprentissage conclu entre les parties. Elle fixe les primes ' +
            'liées aux inscriptions obtenues par l’alternant dans son activité commerciale. Elle ne modifie ni la ' +
            'durée du travail, ni la rémunération prévue au contrat d’apprentissage.',
        },
        commissionnement(true),
        {
          titre: 'Versement',
          texte:
            'Les primes sont arrêtées chaque mois par le responsable commercial sur la plateforme, puis transmises ' +
            'au service paie avec les éléments variables du mois. Elles figurent sur le bulletin de salaire.',
        },
        CONFIDENTIALITE,
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }),
  },
  {
    cle: 'alternant_evenements',
    nom: 'Alternant pour événements',
    pole: 'commercial',
    employment: 'alternant',
    rateType: 'mission',
    rateAmount: 0,
    monthlyAuto: false,
    signable: false,
    resume: 'Jours de récupération en contrepartie des événements',
    corps: (p) => ({
      intitule: 'Annexe au contrat d’apprentissage — événements',
      profil: 'Alternant pour événements',
      resume: [
        'Les événements travaillés hors horaires habituels ouvrent droit à récupération.',
        'Une journée d’événement donne un jour de récupération, une demi-journée une demi-journée.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ''}`,
      ],
      articles: [
        entete(p),
        {
          titre: 'Objet',
          texte:
            'L’alternant peut être sollicité pour les événements de la société se tenant en dehors de ses horaires ' +
            'habituels. Sa participation reste volontaire et fait l’objet d’un bon de mission accepté au préalable.',
        },
        {
          titre: 'Contrepartie',
          texte:
            'Chaque journée d’événement ouvre droit à un jour de récupération, chaque demi-journée à une ' +
            'demi-journée. Les jours acquis sont suivis sur la plateforme et posés d’un commun accord avec le ' +
            'maître d’apprentissage, dans les trois mois suivant l’événement.',
        },
        CONFIDENTIALITE,
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }),
  },
]

export const modele = (cle: string | null | undefined) => MODELES.find((m) => m.cle === cle)
