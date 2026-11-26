/**
 * Dispense de mutuelle (Shirel, 26/11/2026) : le salarié signe une fois
 * l'attestation sur l'honneur du modèle d'Odile (« Demande de dispense frais
 * de santé »). Elle est gardée et ne se redemande pas les mois suivants,
 * jusqu'à l'échéance qu'il a indiquée ; sans échéance, elle reste valable.
 * Un mois avant l'échéance, on lui en redemande une nouvelle.
 */

export type SituationDispense = 'cmuc_acs' | 'assurance_individuelle' | 'autre_emploi' | 'cdd_court'

/** Les quatre cases du modèle, mot pour mot. */
export const SITUATIONS: { cle: SituationDispense; texte: string }[] = [
  {
    cle: 'cmuc_acs',
    texte:
      "Bénéficiaire de la CMUC ou de l'Aide à l'acquisition d'une Complémentaire Santé (la dispense ne peut jouer que jusqu'à l'expiration des droits à la CMUC ou l'ACS).",
  },
  {
    cle: 'assurance_individuelle',
    texte:
      "Couvert par une assurance individuelle de frais de santé au moment de la mise en place des garanties ou de l'embauche si elle est postérieure (la dispense ne peut jouer que jusqu'à échéance du contrat d'assurance santé individuel).",
  },
  {
    cle: 'autre_emploi',
    texte:
      "Bénéficiaire, pour les mêmes risques, y compris en tant qu'ayant droit, d'une couverture frais de santé au titre d'un autre emploi, relevant de l'un des dispositifs suivants : régime de prévoyance complémentaire collectif obligatoire (si ayant droit, le régime prévoit la couverture des ayants droit à titre obligatoire) ; régime local d'assurance maladie du Haut-Rhin, du Bas-Rhin et de la Moselle ; régime complémentaire d'assurance maladie des industries électriques et gazières ; régime de prévoyance de la Fonction publique d'État issu du décret n° 2007-1373 du 19 septembre 2007 ; régime de prévoyance de la Fonction publique territoriale issu du décret n° 2011-1474 du 8 novembre 2011 ; contrat d'assurance de groupe « Madelin » issu de la loi n° 94-126 du 11 février 1994 ; régime spécial de Sécurité sociale des gens de mer (ENIM) ; Caisse de prévoyance et de retraite des personnels de la SNCF (CPRPSNCF).",
  },
  {
    cle: 'cdd_court',
    texte:
      "Salarié(e) titulaire d'un CDD ou d'un contrat de mission dont la durée d'adhésion au régime obligatoire frais de santé est inférieure à trois mois (durée de portabilité au terme du contrat non comprise), sous condition de justifier être couvert par un contrat responsable.",
  },
]

export const TITRE_DISPENSE = 'Demande de dispense frais de santé — Attestation sur l’honneur'

export const CHAPEAU =
  "Atteste sur l'honneur que je me trouve dans l'une des situations suivantes et souhaite, en conséquence, ne pas être affilié(e) au régime complémentaire santé obligatoire :"

export const RENONCIATION = [
  "J'ai été préalablement informé(e) par mon employeur des conséquences de la renonciation au bénéfice du régime collectif et obligatoire de frais de santé. En renonçant à l'affiliation au régime de frais de santé, je renonce à tout remboursement au titre dudit régime si j'ai des frais de santé ou d'hospitalisation ainsi qu'au versement des prestations du régime en cas de maladie ou d'accident. Je renonce également à la part patronale des cotisations, au bénéfice de la portabilité des droits en cas de chômage indemnisé et au bénéfice du maintien des garanties au titre de l'article 4 de la loi Evin.",
  "En outre, j'ai été informé(e) que je pouvais revenir sur ma décision à tout moment et solliciter auprès de mon employeur, par écrit, mon adhésion à la garantie frais de santé. L'adhésion prend alors effet le premier jour du mois qui suit ma demande. Cette adhésion sera alors irrévocable.",
]

/** Le texte exact signé, gardé avec la signature. */
export function texteSigne(p: {
  societe: string
  nom: string
  situation: SituationDispense
  organisme: string
  echeance: string | null
  faitA: string
  le: string
}): string {
  const fr = (d: string) => d.split('-').reverse().join('/')
  return [
    p.societe,
    TITRE_DISPENSE,
    `Je soussigné(e), ${p.nom},`,
    CHAPEAU,
    `[x] ${SITUATIONS.find((s) => s.cle === p.situation)?.texte ?? p.situation}`,
    `L'organisme auprès duquel je suis affilié(e) est le suivant (nom et coordonnées) : ${p.organisme}`,
    `Ma couverture arrivera à échéance le : ${p.echeance ? fr(p.echeance) : 'non indiquée'}.`,
    ...RENONCIATION,
    `Fait à ${p.faitA}, le ${fr(p.le)}.`,
    `Signé électroniquement : ${p.nom}`,
  ].join('\n\n')
}

export interface Dispense {
  id: string
  situation: SituationDispense
  organisme: string
  echeance: string | null
  signe_le: string
  signature: string
  document: string | null
}

export type EtatDispense = 'aucune' | 'valide' | 'a_renouveler' | 'expiree'

/** Le jour, un mois avant l'échéance : à partir de là, on en redemande une. */
export function dateDeRenouvellement(echeance: string): string {
  const [y, m, d] = echeance.split('-').map(Number)
  const avant = new Date(Date.UTC(y, m - 2, 1))
  // Le même jour du mois d'avant, ou son dernier jour (31 mars → 28/29 février).
  const dernier = new Date(Date.UTC(avant.getUTCFullYear(), avant.getUTCMonth() + 1, 0)).getUTCDate()
  avant.setUTCDate(Math.min(d, dernier))
  return avant.toISOString().slice(0, 10)
}

/**
 * Où en est la dispense, au jour donné (AAAA-MM-JJ, heure de Paris) :
 * - aucune : jamais signée ;
 * - valide : signée, sans échéance ou échéance à plus d'un mois ;
 * - a_renouveler : encore valable, mais l'échéance est à moins d'un mois ;
 * - expiree : l'échéance est passée.
 */
export function etatDispense(d: Pick<Dispense, 'echeance'> | null | undefined, aujourdhui: string): EtatDispense {
  if (!d) return 'aucune'
  if (!d.echeance) return 'valide'
  if (aujourdhui > d.echeance) return 'expiree'
  if (aujourdhui >= dateDeRenouvellement(d.echeance)) return 'a_renouveler'
  return 'valide'
}

/** Une dispense qui couvre encore le salarié (à renouveler compris). */
export const dispenseEnCours = (e: EtatDispense) => e === 'valide' || e === 'a_renouveler'
