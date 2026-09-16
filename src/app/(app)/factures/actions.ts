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
import { estLectureConfiguree, lireFacture } from '@/lib/invoice/extract'
import { money } from '@/lib/format'
import { isSalaried, type AiCheck } from '@/lib/types'

export interface InvoiceActionResult {
  error?: string
  /** Le PDF déposé ne correspond pas au montant attendu. */
  warning?: string
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
  if (isSalaried(provider.employment_type)) {
    return { error: 'Vous êtes payé en salaire : vous n’avez pas de facture à établir.' }
  }
  // « generated » : la plateforme produit la facture et la transmet.
  // « uploaded » : le prestataire déposera la sienne, qui partira au dépôt.
  const mode = formData.get('mode') === 'uploaded' ? 'uploaded' : provider.invoice_mode
  const statementId = String(formData.get('statement_id') ?? '') || null

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

  if (statementId) {
    await createServiceClient()
      .from('inv_invoices')
      .update({ statement_id: statementId })
      .eq('id', invoiceId as string)
    await createServiceClient()
      .from('inv_statements')
      .update({ invoice_id: invoiceId as string, status: 'invoiced' })
      .eq('id', statementId)
      .eq('provider_id', provider.id)
  }

  // Qui fournit sa propre facture la transmet en déposant son PDF ; les
  // autres n'ont rien à ajouter, la facture part tout de suite.
  if (mode !== 'uploaded') {
    await transmettre(supabase, invoiceId as string, provider.id, user.id)
  }

  revalidatePath('/admin/factures')
  revalidatePath('/factures')
  revalidatePath('/missions')
  redirect(`/factures/${invoiceId}`)
}

const MAX_PDF_BYTES = 10 * 1024 * 1024

/**
 * Lit le PDF et compare son total HT à ce qui était prévu.
 *
 * Le modèle transcrit, il ne décide pas : une lecture impossible ne bloque
 * rien (matches: null), seul un écart constaté arrête la transmission.
 */
async function controlerMontant(pdf: Buffer, attendu: number): Promise<AiCheck> {
  const base: AiCheck = {
    checked_at: new Date().toISOString(),
    expected_ht: attendu,
    read_ht: null,
    read_number: null,
    matches: null,
    message: null,
  }
  if (!estLectureConfiguree()) return { ...base, message: 'Contrôle automatique indisponible.' }
  try {
    const lu = await lireFacture(pdf)
    const somme = lu.lignes.reduce((s, l) => s + Number(l.total_ht), 0)
    const total = lu.total_ht_annonce ?? (lu.lignes.length ? Math.round(somme * 100) / 100 : null)
    if (total === null) {
      return { ...base, read_number: lu.numero, message: lu.avertissement ?? 'Montant illisible sur le document.' }
    }
    const ecart = Math.abs(total - attendu)
    const ok = ecart < 0.01
    return {
      ...base,
      read_ht: total,
      read_number: lu.numero,
      matches: ok,
      message: ok
        ? null
        : `Attention, le montant ne correspond pas : votre facture indique ${money(total)} HT, alors que ${money(attendu)} HT étaient prévus (écart de ${money(ecart)}).`,
    }
  } catch (err) {
    console.error('[controlerMontant]', err)
    return { ...base, message: 'Le document n’a pas pu être lu automatiquement.' }
  }
}

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
    .select('id, status, subtotal_ht, number')
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

  // Contrôle par lecture du PDF : un montant différent de ce qui a été
  // validé est signalé au prestataire AVANT de partir chez Diploma Santé.
  const controle = await controlerMontant(bytes, Number(invoice.subtotal_ht))
  await createServiceClient().from('inv_invoices').update({ ai_check: controle }).eq('id', invoiceId)

  revalidatePath(`/factures/${invoiceId}`)
  if (controle.matches === false) {
    return { warning: controle.message ?? 'Le montant ne correspond pas.' }
  }

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
