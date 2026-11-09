import Link from 'next/link'
import { EmptyState, PageHeader } from '@/components/ui/Page'
import { NewInvoiceForm, type BillableMission } from '@/components/invoices/NewInvoiceForm'
import { requireProvider } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isSalaried } from '@/lib/types'
import { createInvoice } from '../actions'

interface Row {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  total_ht: number
  statement_id: string
  statement: { cycle_month: string } | null
  category: { name: string; provider_label: string | null } | null
}

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const libelleMois = (m: string) => MOIS.format(new Date(`${m}-15T00:00:00Z`))

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ bordereau?: string; mode?: string }>
}) {
  const { bordereau, mode } = await searchParams
  const { provider } = await requireProvider()
  if (isSalaried(provider.employment_type)) redirect('/missions')
  const supabase = await createServerSupabase()

  // On ne facture que ce qu'un bordereau porte.
  //
  // Une ligne validée « bon à payer » à l'unité devenait facturable sur
  // l'instant, sans attendre le bordereau du mois : Pratchi a facturé deux
  // préparations de tote bags le 1er octobre, puis ses six autres
  // prestations le 2, à l'arrivée du bordereau. Deux factures pour un seul
  // mois, et deux règlements à suivre, parce que quelqu'un avait coché deux
  // lignes trois jours trop tôt.
  //
  // Le bordereau est le document qui dit ce qu'on facture : rien avant lui.
  const query = supabase
    .from('inv_missions')
    .select(
      'id, detail, start_date, end_date, total_ht, statement_id, statement:inv_statements(cycle_month), category:inv_categories(name, provider_label)'
    )
    .eq('provider_id', provider.id)
    .eq('status', 'approved')
    .is('invoice_id', null)
    .not('statement_id', 'is', null)
    .order('start_date')
  const { data } = await query
  const toutes = (data ?? []) as unknown as Row[]

  // Une facture, un bordereau : celui du mois le plus récent.
  //
  // Sans bordereau choisi, la page proposait toutes les lignes ouvertes, de
  // tous les mois. Dounia a ainsi refacturé en novembre son septembre, déjà
  // réglé hors de la plateforme, avec son octobre : 14 639 € au lieu de
  // 7 132 €. Un bordereau plus ancien resté ouvert ne se facture plus seul —
  // la comptabilité doit d'abord dire s'il a déjà été réglé.
  const mois = [...new Set(toutes.map((m) => m.statement?.cycle_month ?? ''))].filter(Boolean).sort()
  const dernier = mois[mois.length - 1]
  const courant = toutes.find((m) => m.statement?.cycle_month === dernier)?.statement_id
  const choisi = bordereau && toutes.some((m) => m.statement_id === bordereau && m.statement?.cycle_month === dernier)
    ? bordereau
    : courant
  const anciens = mois.slice(0, -1)

  const missions: BillableMission[] = toutes.filter((m) => m.statement_id === choisi).map((m) => ({
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

      {anciens.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Des prestations de {anciens.map(libelleMois).join(', ')} n’ont pas été facturées ici. Elles ont peut-être déjà
          été réglées autrement : elles ne figurent pas sur cette facture. Si ce n’est pas le cas, écrivez à la
          comptabilité depuis la messagerie.
        </div>
      )}

      {missions.length === 0 ? (
        <EmptyState
          title="Aucune prestation à facturer"
          description="Rien à facturer pour l’instant : votre bordereau du mois arrive le 1er, avec toutes vos prestations validées."
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
          statementId={choisi}
          defaultMode={mode === 'uploaded' ? 'uploaded' : provider.invoice_mode}
        />
      )}
    </>
  )
}
