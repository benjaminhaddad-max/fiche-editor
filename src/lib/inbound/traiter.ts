import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { enregistrerFactureDiverse } from '@/lib/invoice/misc'
import { classerDocument, enregistrerBulletin } from '@/lib/paie/bulletins'
import { createServiceClient } from '@/lib/supabase/service'

export interface Courriel {
  /** Adresses pouvant être celle du manager (From, Reply-To, en-têtes de transfert). */
  expediteurs: string[]
  sujet: string | null
  messageId: string | null
  pieces: { nom: string; contenu: Buffer }[]
}

export type Issue = 'ignore' | 'traite'

const MAX_PDF = 15 * 1024 * 1024

/**
 * Ce qui arrive dans la boîte de dépôt.
 *
 * Seuls les managers et administrateurs actifs sont écoutés : un message venu
 * d'ailleurs est ignoré, sans réponse. Chaque PDF est d'abord identifié :
 * une facture rejoint les factures validées, un bulletin de paie l'espace de
 * la personne concernée. L'expéditeur reçoit un accusé, ou la raison du refus.
 */
export async function traiterCourriel(c: Courriel): Promise<Issue> {
  const db = createServiceClient()
  const adresses = [...new Set(c.expediteurs.map((a) => a.toLowerCase().trim()))]
  const { data: equipe } = await db
    .from('inv_users')
    .select('id, email, full_name, role')
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
  const auteur = (equipe ?? []).find((u) => adresses.includes(u.email.toLowerCase()))
  if (!auteur) {
    console.warn('[depotfactures] expéditeur ignoré :', adresses.join(', '))
    return 'ignore'
  }

  const refuser = (raison: string) =>
    deliver({
      to: { email: auteur.email, name: auteur.full_name },
      ...templates.inboundRefused({ reason: raison }),
      template: 'inbound_refused',
      entityType: 'user',
      entityId: auteur.id,
    })

  const pdfs = c.pieces.filter((p) => p.nom.toLowerCase().endsWith('.pdf'))
  if (pdfs.length === 0) {
    await refuser(`Votre message « ${c.sujet ?? 'sans objet'} » ne contenait aucune facture au format PDF.`)
    return 'traite'
  }

  for (const piece of pdfs) {
    if (piece.contenu.length > MAX_PDF) {
      await refuser(`La pièce « ${piece.nom} » dépasse 15 Mo.`)
      continue
    }

    let type: 'facture' | 'bulletin' | 'autre' = 'facture'
    try {
      type = await classerDocument(piece.contenu)
    } catch (err) {
      console.error('[depot] classement', err)
    }

    if (type === 'bulletin') {
      const b = await enregistrerBulletin({
        pdf: piece.contenu,
        filename: piece.nom,
        source: 'email',
        uploadedBy: auteur.id,
      })
      if (b.ok) {
        await deliver({
          to: { email: auteur.email, name: auteur.full_name },
          ...templates.payslipFiled({ name: auteur.full_name, personne: b.personne!, periode: b.periode! }),
          template: 'payslip_filed',
          entityType: 'provider',
          entityId: b.documentId!,
        })
      } else {
        await refuser(`« ${piece.nom} » (bulletin de paie) : ${b.error}`)
      }
      continue
    }

    const r = await enregistrerFactureDiverse({
      pdf: piece.contenu,
      filename: piece.nom,
      submittedBy: auteur.id,
      channel: 'email',
      emailMessageId: c.messageId,
    })
    if (!r.ok) {
      await refuser(`« ${piece.nom} » : ${r.error}`)
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
  return 'traite'
}
