import Anthropic from '@anthropic-ai/sdk'

/** Une ligne telle qu'elle est écrite sur la facture d'un prestataire. */
export interface LignePrestationLue {
  date: string | null
  detail: string | null
  formation: string | null
  categorie: string | null
  unite: 'heure' | 'journee' | 'mission' | null
  quantite: number | null
  prix_unitaire: number | null
}

/** Ce qu'on lit sur la facture qu'un prof a envoyée en retard. */
export interface LecturePrestation {
  prestataire: string | null
  numero: string | null
  date: string | null
  total_ht: number | null
  lignes: LignePrestationLue[]
  avertissement: string | null
}

/**
 * Même convention que `lireFactureFournisseur` : un champ texte absent se
 * dit par une chaîne vide, pas par `null`. Les montants seuls gardent
 * `null`, parce que zéro y est une valeur comme une autre.
 */
const texte = (description: string) => ({
  type: 'string',
  description: `${description} Chaîne vide si l’information ne figure pas sur le document.`,
})
const nombre = (description: string) => ({ type: ['number', 'null'], description })

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prestataire: texte('Nom de la personne ou de la société qui a ÉMIS la facture.'),
    numero: texte('Numéro de la facture.'),
    date: texte('Date d’émission au format AAAA-MM-JJ.'),
    total_ht: nombre('Total hors taxes de la facture, tel qu’il est écrit.'),
    lignes: {
      type: 'array',
      description: 'Une entrée par ligne facturée, dans l’ordre du document.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          date: texte('Date de la prestation au format AAAA-MM-JJ, si la ligne la précise.'),
          detail: texte('Ce qui a été fait, en une ligne, tel que la facture le décrit.'),
          formation: texte('Formation concernée si elle est nommée : PASS, LAS, Terminale Santé…'),
          categorie: texte('La catégorie la plus adaptée, recopiée exactement depuis la liste fournie.'),
          unite: {
            type: 'string',
            enum: ['heure', 'journee', 'mission', ''],
            description: 'Ce que compte la quantité. Chaîne vide si la ligne ne le dit pas.',
          },
          quantite: nombre('Quantité facturée (nombre d’heures, de journées ou de missions).'),
          prix_unitaire: nombre('Prix unitaire hors taxes.'),
        },
        required: ['date', 'detail', 'formation', 'categorie', 'unite', 'quantite', 'prix_unitaire'],
      },
    },
    avertissement: texte(
      'Une phrase si le document n’est pas une facture de prestation, est illisible, ou si les lignes ne font pas le total.'
    ),
  },
  required: ['prestataire', 'numero', 'date', 'total_ht', 'lignes', 'avertissement'],
} as const

export async function lireFacturePrestation(pdf: Buffer, categories: string[]): Promise<LecturePrestation> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text: `Cette facture vient d'un intervenant (professeur, coach, surveillant) qui a travaillé pour Diploma Santé et l'envoie en retard. On va en recopier les lignes dans une déclaration de prestations : relève-les telles qu'elles sont écrites, une entrée par ligne facturée, sans rien inventer et sans rien regrouper.

Une ligne qui porte un total sans prix unitaire se lit comme une quantité de 1 au prix du total. Un champ texte absent vaut une chaîne vide, un montant absent vaut null.

Catégories de prestation possibles (recopie exactement l'une d'elles dans "categorie", ou laisse vide si aucune ne convient) :
${categories.map((c) => `- ${c}`).join('\n')}`,
          },
        ],
      },
    ],
  })
  if (response.stop_reason === 'refusal') throw new Error('La lecture du document a été refusée.')
  const bloc = response.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') throw new Error('Aucun contenu lisible dans la réponse.')

  const lu = JSON.parse(bloc.text) as Record<string, unknown>
  const vide = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  const brutes = Array.isArray(lu.lignes) ? (lu.lignes as Record<string, unknown>[]) : []
  return {
    prestataire: vide(lu.prestataire),
    numero: vide(lu.numero),
    date: vide(lu.date),
    total_ht: num(lu.total_ht),
    lignes: brutes.map((l) => ({
      date: vide(l.date),
      detail: vide(l.detail),
      formation: vide(l.formation),
      categorie: vide(l.categorie),
      unite: l.unite === 'heure' || l.unite === 'journee' || l.unite === 'mission' ? l.unite : null,
      quantite: num(l.quantite),
      prix_unitaire: num(l.prix_unitaire),
    })),
    avertissement: vide(lu.avertissement),
  }
}
