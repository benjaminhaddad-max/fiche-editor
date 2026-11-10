import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { InvoiceDetail } from '@/components/invoices/InvoiceDetail'
import { requireRole } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { activeBrand } from '@/lib/brand/actif'
import { isPennylaneConfigured, variableJetonPennylane } from '@/lib/pennylane/client'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Invoice, InvoiceLine } from '@/lib/types'
import { markInvoicePaid, pushToPennylane } from '@/app/(app)/factures/actions'
import { ajouterRegularisation, regenererPdf } from '@/app/(app)/admin/factures/correction-actions'
import { Input } from '@/components/ui/Field'
import { estAuteur, type Employment } from '@/lib/types'
import { trimestreDe } from '@/lib/invoice/trimestre'

export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = await params
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!data) notFound()
  const invoice = data as Invoice

  const [{ data: lineData }, { data: provider }] = await Promise.all([
    supabase
      .from('inv_invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order'),
    supabase
      .from('inv_providers')
      .select('id, legal_name, pennylane_supplier_id, employment_type')
      .eq('id', invoice.provider_id)
      .maybeSingle(),
  ])

  // Le fournisseur Pennylane est retrouvé ou créé à l'envoi s'il manque.
  const pennylaneReady = await isPennylaneConfigured()
  const variableJeton = await variableJetonPennylane()
  const compta = (await activeBrand()).comptabilite
  const auteur = estAuteur((provider?.employment_type ?? null) as Employment | null)
  const corrigeable = auteur && invoice.status !== 'paid' && invoice.pdf_source !== 'uploaded'

  return (
    <>
      <Link
        href="/admin/factures"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Factures
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <a href={`/api/factures/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
          <Button variant="secondary">
            <Download size={16} />
            PDF
          </Button>
        </a>

        {compta && (
          <form action={pushToPennylane}>
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <SubmitButton
              variant="secondary"
              disabled={!pennylaneReady}
              pendingLabel="Synchronisation…"
            >
              <RefreshCw size={16} />
              {invoice.pennylane_status === 'synced'
                ? 'Renvoyer en comptabilité'
                : 'Envoyer en comptabilité'}
            </SubmitButton>
          </form>
        )}

        {invoice.status !== 'paid' && (
          <form action={markInvoicePaid}>
            <input type="hidden" name="invoice_id" value={invoice.id} />
            <SubmitButton variant="success" pendingLabel="Enregistrement…">
              Marquer comme payée
            </SubmitButton>
          </form>
        )}
      </div>

      {compta && !pennylaneReady && (
        <div className="mb-6 rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy/70">
          Synchronisation Pennylane désactivée : la variable{' '}
          <code className="rounded bg-cream-deep px-1 py-0.5 text-xs">
            {variableJeton}
          </code>{' '}
          n’est pas configurée.
        </div>
      )}

      {compta && pennylaneReady && !provider?.pennylane_supplier_id && (
        <div className="mb-6 rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy/70">
          {provider?.legal_name} n’est pas encore relié à Pennylane : le fournisseur sera retrouvé par SIRET ou par
          nom, ou créé, au moment de l’envoi.{' '}
          <Link href={`/admin/prestataires/${invoice.provider_id}`} className="font-medium underline">
            Fiche
          </Link>
        </div>
      )}

      {invoice.ai_check?.message && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Lecture du PDF :</span> {invoice.ai_check.message}
        </div>
      )}

      {compta && invoice.pennylane_status === 'error' && invoice.pennylane_error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">Erreur Pennylane :</span> {invoice.pennylane_error}
        </div>
      )}

      {invoice.pennylane_status === 'synced' && (
        <Card className="mb-6 px-4 py-3 text-sm text-navy/80">
          Synchronisée dans Pennylane le {formatDate(invoice.pennylane_synced_at)} — facture
          d’achat n° {invoice.pennylane_invoice_id}.
        </Card>
      )}

      {auteur && (
        <Card className="mb-6 px-4 py-4 text-sm sm:px-5">
          <p className="font-semibold text-navy">Note de droits d’auteur</p>
          <p className="mt-1 text-xs text-muted">
            Trimestre Urssaf : {trimestreDe(invoice.paid_at ?? invoice.issue_date).label}
            {invoice.paid_at ? ' (date de versement)' : ' (provisoire : date de la note, tant qu’elle n’est pas payée)'}.
            {' '}
            <Link href="/admin/droits-auteur" className="font-medium underline">
              Récapitulatif par trimestre
            </Link>
          </p>
          {corrigeable ? (
            <>
              <form action={ajouterRegularisation} className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <Input
                  name="libelle"
                  label="Ligne de régularisation"
                  placeholder="Ex. : séance du 12/10 oubliée, tarif corrigé…"
                  required
                />
                <Input
                  name="montant"
                  label="Montant brut (€)"
                  placeholder="-50 ou 120"
                  inputMode="decimal"
                  required
                />
                <SubmitButton variant="secondary" pendingLabel="Ajout…">
                  Ajouter et refaire la note
                </SubmitButton>
              </form>
              <p className="mt-2 text-xs text-muted">
                En brut, positif ou négatif. Le précompte et le net sont recalculés, le PDF est refait ;
                les lignes d’origine restent. Si la note est déjà en comptabilité, renvoyez-la ensuite.
              </p>
              <form action={regenererPdf} className="mt-3">
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                  <RefreshCw size={14} />
                  Refaire le PDF (après une correction de la fiche)
                </SubmitButton>
              </form>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {invoice.status === 'paid'
                ? 'Note payée : elle ne se corrige plus. Un écart se règle par une nouvelle note.'
                : 'PDF déposé par l’auteur : la correction passe par une nouvelle note de sa part.'}
            </p>
          )}
        </Card>
      )}

      <InvoiceDetail invoice={invoice} lines={(lineData ?? []) as InvoiceLine[]} />
    </>
  )
}
