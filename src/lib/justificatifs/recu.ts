import Anthropic from '@anthropic-ai/sdk'

/** Ce qu'on lit sur un reçu de carte ou d'abonnement. */
export interface LectureRecu {
  /** Raison sociale de l'émetteur : « Anysphere, Inc. ». */
  fournisseur: string | null
  /** Le nom commercial, celui que la banque imprime : « Cursor ». */
  marque: string | null
  /** Date du paiement, à défaut celle du reçu (AAAA-MM-JJ). */
  date: string | null
  /** Ce qui a été débité, taxes comprises. */
  montant: number | null
  /** Code ISO à trois lettres. */
  devise: string
  montantTva: number | null
  tauxTva: number | null
  numero: string | null
  /** Les quatre derniers chiffres de la carte débitée. */
  carte: string | null
  avertissement: string | null
}

const texte = (description: string) => ({
  type: 'string',
  description: `${description} Chaîne vide si l’information ne figure pas sur le document.`,
})

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fournisseur: texte('Raison sociale de l’émetteur du reçu (pas Diploma Santé).'),
    marque: texte(
      'Nom commercial sous lequel le paiement apparaît sur un relevé bancaire (ex. « Cursor » pour Anysphere, « ChatGPT » ou « OpenAI », « Uber Eats »).'
    ),
    date: texte('Date du paiement au format AAAA-MM-JJ ; à défaut, date du reçu.'),
    montant: { type: ['number', 'null'], description: 'Montant total effectivement payé, taxes comprises.' },
    devise: texte('Devise du montant payé, code ISO à trois lettres (EUR, USD, GBP…).'),
    montant_tva: { type: ['number', 'null'], description: 'Montant de TVA ou de taxe (0 si aucune).' },
    taux_tva: { type: ['number', 'null'], description: 'Taux de TVA principal en pourcentage (20, 10, 5.5, 0).' },
    numero: texte('Numéro du reçu ou de la facture.'),
    carte: texte('Les quatre derniers chiffres de la carte débitée (ex. « 7514 »), chiffres seulement.'),
    avertissement: texte('Une phrase si le document n’est pas un reçu de paiement ou s’il est illisible.'),
  },
  required: ['fournisseur', 'marque', 'date', 'montant', 'devise', 'montant_tva', 'taux_tva', 'numero', 'carte', 'avertissement'],
} as const

/**
 * Lit un reçu : qui, quand, combien, dans quelle devise.
 *
 * C'est ce montant qui désigne le mouvement bancaire : un centime d'écart et
 * le reçu irait sur le paiement d'à côté. Le modèle de lecture des factures
 * fait donc aussi celui-ci, pas le modèle rapide de l'aiguillage.
 */
export async function lireRecu(pdf: Buffer): Promise<LectureRecu> {
  const res = await new Anthropic().messages.create({
    model: 'claude-opus-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text:
              'Ce reçu concerne un achat payé par Diploma Santé, par carte ou par prélèvement. ' +
              'Lis-le tel qu’il est écrit, sans rien inventer : un texte absent vaut une chaîne vide, un montant absent vaut null. ' +
              'Le montant est celui réellement débité (« Amount paid », « Total payé »), pas un sous-total.',
          },
        ],
      },
    ],
  })
  if (res.stop_reason === 'refusal') throw new Error('La lecture du reçu a été refusée.')
  const bloc = res.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') throw new Error('Aucun contenu lisible dans la réponse.')
  const lu = JSON.parse(bloc.text) as Record<string, unknown>
  const vide = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const date = vide(lu.date)
  return {
    fournisseur: vide(lu.fournisseur),
    marque: vide(lu.marque),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    montant: num(lu.montant),
    devise: (vide(lu.devise) ?? 'EUR').toUpperCase().slice(0, 3),
    montantTva: num(lu.montant_tva),
    tauxTva: num(lu.taux_tva),
    numero: vide(lu.numero),
    carte: (vide(lu.carte) ?? '').replace(/\D/g, '').slice(-4) || null,
    avertissement: vide(lu.avertissement),
  }
}
