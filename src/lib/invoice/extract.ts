import Anthropic from '@anthropic-ai/sdk'

/** Une ligne telle que Claude l'a lue dans le PDF. */
export interface LigneLue {
  description: string
  quantity: number | null
  unit_amount_ht: number | null
  total_ht: number
  line_date: string | null
}

export interface LectureFacture {
  lignes: LigneLue[]
  total_ht_annonce: number | null
  numero: string | null
  avertissement: string | null
}

export function estLectureConfiguree(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    numero: {
      type: ['string', 'null'],
      description: 'Numéro de la facture tel qu’il figure sur le document.',
    },
    total_ht_annonce: {
      type: ['number', 'null'],
      description: 'Total hors taxes annoncé sur la facture, tel qu’écrit.',
    },
    avertissement: {
      type: ['string', 'null'],
      description:
        'Une phrase en français si le document est illisible, n’est pas une facture, ou si les lignes ne se recoupent pas avec le total. Sinon null.',
    },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          description: { type: 'string', description: 'Libellé de la prestation, tel qu’écrit.' },
          quantity: { type: ['number', 'null'] },
          unit_amount_ht: { type: ['number', 'null'] },
          total_ht: { type: 'number', description: 'Montant HT de la ligne.' },
          line_date: {
            type: ['string', 'null'],
            description: 'Date de la prestation au format AAAA-MM-JJ si elle figure sur la ligne.',
          },
        },
        required: ['description', 'quantity', 'unit_amount_ht', 'total_ht', 'line_date'],
      },
    },
  },
  required: ['numero', 'total_ht_annonce', 'avertissement', 'lignes'],
} as const

const CONSIGNE = `Tu lis une facture déposée par un prestataire de Diploma Santé.

Extrais chaque ligne de prestation facturée, sans rien inventer ni fusionner.

Règles :
- Recopie les libellés tels qu'ils sont écrits, sans les reformuler.
- Les montants sont HORS TAXES. Si la facture est en TTC avec une TVA, retiens le HT.
- Ignore les lignes qui ne sont pas des prestations : sous-totaux, TVA, mentions légales, coordonnées bancaires, acomptes déjà réglés.
- Une remise ou un rabais est une ligne à part entière, avec un montant négatif.
- Si tu ne trouves aucune ligne de prestation, renvoie une liste vide et explique pourquoi dans "avertissement".
- Si la somme des lignes ne correspond pas au total annoncé, signale-le dans "avertissement" plutôt que d'ajuster les chiffres.`

/**
 * Lit un PDF de facture et en extrait les lignes.
 *
 * Le modèle ne décide de rien : il transcrit. L'affectation d'un responsable
 * et la validation restent humaines — une facture mal lue ne doit jamais
 * pouvoir déclencher un paiement toute seule.
 */
export async function lireFacture(pdf: Buffer): Promise<LectureFacture> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdf.toString('base64'),
            },
          },
          { type: 'text', text: CONSIGNE },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('La lecture du document a été refusée.')
  }

  const bloc = response.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') {
    throw new Error('Aucun contenu lisible dans la réponse.')
  }

  const lu = JSON.parse(bloc.text) as LectureFacture
  return {
    ...lu,
    lignes: (lu.lignes ?? []).filter((l) => l.description?.trim() && Number.isFinite(l.total_ht)),
  }
}
