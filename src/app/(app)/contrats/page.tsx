import { ContractCard } from '@/components/contracts/ContractCard'
import { EmptyState, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { CONTRACT_SELECT, type ContractRow } from '@/lib/contracts'
import { POLE_LABEL } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import { POLES } from '@/lib/types'

export default async function MesContratsPage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_coaching_contracts')
    .select(CONTRACT_SELECT)
    .eq('provider_id', provider.id)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  const contrats = (data ?? []) as unknown as ContractRow[]

  return (
    <>
      <PageHeader
        title="Mes contrats"
        description="Vos contrats avec Diploma Santé, pôle par pôle, avec leur tarif et leur échéancier."
      />
      {contrats.length === 0 ? (
        <EmptyState
          title="Aucun contrat enregistré"
          description="Vos contrats apparaîtront ici dès qu’ils seront saisis par Diploma Santé. Une question ? Écrivez à votre manager depuis Messages."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {POLES.filter((p) => contrats.some((c) => c.contract_type === p)).map((p) => (
            <section key={p}>
              <h2 className="mb-3 text-sm font-semibold text-navy">{POLE_LABEL[p]}</h2>
              <div className="flex flex-col gap-3">
                {contrats
                  .filter((c) => c.contract_type === p)
                  .map((c) => (
                    <ContractCard key={c.id} c={c} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
