import Link from 'next/link'
import { EmptyState, PageHeader } from '@/components/ui/Page'
import { NewInvoiceForm, type BillableMission } from '@/components/invoices/NewInvoiceForm'
import { requireProvider } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { createInvoice } from '../actions'

interface Row {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  total_ht: number
  category: { name: string; provider_label: string | null } | null
}

export default async function NewInvoicePage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_missions')
    .select('id, detail, start_date, end_date, total_ht, category:inv_categories(name, provider_label)')
    .eq('provider_id', provider.id)
    .eq('status', 'approved')
    .is('invoice_id', null)
    .order('start_date')

  const missions: BillableMission[] = ((data ?? []) as unknown as Row[]).map((m) => ({
    id: m.id,
    detail: m.detail,
    start_date: m.start_date,
    end_date: m.end_date,
    total_ht: Number(m.total_ht),
    category_name: m.category?.provider_label || m.category?.name || '—',
  }))

  const profileIncomplete =
    !provider.legal_name || !provider.address_line1 || !provider.postal_code || !provider.city

  return (
    <>
      <PageHeader
        title="Générer ma facture"
        description="Sélectionnez les prestations validées à faire figurer sur la facture. Les montants ne sont pas modifiables : ce sont ceux qui ont été validés."
      />

      {profileIncomplete && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Votre profil de facturation est incomplet (raison sociale et adresse
          obligatoires).{' '}
          <Link href="/profil" className="font-semibold underline">
            Le compléter
          </Link>
          .
        </div>
      )}

      {missions.length === 0 ? (
        <EmptyState
          title="Aucune prestation à facturer"
          description="Seules les prestations validées par votre manager puis par l’administration peuvent être facturées."
          action={
            <Link href="/missions" className="text-sm font-medium text-gold-dark underline">
              Voir mes prestations
            </Link>
          }
        />
      ) : (
        <NewInvoiceForm
          action={createInvoice}
          missions={missions}
          vatRate={Number(provider.vat_rate)}
        />
      )}
    </>
  )
}
