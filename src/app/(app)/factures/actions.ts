'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireProvider, requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import {
  INVOICE_BUCKET,
  generateAndStorePdf,
  uploadedPdfPath,
} from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { syncInvoiceToPennylane } from '@/lib/invoice/pennylane'
import { notifyInvoiceReceived } from '@/lib/email/notify'
import { createServerSupabase } from '@/lib/supabase/server'

export interface InvoiceActionResult {
  error?: string
}

/**
 * Transmet la facture à Diploma Santé.
 *
 * Ce n'est plus un bouton : « Émise » puis « Envoyer à Diploma Santé »
 * faisait deux étapes là où les coachs n'en voyaient qu'une, et trois
 * d'entre elles se sont arrêtées à la première. La facture part donc dès
 * qu'elle est complète — à la génération, ou au dépôt du PDF pour qui
 * fournit le sien.
 */
async function transmettre(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  invoiceId: string,
  providerId: string,
  actorId: string
): Promise<void> {
  const { data } = await supabase
    .from('inv_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('provider_id', providerId)
    .eq('status', 'issued')
    .select('id')

  if (!data?.length) return

  await logAudit(supabase, {
    actorId,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'send',
  })
  await notifyInvoiceReceived(invoiceId)
}

/**
 * Genere la facture a partir des prestations validees selectionnees.
 * La creation elle-meme est atomique cote Postgres (inv_create_invoice) ;
 * le PDF est produit juste apres et n'est pas bloquant.
 */
export async function createInvoice(
  _prev: InvoiceActionResult,
  formData: FormData
): Promise<InvoiceActionResult> {
  const { user, provider } = await requireProvider()

  const missionIds = formData.getAll('mission_ids').map(String).filter(Boolean)
  if (missionIds.length === 0) {
    return { error: 'Sélectionnez au moins une prestation à facturer.' }
  }

  const supabase = await createServerSupabase()
  const { data: invoiceId, error } = await supabase.rpc('inv_create_invoice', {
    p_provider_id: provider.id,
    p_mission_ids: missionIds,
  })

  if (error || !invoiceId) {
    return { error: error?.message ?? 'La facture n’a pas pu être créée.' }
  }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: invoiceId as string,
    action: 'create',
    payload: { missions: missionIds.length },
  })

  // Le PDF est un livrable, pas une condition d'existence de la facture :
  // s'il echoue, la facture reste valide et le PDF sera regenere a la volee.
  try {
    await generateAndStorePdf(invoiceId as string)
  } catch (err) {
    console.error('[createInvoice:pdf]', err)
  }

  // Qui fournit sa propre facture la transmet en déposant son PDF ; les
  // autres n'ont rien à ajouter, la facture part tout de suite.
  if (provider.invoice_mode !== 'uploaded') {
    await transmettre(supabase, invoiceId as string, provider.id, user.id)
  }

  revalidatePath('/admin/factures')
  revalidatePath('/factures')
  revalidatePath('/missions')
  redirect(`/factures/${invoiceId}`)
}

const MAX_PDF_BYTES = 10 * 1024 * 1024

/**
 * Le prestataire depose sa propre facture PDF.
 *
 * Le fichier remplace le PDF genere comme document officiel, mais les
 * MONTANTS ne bougent pas : ils restent ceux valides en base. C'est ce qui
 * evite de retomber sur le probleme de rapprochement Pennylane — le PDF n'est
 * jamais lu comme source de verite.
 */
export async function uploadInvoicePdf(
  _prev: InvoiceActionResult,
  formData: FormData
): Promise<InvoiceActionResult> {
  const { user, provider } = await requireProvider()
  const invoiceId = String(formData.get('invoice_id') ?? '')
  const file = formData.get('file')

  if (!invoiceId) return { error: 'Facture introuvable.' }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Sélectionnez le PDF de votre facture.' }
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Le fichier doit être un PDF.' }
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: 'Le PDF ne doit pas dépasser 10 Mo.' }
  }

  const supabase = await createServerSupabase()
  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .eq('provider_id', provider.id)
    .maybeSingle()

  if (!invoice) return { error: 'Facture introuvable.' }
  if (!['draft', 'issued'].includes(invoice.status)) {
    return { error: 'Cette facture a déjà été transmise, elle n’est plus modifiable.' }
  }

  const path = uploadedPdfPath(provider.id, invoiceId)
  const bytes = Buffer.from(await file.arrayBuffer())

  // Le bucket est prive : l'ecriture passe par la cle de service, apres le
  // controle de propriete ci-dessus.
  const service = createServiceClient()
  const { error: storageError } = await service.storage
    .from(INVOICE_BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })

  if (storageError) return { error: `Dépôt impossible : ${storageError.message}` }

  const { error } = await supabase
    .from('inv_invoices')
    .update({
      pdf_path: path,
      pdf_source: 'uploaded',
      uploaded_filename: file.name,
      uploaded_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('provider_id', provider.id)

  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: invoiceId,
    action: 'upload_pdf',
    payload: { filename: file.name, bytes: file.size },
  })

  // Le PDF déposé était la dernière pièce : la facture part.
  await transmettre(supabase, invoiceId, provider.id, user.id)

  revalidatePath('/factures')
  revalidatePath('/admin/factures')
  revalidatePath(`/factures/${invoiceId}`)
  return {}
}

/** Le prestataire revient au PDF genere par la plateforme. */
export async function useGeneratedPdf(formData: FormData): Promise<void> {
  const { provider } = await requireProvider()
  const invoiceId = String(formData.get('invoice_id') ?? '')
  if (!invoiceId) return

  const supabase = await createServerSupabase()
  const { data: invoice } = await supabase
    .from('inv_invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('provider_id', provider.id)
    .in('status', ['draft', 'issued'])
    .maybeSingle()
  if (!invoice) return

  await supabase
    .from('inv_invoices')
    .update({ pdf_source: 'generated', uploaded_filename: null, uploaded_at: null })
    .eq('id', invoiceId)

  try {
    await generateAndStorePdf(invoiceId)
  } catch (err) {
    console.error('[useGeneratedPdf]', err)
  }

  revalidatePath(`/factures/${invoiceId}`)
}

/**
 * Filet de sécurité : une facture restée « à transmettre » (PDF généré en
 * échec, par exemple) peut encore partir à la main.
 */
export async function sendInvoice(formData: FormData): Promise<void> {
  const { user, provider } = await requireProvider()
  const id = String(formData.get('invoice_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  await transmettre(supabase, id, provider.id, user.id)

  revalidatePath('/factures')
  revalidatePath(`/factures/${id}`)
  revalidatePath('/admin/factures')
}

/** Admin : marque une facture comme payee. */
export async function markInvoicePaid(formData: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(formData.get('invoice_id') ?? '')
  if (!id) return

  const supabase = await createServerSupabase()
  await supabase
    .from('inv_invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: 'mark_paid',
  })

  revalidatePath('/admin/factures')
  revalidatePath(`/admin/factures/${id}`)
}

/** Admin : envoie la facture dans Pennylane en facture d'achat. */
export async function pushToPennylane(formData: FormData): Promise<void> {
  const user = await requireRole('admin')
  const id = String(formData.get('invoice_id') ?? '')
  if (!id) return

  const result = await syncInvoiceToPennylane(id)

  const supabase = await createServerSupabase()
  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: id,
    action: result.ok ? 'pennylane_sync' : 'pennylane_sync_failed',
    payload: result.ok
      ? { pennylane_invoice_id: result.pennylaneInvoiceId }
      : { error: result.error },
  })

  revalidatePath('/admin/factures')
  revalidatePath(`/admin/factures/${id}`)
}
