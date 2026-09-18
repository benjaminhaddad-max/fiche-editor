import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { ElementsForm, type ElementsExistants } from '@/components/paie/ElementsForm'
import { Card, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { activeCycle, cycleForMonth, todayParis } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import { isSalaried } from '@/lib/types'

/** Ce que le service paie demandait par email : rempli ici, une fois par mois. */
export default async function ElementsPaiePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>
}) {
  const { mois } = await searchParams
  const { provider } = await requireProvider()
  if (!isSalaried(provider.employment_type)) redirect('/missions')

  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle(todayParis())
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_payroll_inputs')
    .select('*')
    .eq('provider_id', provider.id)
    .eq('period', cycle.month)
    .maybeSingle()

  const existant = data as unknown as ElementsExistants | null

  return (
    <>
      <PageHeader
        title="Mes éléments de paie"
        description={`Pour votre bulletin de ${cycle.label}. À renseigner avant le ${formatDateLong(cycle.declarationDeadline)}.`}
      />

      {existant?.submitted_at && (
        <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 size={16} />
          Vos éléments sont enregistrés. Vous pouvez les corriger tant que le mois n’est pas clos.
        </div>
      )}

      <Card className="p-5">
        <ElementsForm period={cycle.month} existant={existant} />
      </Card>

      <p className="mt-4 text-xs text-muted">
        Ces informations servent uniquement à établir votre bulletin de salaire. Elles sont visibles par
        l’administration et par la personne qui prépare la paie.
      </p>
    </>
  )
}
