import { grilleEnTexte } from '@/lib/contracts/commissions'
import { BAREMES_ENREGISTREMENT, bareme } from '@/lib/contracts/enregistrement'
import type { BrandConfig } from '@/lib/brand'
import type { Employment, Pole } from '@/lib/types'
import { activeBrand } from '@/lib/brand/actif'
import { isSalaried } from '@/lib/types'

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
  /**
   * La marque qui contracte.
   *
   * Elle voyage avec les paramètres plutôt que d'être lue à l'intérieur :
   * le texte du contrat est figé à l'envoi, et il doit nommer la société
   * qui signe — pas celle affichée à l'écran quand on le relit.
   */
  marque: BrandConfig
  /** Barème retenu, pour les modèles qui en proposent plusieurs. */
  bareme?: string | null
  /** Fac ou campus de rattachement, pour les enregistrements. */
  lieu?: string | null
  nom: string
  email: string
  telephone: string | null
  adresse: string | null
  siret: string | null
  debut: string
  fin: string | null
  montant: number | null
  /** Un taux horaire se convient en net ou en brut : il faut le dire. */
  base?: 'brut' | 'net' | null
  /** Pour un indépendant : le taux s'entend HT, TTC, ou hors champ de TVA. */
  tva?: 'ht' | 'ttc' | 'exonere' | null
  precisions: string | null
}

export interface Modele {
  /** Le modèle demande de choisir un barème (enregistrement). */
  baremes?: { cle: string; nom: string; resume: string }[]
  /** Le modèle demande un lieu (fac, campus). */
  demandeLieu?: boolean
  /** Le modèle demande si le taux est net ou brut. */
  demandeBase?: boolean
  /** Le modèle demande comment le taux se lit au regard de la TVA. */
  demandeTva?: boolean
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
    `${p.marque.company.name}${p.marque.company.legalForm ? `, ${p.marque.company.legalForm}` : ''}, dont le siège est situé ${p.marque.company.address}, ` +
    `${p.marque.company.postalCode} ${p.marque.company.city}, immatriculée sous le numéro ${p.marque.company.siret}, ci-après « la société »,\n\n` +
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

// L'article nomme la plateforme : il se construit donc avec la marque.
const FACTURATION = (p: Parametres): Article => ({
  titre: 'Facturation et paiement',
  texte:
    `Les prestations sont récapitulées chaque mois sur la plateforme ${p.marque.appTitle}. Le premier jour du mois ` +
    'suivant, le prestataire reçoit son bordereau : il dispose de deux jours pour transmettre sa facture, réglée ' +
    'le troisième jour, ou le premier jour ouvré suivant.',
})

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
        FACTURATION(p),
        INDEPENDANCE,
        CONFIDENTIALITE,
        resiliation('quinze jours'),
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }),
  }
}

/**
 * L'enseignement, payé à l'heure.
 *
 * Il n'existait aucun modèle de professeur : la liste ne proposait que du
 * commercial et de l'enregistrement, en tête « Freelance temps plein » et
 * « Freelance temps partiel ». Shirel y a lu un choix de temps de travail,
 * a pris le premier, et a envoyé un contrat commercial à un professeur.
 *
 * Le volume d'heures d'un professeur change d'un mois à l'autre : un forfait
 * mensuel n'a pas de sens ici, c'est le taux horaire qui fait foi.
 */
function professeur(cle: string, nom: string, employment: Employment): Modele {
  const salarie = isSalaried(employment)
  return {
    cle,
    nom,
    pole: 'professeur',
    employment,
    rateType: 'horaire',
    rateAmount: null,
    monthlyAuto: false,
    signable: true,
    demandeBase: salarie,
    demandeTva: !salarie,
    resume: salarie
      ? 'Taux horaire, net ou brut selon ce qui a été convenu — vacation'
      : 'Taux horaire, déclaré séance par séance',
    corps: (p) => {
      const taux = p.montant ? euros(p.montant) : '… €'
      // Beaucoup de professeurs exercent en société avec un numéro de
      // déclaration d'activité : leur enseignement est exonéré de TVA, et la
      // facture doit porter l'article qui le dit. « Hors taxes » partout
      // laissait croire à une TVA simplement non facturée.
      const base = salarie
        ? p.base === 'brut'
          ? ' brut'
          : ' net'
        : p.tva === 'ttc'
          ? ' toutes taxes comprises'
          : p.tva === 'exonere'
            ? ', exonéré de TVA'
            : ' hors taxes'
      const mentionTva =
        p.tva === 'exonere'
          ? {
              titre: 'Taxe sur la valeur ajoutée',
              texte:
                'Les prestations d’enseignement objet du présent contrat sont exonérées de taxe sur la ' +
                'valeur ajoutée en application de l’article 261-4-4° a du Code général des impôts. Les ' +
                'factures portent cette mention et ne font apparaître aucune TVA.',
            }
          : p.tva === 'ttc'
            ? {
                titre: 'Taxe sur la valeur ajoutée',
                texte:
                  'Le taux convenu s’entend toutes taxes comprises : la taxe éventuellement applicable est ' +
                  'comprise dans ce montant et n’est pas ajoutée à la facture.',
              }
            : null
      return {
        intitule: `Contrat d’enseignement — ${nom.toLowerCase()}`,
        profil: nom,
        resume: [
          `Rémunération : ${taux}${base} de l’heure d’enseignement effectivement assurée.`,
          'Les séances sont déclarées une à une : créneau, groupe, module et modalité.',
          `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
        ],
        articles: [
          entete(p),
          {
            titre: 'Objet',
            texte:
              'La société confie à l’intervenant des enseignements : cours, travaux dirigés, colles, concours ' +
              'blancs et l’accompagnement pédagogique qui s’y rattache. Le volume d’heures n’est pas garanti ; ' +
              'il est arrêté au fil des besoins et des disponibilités de chacun.',
          },
          {
            titre: 'Rémunération',
            texte:
              `La rémunération est de ${taux}${base} par heure d’enseignement effectivement assurée. Le temps de ` +
              'préparation est compris dans ce taux, sauf accord écrit contraire. Les heures sont décomptées à la ' +
              'séance, et non au forfait mensuel.',
          },
          {
            titre: 'Déclaration des séances',
            texte:
              `Chaque séance est déclarée sur la plateforme ${p.marque.appTitle} avec son créneau horaire, le groupe ` +
              'concerné, le module enseigné et la modalité (présentiel, distanciel ou hybride). Cette traçabilité ' +
              'conditionne le paiement : un total d’heures mensuel ne dit ni quand la séance a eu lieu, ni ' +
              'devant quel groupe.',
          },
          salarie
            ? {
                titre: 'Paie',
                texte:
                  'Les heures validées par le responsable pédagogique sont transmises au service paie et figurent ' +
                  'sur le bulletin du mois. L’intervenant n’a pas de facture à établir.',
              }
            : FACTURATION(p),
          ...(mentionTva ? [mentionTva] : []),
          ...(salarie ? [] : [INDEPENDANCE]),
          CONFIDENTIALITE,
          resiliation('un mois'),
          LITIGES,
          ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
        ],
      }
    },
  }
}

/**
 * Coachs et tuteurs : l'accompagnement d'un étudiant, par opposition à
 * l'enseignement d'un groupe.
 *
 * Ils manquaient. Les contrats de coaching de Diploma avaient tous été
 * saisis à la main faute de modèle, et Nolwenn, qui dirige Medibox où ces
 * deux rôles sont le gros des effectifs, ne trouvait rien à choisir.
 */
function accompagnement(
  cle: string,
  nom: string,
  pole: Pole,
  employment: Employment,
  objet: string
): Modele {
  const salarie = isSalaried(employment)
  return {
    cle,
    nom,
    pole,
    employment,
    rateType: 'horaire',
    rateAmount: null,
    monthlyAuto: false,
    signable: true,
    demandeBase: salarie,
    demandeTva: !salarie,
    resume: salarie
      ? 'Taux horaire, net ou brut selon ce qui a été convenu — vacation'
      : 'Taux horaire, déclaré séance par séance',
    corps: (p) => {
      const taux = p.montant ? euros(p.montant) : '… €'
      const base = salarie
        ? p.base === 'brut'
          ? ' brut'
          : ' net'
        : p.tva === 'ttc'
          ? ' toutes taxes comprises'
          : p.tva === 'exonere'
            ? ', exonéré de TVA'
            : ' hors taxes'
      const mentionTva =
        p.tva === 'exonere'
          ? {
              titre: 'Taxe sur la valeur ajoutée',
              texte:
                'Les prestations objet du présent contrat sont exonérées de taxe sur la valeur ajoutée en ' +
                'application de l’article 261-4-4° a du Code général des impôts. Les factures portent cette ' +
                'mention et ne font apparaître aucune TVA.',
            }
          : p.tva === 'ttc'
            ? {
                titre: 'Taxe sur la valeur ajoutée',
                texte:
                  'Le taux convenu s’entend toutes taxes comprises : la taxe éventuellement applicable est ' +
                  'comprise dans ce montant et n’est pas ajoutée à la facture.',
              }
            : null
      return {
        intitule: `Contrat d’accompagnement — ${nom.toLowerCase()}`,
        profil: nom,
        resume: [
          `Rémunération : ${taux}${base} de l’heure d’accompagnement effectivement assurée.`,
          'Les séances sont déclarées une à une : créneau, étudiant ou groupe suivi, et modalité.',
          `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
        ],
        articles: [
          entete(p),
          { titre: 'Objet', texte: objet },
          {
            titre: 'Rémunération',
            texte:
              `La rémunération est de ${taux}${base} par heure d’accompagnement effectivement assurée. Le temps ` +
              'de préparation et de compte rendu est compris dans ce taux, sauf accord écrit contraire. Les ' +
              'heures sont décomptées à la séance, et non au forfait mensuel.',
          },
          {
            titre: 'Déclaration des séances',
            texte:
              `Chaque séance est déclarée sur la plateforme ${p.marque.appTitle} avec son créneau horaire, la ` +
              'personne ou le groupe suivi et la modalité (présentiel, distanciel ou hybride). Cette ' +
              'traçabilité conditionne le paiement : un total d’heures mensuel ne dit ni quand la séance a ' +
              'eu lieu, ni auprès de qui.',
          },
          {
            titre: 'Suivi des étudiants',
            texte:
              'L’intervenant signale sans délai au responsable pédagogique toute difficulté sérieuse ou ' +
              'absence répétée d’un étudiant suivi. L’accompagnement porte sur la méthode et le travail ; ' +
              'il ne se substitue ni à l’enseignement, ni à un suivi médical ou psychologique.',
          },
          salarie
            ? {
                titre: 'Paie',
                texte:
                  'Les heures validées par le responsable pédagogique sont transmises au service paie et ' +
                  'figurent sur le bulletin du mois. L’intervenant n’a pas de facture à établir.',
              }
            : FACTURATION(p),
          ...(mentionTva ? [mentionTva] : []),
          ...(salarie ? [] : [INDEPENDANCE]),
          CONFIDENTIALITE,
          resiliation('un mois'),
          LITIGES,
          ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
        ],
      }
    },
  }
}

export const MODELES: Modele[] = [
  accompagnement(
    'coach',
    'Coach indépendant',
    'coaching',
    'independant',
    'La société confie à l’intervenant l’accompagnement individuel ou en petit groupe d’étudiants : ' +
      'méthode de travail, organisation, préparation des épreuves et suivi de la progression. Le volume ' +
      'd’heures n’est pas garanti ; il est arrêté au fil des besoins et des disponibilités de chacun.'
  ),
  accompagnement(
    'coach_vacataire',
    'Coach vacataire (salarié)',
    'coaching',
    'vacataire',
    'La société confie à l’intervenant l’accompagnement individuel ou en petit groupe d’étudiants : ' +
      'méthode de travail, organisation, préparation des épreuves et suivi de la progression. Le volume ' +
      'd’heures n’est pas garanti ; il est arrêté au fil des besoins et des disponibilités de chacun.'
  ),
  accompagnement(
    'tuteur',
    'Tuteur indépendant',
    'referent',
    'independant',
    'La société confie à l’intervenant le tutorat d’étudiants : permanences, reprise des points non ' +
      'compris, correction d’exercices et accompagnement méthodologique, sous la responsabilité du ' +
      'référent pédagogique. Le volume d’heures n’est pas garanti.'
  ),
  professeur('professeur', 'Professeur indépendant', 'independant'),
  professeur('professeur_vacataire', 'Professeur vacataire (salarié)', 'vacataire'),
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
        FACTURATION(p),
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

MODELES.push({
  cle: 'enregistrement',
  nom: 'Enregistrement de cours',
  pole: 'enregistrement',
  employment: 'independant',
  rateType: 'mission',
  rateAmount: 25,
  monthlyAuto: false,
  signable: true,
  demandeLieu: true,
  baremes: BAREMES_ENREGISTREMENT.map((b) => ({ cle: b.cle, nom: b.nom, resume: b.resume })),
  resume: 'Vacation à la durée : 25 à 70 € selon le barème et la fac',
  corps: (p) => {
    const b = bareme(p.bareme) ?? BAREMES_ENREGISTREMENT[0]
    return {
      intitule: `Contrat de prestation — enregistrement de cours${p.lieu ? ` (${p.lieu})` : ''}`,
      profil: 'Enregistreur de cours',
      resume: [
        `Rémunération : ${b.resume}.`,
        p.lieu ? `Fac de rattachement : ${p.lieu}.` : 'Fac de rattachement à préciser.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
      ],
      articles: [
        entete(p),
        {
          titre: 'Objet',
          texte:
            'Le prestataire enregistre les cours dispensés à la faculté' +
            (p.lieu ? ` (${p.lieu})` : '') +
            ', selon le planning communiqué par ' +
            `${p.marque.company.name}. Il veille à la qualité du son et de l’image, et transmet les fichiers dans les délais convenus.`,
        },
        {
          titre: 'Rémunération',
          texte:
            `Chaque vacation est rémunérée selon la durée effective : ${b.resume}. Ces montants s’entendent hors ` +
            'prime de fiabilité et hors missions de renfort ou de remplacement, qui font l’objet d’un accord ' +
            'particulier. Les frais de transport pris en charge, le cas échéant, sont précisés ci-dessous.',
        },
        FACTURATION(p),
        INDEPENDANCE,
        CONFIDENTIALITE,
        {
          titre: 'Droits sur les enregistrements',
          texte:
            `Les enregistrements réalisés dans ce cadre sont la propriété de ${p.marque.company.name}, qui en dispose ` +
            'librement pour ses formations. Le prestataire s’interdit d’en conserver ou d’en diffuser copie.',
        },
        resiliation('huit jours'),
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }
  },
})

/**
 * Contrat de cession de droits d'auteur (Nolwenn, 13/11/2026).
 *
 * Pour les auteurs payés en droits : fiches, schémas, QCM, contenus
 * originaux. Le Code de la propriété intellectuelle (art. L131-3) exige que
 * chaque droit cédé soit mentionné à part, avec son étendue, sa destination,
 * son lieu et sa durée : d'où un article par droit. La rémunération est
 * proportionnelle ou forfaitaire (L131-4, le forfait étant admis pour
 * l'édition de contenus pédagogiques). Version de travail, à faire relire.
 */
MODELES.push({
  cle: 'cession_droits_auteur',
  nom: 'Cession de droits d’auteur',
  pole: 'autres',
  employment: 'droits_auteur',
  rateType: 'mission',
  rateAmount: null,
  monthlyAuto: false,
  signable: true,
  resume: 'Œuvres originales (fiches, schémas, QCM) payées en droits d’auteur, précompte retenu',
  corps: (p) => {
    const c = p.marque.company
    return {
      intitule: 'Contrat de cession de droits d’auteur',
      profil: 'Auteur',
      resume: [
        p.montant !== null
          ? `Rémunération : ${euros(p.montant)} brut par œuvre livrée, sauf montant fixé à la commande.`
          : 'Rémunération : fixée à chaque commande, en brut, sur la plateforme.',
        'Les cotisations de l’auteur (précompte) sont retenues et déclarées par la société.',
        `Début : ${dateFr(p.debut)}${p.fin ? ` — fin : ${dateFr(p.fin)}.` : ' — sans terme fixé.'}`,
      ],
      articles: [
        {
          titre: 'Les parties',
          texte:
            `${c.name}${c.legalForm ? `, ${c.legalForm}` : ''}, dont le siège est situé ${c.address}, ` +
            `${c.postalCode} ${c.city}, immatriculée sous le numéro ${c.siret}, ci-après « le cessionnaire »,\n\n` +
            `et ${p.nom}${p.adresse ? `, demeurant ${p.adresse}` : ''}, joignable à ${p.email}` +
            `${p.telephone ? ` et au ${p.telephone}` : ''}, ci-après « l’auteur ».`,
        },
        {
          titre: 'Objet',
          texte:
            'L’auteur crée, à la demande du cessionnaire, des œuvres originales destinées à la préparation des ' +
            'étudiants : fiches de cours, schémas, questions à choix multiples et leurs corrections, et autres ' +
            'contenus pédagogiques écrits. Chaque œuvre est commandée sur la plateforme ' +
            `${p.marque.appTitle}, qui en précise le sujet, le format, le délai et la rémunération. L’auteur ` +
            'garantit qu’il en est l’unique auteur, que l’œuvre est originale et qu’elle ne reproduit pas, sans ' +
            'autorisation, l’œuvre d’un tiers.',
        },
        {
          titre: 'Droit de reproduction cédé',
          texte:
            'L’auteur cède au cessionnaire, à titre exclusif, le droit de reproduire chaque œuvre, en tout ou en ' +
            'partie, sur tout support papier ou numérique (impression, fichier, plateforme en ligne, application), ' +
            'en nombre illimité d’exemplaires.',
        },
        {
          titre: 'Droit de représentation cédé',
          texte:
            'L’auteur cède au cessionnaire, à titre exclusif, le droit de communiquer chaque œuvre au public par ' +
            'tout procédé : mise en ligne sur les plateformes du cessionnaire, diffusion aux étudiants inscrits, ' +
            'projection en cours, envoi par messagerie.',
        },
        {
          titre: 'Droit d’adaptation cédé',
          texte:
            'L’auteur cède au cessionnaire le droit d’adapter chaque œuvre pour la tenir à jour : correction, ' +
            'actualisation au programme, mise en page, traduction, découpage en exercices. Toute modification ' +
            'respecte l’esprit de l’œuvre ; le droit moral de l’auteur, inaliénable, demeure.',
        },
        {
          titre: 'Étendue, lieu et durée',
          texte:
            'Ces droits sont cédés pour le monde entier, pour toute la durée de protection des droits d’auteur, ' +
            'pour l’usage du cessionnaire dans ses activités de formation et de préparation aux concours. Toute ' +
            'exploitation qui sortirait de cette destination (édition commerciale d’un ouvrage, par exemple) ' +
            'ferait l’objet d’un accord distinct.',
        },
        {
          titre: 'Rémunération',
          texte:
            (p.montant !== null
              ? `Chaque œuvre livrée et acceptée est rémunérée ${euros(p.montant)} brut, sauf montant différent fixé à la commande. `
              : 'Chaque œuvre livrée et acceptée est rémunérée au montant brut fixé à sa commande. ') +
            'Cette rémunération est forfaitaire, la participation proportionnelle aux recettes étant impossible à ' +
            'calculer pour un contenu diffusé dans une formation. Elle est soumise au précompte des cotisations ' +
            'sociales de l’artiste-auteur, retenu par le cessionnaire et déclaré en son nom à l’Urssaf ; le taux ' +
            'dépend de sa résidence fiscale et de son affiliation. Une note de droits d’auteur, accompagnée de la ' +
            'certification de précompte, est établie à chaque paiement et reste disponible dans « Mes documents ».',
        },
        {
          titre: 'Informations à fournir',
          texte:
            'L’auteur renseigne sur la plateforme son numéro de sécurité sociale, son adresse, son pays de ' +
            'résidence fiscale et son IBAN, et fournit, le cas échéant, son attestation de résidence fiscale ou ' +
            'son formulaire A1. Il signale sans délai tout changement : le taux de précompte en dépend.',
        },
        CONFIDENTIALITE,
        resiliation('quinze jours'),
        {
          titre: 'Effet de la fin du contrat',
          texte:
            'La fin du contrat ne remet pas en cause les droits cédés sur les œuvres déjà livrées et payées.',
        },
        LITIGES,
        ...(p.precisions ? [{ titre: 'Dispositions particulières', texte: p.precisions }] : []),
      ],
    }
  },
})

export const modele = (cle: string | null | undefined) => MODELES.find((m) => m.cle === cle)
