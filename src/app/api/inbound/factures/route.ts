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

interface Boite {
  Address?: string
  Name?: string
}

interface Courriel {
  MessageId?: string
  Uuid?: string[]
  From?: Boite
  ReplyTo?: Boite
  Headers?: Record<string, string | string[]>
  Subject?: string
  Attachments?: Piece[]
}

/**
 * Adresses susceptibles d'être celle du manager. Les factures arrivent via
 * depotfactures@diploma-sante.fr, qui fait suivre : selon le relais,
 * l'expéditeur d'origine reste dans From, ou passe dans Reply-To ou dans un
 * en-tête X-Original-*.
 */
function expediteurs(c: Courriel): string[] {
  const entete = (nom: string) => {
    const v = Object.entries(c.Headers ?? {}).find(([k]) => k.toLowerCase() === nom)?.[1]
    return (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.match(/[\w.+-]+@[\w.-]+/g) ?? [])
  }
  return [
    c.From?.Address,
    c.ReplyTo?.Address,
    ...entete('x-original-from'),
    ...entete('x-original-sender'),
    ...entete('reply-to'),
  ]
    .filter((a): a is string => Boolean(a))
    .map((a) => a.toLowerCase().trim())
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
  const adresses = [...new Set(expediteurs(c))]
  if (!adresses.length) return

  const { data: equipe } = await db
    .from('inv_users')
    .select('id, email, full_name, role, is_active')
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
  const auteur = (equipe ?? []).find((u) => adresses.includes(u.email.toLowerCase()))
  if (!auteur) {
    console.warn('[inbound] expéditeur ignoré :', adresses.join(', '))
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
