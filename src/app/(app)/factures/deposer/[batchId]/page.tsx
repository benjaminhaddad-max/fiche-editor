import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/ui/Page'
import { AffectationLignes, type LigneAffectable } from '@/components/depot/AffectationLignes'
import { requireProvider } from '@/lib/auth'
import { getManagers, getProviderCategories } from '@/lib/queries'
import { createServerSupabase } from '@/lib/supabase/server'
import { confirmerLignes } from '../actions'

export default async function AffecterPage({
  params,
}: {
  params: Promise<{ batchId: string }>
}) {
  const { batchId } = await params
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_import_lines')
    .select('id, description, quantity, unit_amount_ht, total_ht, line_date, source_file')
    .eq('batch_id', batchId)
    .eq('provider_id', provider.id)
    .eq('status', 'extracted')
    .order('sort_order')

  if (!data?.length) notFound()

  const [managers, categories] = await Promise.all([getManagers(), getProviderCategories()])

  return (
    <>
      <Link
        href="/factures/deposer"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Déposer une facture
      </Link>

      <PageHeader
        title="Qui a commandé quoi ?"
        description="Chaque ligne sera envoyée au responsable que vous désignez. Il ne verra que la sienne."
      />

      <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-navy">
        <Sparkles size={16} className="mt-0.5 shrink-0" />
        <p>
          Lignes lues automatiquement dans <strong>{data[0]?.source_file}</strong>. Vérifiez-les :
          décochez ce qui ne doit pas être facturé. Les montants sont repris tels quels de votre
          facture.
        </p>
      </div>

      <AffectationLignes
        action={confirmerLignes}
        batchId={batchId}
        lignes={data as LigneAffectable[]}
        managers={managers}
        categories={categories}
        defaultManagerId={provider.default_manager_id}
      />
    </>
  )
}
