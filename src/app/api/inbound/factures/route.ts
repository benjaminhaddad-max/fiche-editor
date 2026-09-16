import { after, NextResponse } from 'next/server'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { enregistrerFactureDiverse } from '@/lib/invoice/misc'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 300

interface Piece {
  Name?: string
  ContentType?: string
  ContentLength?: number
  DownloadToken?: string
}

interface Courriel {
  MessageId?: string
  Uuid?: string[]
  From?: { Address?: string; Name?: string }
  Subject?: string
  Attachments?: Piece[]
}

const MAX_PDF = 15 * 1024 * 1024

/**
 * Adresse de dépôt des factures diverses (Brevo, « inbound parsing »).
 *
 * Un manager transfère une facture à l'adresse dédiée : chaque PDF joint est
 * lu, le fournisseur retrouvé ou créé, et la facture rangée dans les
 * factures validées. Seuls les managers et administrateurs actifs sont
 * écoutés — n'importe qui d'autre est ignoré, sans réponse.
 *
 * On répond tout de suite à Brevo, puis on traite : la lecture d'un PDF
 * prend jusqu'à une minute par pièce.
 */
export async function POST(request: Request) {
  const secret = process.env.INBOUND_SECRET ?? process.env.CRON_SECRET
  const url = new URL(request.url)
  if (!secret || url.searchParams.get('token') !== secret) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }

  const corps = (await request.json().catch(() => null)) as { items?: Courriel[] } | null
  const courriels = corps?.items ?? []

  after(async () => {
    for (const c of courriels) {
      try {
        await traiter(c)
      } catch (err) {
        console.error('[inbound]', err)
      }
    }
  })

  return NextResponse.json({ ok: true, recus: courriels.length })
}

async function traiter(c: Courriel) {
  const db = createServiceClient()
  const adresse = c.From?.Address?.toLowerCase().trim()
  if (!adresse) return

  const { data: auteur } = await db
    .from('inv_users')
    .select('id, email, full_name, role, is_active')
    .ilike('email', adresse)
    .maybeSingle()
  if (!auteur?.is_active || !['manager', 'admin'].includes(auteur.role)) {
    console.warn('[inbound] expéditeur ignoré :', adresse)
    return
  }

  const refuser = (raison: string) =>
    deliver({
      to: { email: auteur.email, name: auteur.full_name },
      ...templates.inboundRefused({ reason: raison }),
      template: 'inbound_refused',
      entityType: 'user',
      entityId: auteur.id,
    })

  const pdfs = (c.Attachments ?? []).filter(
    (a) => a.DownloadToken && (a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf'))
  )
  if (pdfs.length === 0) {
    await refuser(`Votre message « ${c.Subject ?? 'sans objet'} » ne contenait aucune facture au format PDF.`)
    return
  }

  const messageId = c.MessageId ?? c.Uuid?.[0] ?? null
  for (const piece of pdfs) {
    if ((piece.ContentLength ?? 0) > MAX_PDF) {
      await refuser(`La pièce « ${piece.Name} » dépasse 15 Mo.`)
      continue
    }
    const res = await fetch(`https://api.brevo.com/v3/inbound/attachments/${encodeURIComponent(piece.DownloadToken!)}`, {
      headers: { 'api-key': process.env.BREVO_API_KEY ?? '' },
    })
    if (!res.ok) {
      await refuser(`La pièce « ${piece.Name} » n’a pas pu être récupérée (${res.status}).`)
      continue
    }
    const pdf = Buffer.from(await res.arrayBuffer())

    const r = await enregistrerFactureDiverse({
      pdf,
      filename: piece.Name ?? 'facture.pdf',
      submittedBy: auteur.id,
      channel: 'email',
      emailMessageId: messageId,
    })

    if (!r.ok) {
      await refuser(`« ${piece.Name} » : ${r.error}`)
      continue
    }
    await deliver({
      to: { email: auteur.email, name: auteur.full_name },
      ...templates.miscInvoiceFiled({
        name: auteur.full_name,
        supplier: r.fournisseur!,
        number: r.numero!,
        total: r.totalTtc!,
        created: Boolean(r.fournisseurCree),
      }),
      template: 'misc_invoice_filed',
      entityType: 'invoice',
      entityId: r.invoiceId!,
    })
  }
}
