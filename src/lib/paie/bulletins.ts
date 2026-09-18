import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'

const MOIS: Record<string, string> = {
  janvier: '01', fevrier: '02', mars: '03', avril: '04', mai: '05', juin: '06',
  juillet: '07', aout: '08', septembre: '09', octobre: '10', novembre: '11', decembre: '12',
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Type de document, pour aiguiller ce qui arrive dans la boîte. */
export async function classerDocument(pdf: Buffer): Promise<'facture' | 'bulletin' | 'autre'> {
  const client = new Anthropic()
  const res = await client.messages.create({
    // Un simple aiguillage : le modèle rapide suffit et coûte dix fois moins.
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['facture', 'bulletin', 'autre'] },
          },
          required: ['type'],
        },
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text:
              'Ce document est-il une facture (émise par un fournisseur ou un prestataire), ' +
              'un bulletin de paie (fiche de salaire d’un salarié), ou autre chose ?',
          },
        ],
      },
    ],
  })
  const bloc = res.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') return 'autre'
  return (JSON.parse(bloc.text) as { type: 'facture' | 'bulletin' | 'autre' }).type
}

export interface LectureBulletin {
  nom: string | null
  prenom: string | null
  periode: string | null
  brut: number | null
  net_a_payer: number | null
  cout_employeur: number | null
  employeur: string | null
  avertissement: string | null
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nom: { type: ['string', 'null'], description: 'Nom de famille du salarié.' },
    prenom: { type: ['string', 'null'], description: 'Prénom du salarié.' },
    periode: { type: ['string', 'null'], description: 'Mois de paie au format AAAA-MM.' },
    brut: { type: ['number', 'null'], description: 'Salaire brut du mois.' },
    net_a_payer: { type: ['number', 'null'], description: 'Net à payer au salarié.' },
    cout_employeur: { type: ['number', 'null'], description: 'Coût total employeur du mois, s’il figure sur le bulletin.' },
    employeur: { type: ['string', 'null'], description: 'Nom de l’employeur.' },
    avertissement: { type: ['string', 'null'], description: 'Une phrase si le document est illisible ou n’est pas un bulletin.' },
  },
  required: ['nom', 'prenom', 'periode', 'brut', 'net_a_payer', 'cout_employeur', 'employeur', 'avertissement'],
} as const

/** Lit un bulletin de paie : qui, quel mois, combien. */
export async function lireBulletin(pdf: Buffer): Promise<LectureBulletin> {
  const client = new Anthropic()
  const res = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
          {
            type: 'text',
            text:
              'Lis ce bulletin de paie et relève les informations demandées, telles qu’elles sont écrites, sans rien ' +
              'déduire. Le « coût employeur » est le total employeur (salaire brut + charges patronales) quand il ' +
              'figure ; sinon null.',
          },
        ],
      },
    ],
  })
  const bloc = res.content.find((b) => b.type === 'text')
  if (!bloc || bloc.type !== 'text') throw new Error('Lecture illisible.')
  return JSON.parse(bloc.text) as LectureBulletin
}

/** Normalise « Septembre 2026 », « 09/2026 », « 2026-09 » en 'AAAA-MM'. */
export function periodeNormalisee(brut: string | null): string | null {
  if (!brut) return null
  const t = brut.trim()
  let m = t.match(/^(\d{4})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}`
  m = t.match(/^(\d{2})[/-](\d{4})$/)
  if (m) return `${m[2]}-${m[1]}`
  const mots = norm(t)
  for (const [nom, num] of Object.entries(MOIS)) {
    if (mots.includes(nom)) {
      const annee = mots.match(/(20\d{2})/)?.[1]
      if (annee) return `${annee}-${num}`
    }
  }
  return null
}

export interface ResultatBulletin {
  ok: boolean
  error?: string
  personne?: string
  periode?: string
  documentId?: string
}

/**
 * Range un bulletin dans l'espace de la personne.
 *
 * Le rapprochement se fait sur le nom : c'est la seule donnée commune entre
 * le bulletin du cabinet et la fiche de la plateforme. Un bulletin qu'on ne
 * sait pas attribuer n'est pas rangé au hasard — il est signalé.
 */
export async function enregistrerBulletin(input: {
  pdf: Buffer
  filename: string
  source: 'email' | 'upload' | 'silae'
  uploadedBy: string | null
}): Promise<ResultatBulletin> {
  let lu: LectureBulletin
  try {
    lu = await lireBulletin(input.pdf)
  } catch (err) {
    return { ok: false, error: `Lecture impossible : ${err instanceof Error ? err.message : String(err)}` }
  }

  const periode = periodeNormalisee(lu.periode)
  const nomComplet = [lu.prenom, lu.nom].filter(Boolean).join(' ').trim()
  if (!nomComplet || !periode) {
    return { ok: false, error: lu.avertissement ?? 'Nom du salarié ou mois illisible sur le bulletin.' }
  }

  const db = createServiceClient()
  const { data: fiches } = await db
    .from('inv_providers')
    .select('id, legal_name, user:inv_users!inv_providers_user_id_fkey(full_name)')
  const liste = (fiches ?? []) as unknown as {
    id: string
    legal_name: string
    user: { full_name: string } | null
  }[]

  const cible = norm(nomComplet)
  const inverse = norm([lu.nom, lu.prenom].filter(Boolean).join(' '))
  const fiche = liste.find((f) => {
    const noms = [norm(f.user?.full_name), norm(f.legal_name)]
    return noms.includes(cible) || noms.includes(inverse)
  })
  if (!fiche) {
    return { ok: false, error: `Aucune personne ne correspond à « ${nomComplet} » sur la plateforme.` }
  }

  const chemin = `${fiche.id}/bulletins/${periode}.pdf`
  const { error: stockage } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(chemin, input.pdf, { contentType: 'application/pdf', upsert: true })
  if (stockage) return { ok: false, error: `Stockage impossible : ${stockage.message}` }

  const { data: doc, error } = await db
    .from('inv_documents')
    .upsert(
      {
        provider_id: fiche.id,
        kind: 'bulletin',
        period: periode,
        label: `Bulletin de salaire — ${periode}`,
        path: chemin,
        filename: input.filename,
        source: input.source,
        uploaded_by: input.uploadedBy,
        gross_amount: lu.brut,
        net_amount: lu.net_a_payer,
        cost_amount: lu.cout_employeur,
        ai_read: lu,
        file_hash: createHash('sha256').update(input.pdf).digest('hex'),
      },
      { onConflict: 'provider_id,kind,period' }
    )
    .select('id')
    .single()
  if (error) return { ok: false, error: `Enregistrement impossible : ${error.message}` }

  return { ok: true, personne: fiche.user?.full_name ?? fiche.legal_name, periode, documentId: doc.id }
}
