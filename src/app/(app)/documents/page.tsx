import { Download, FileText } from 'lucide-react'
import { ContractCard } from '@/components/contracts/ContractCard'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireProvider } from '@/lib/auth'
import { CONTRACT_SELECT, type ContractRow } from '@/lib/contracts'
import { cycleForMonth } from '@/lib/cycle'
import { formatDate, money } from '@/lib/format'
import { DOCUMENT_LABEL } from '@/lib/labels'
import { createServerSupabase } from '@/lib/supabase/server'
import { estAuteur, isSalaried, type PersonDocument } from '@/lib/types'
import { activeBrand } from '@/lib/brand/actif'

/** Ce que la personne doit pouvoir retrouver seule : contrats et bulletins. */
export default async function MesDocumentsPage() {
  const { provider } = await requireProvider()
  const supabase = await createServerSupabase()
  const auteur = estAuteur(provider.employment_type)
  const [{ data: docs }, { data: contrats }, { data: notes }] = await Promise.all([
    supabase
      .from('inv_documents')
      .select('*')
      .eq('provider_id', provider.id)
      .order('period', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('inv_coaching_contracts')
      .select(CONTRACT_SELECT)
      .eq('provider_id', provider.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
    // Un auteur retrouve ici ses certifications de précompte : chaque note
    // de droits d'auteur émise en porte une (Nolwenn, 13/11/2026).
    auteur
      ? supabase
          .from('inv_invoices')
          .select('id, number, issue_date, paid_at, status, pdf_path')
          .eq('provider_id', provider.id)
          .in('status', ['sent', 'validated', 'paid'])
          .not('pdf_path', 'is', null)
          .order('issue_date', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; number: string; issue_date: string; paid_at: string | null; status: string }[] }),
  ])

  const documents = (docs ?? []) as PersonDocument[]
  const bulletins = documents.filter((d) => d.kind === 'bulletin')
  const autres = documents.filter((d) => d.kind !== 'bulletin')
  const liste = (contrats ?? []) as unknown as ContractRow[]

  return (
    <>
      <PageHeader
        title="Mes documents"
        description={
          isSalaried(provider.employment_type)
            ? 'Vos contrats et vos bulletins de salaire, classés par mois.'
            : `Vos contrats et les documents que ${(await activeBrand()).company.name} met à votre disposition.`
        }
      />

      {liste.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-navy">Mes contrats</h2>
          <div className="flex flex-col gap-3">
            {liste.map((c) => (
              <ContractCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {auteur && (
        <section className="mb-8">
          <h2 className="mb-1 text-sm font-semibold text-navy">Mes certifications de précompte</h2>
          <p className="mb-3 text-xs text-muted">
            Chaque note de droits d’auteur certifie le précompte retenu et déclaré en votre nom à l’Urssaf.
          </p>
          {(notes ?? []).length === 0 ? (
            <EmptyState
              title="Aucune certification pour l’instant"
              description="Elles apparaîtront ici dès votre première note de droits d’auteur émise."
            />
          ) : (
            <Card className="divide-y divide-line/60 overflow-hidden">
              {(notes ?? []).map((n) => (
                <a
                  key={n.id}
                  href={`/api/factures/${n.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-cream-muted"
                >
                  <span className="flex items-center gap-3">
                    <FileText size={16} className="text-stone" />
                    <span className="text-navy">
                      Note {n.number}
                      <span className="block text-xs text-muted">
                        {n.paid_at ? `payée le ${formatDate(n.paid_at)}` : `émise le ${formatDate(n.issue_date)}`}
                      </span>
                    </span>
                  </span>
                  <Download size={15} className="text-muted" />
                </a>
              ))}
            </Card>
          )}
        </section>
      )}

      {!(auteur && bulletins.length === 0) && (
      <>
      <h2 className="mb-3 text-sm font-semibold text-navy">Mes bulletins de salaire</h2>
      {bulletins.length === 0 ? (
        <EmptyState
          title="Aucun bulletin pour l’instant"
          description="Vos bulletins apparaîtront ici dès qu’ils seront édités. Vous serez prévenu par email."
        />
      ) : (
        <Card className="divide-y divide-line/60 overflow-hidden">
          {bulletins.map((d) => (
            <a
              key={d.id}
              href={`/api/documents/${d.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-cream-muted"
            >
              <span className="flex items-center gap-3">
                <FileText size={16} className="text-stone" />
                <span>
                  <span className="text-sm font-medium capitalize text-navy">
                    {d.period ? cycleForMonth(d.period).label : d.label}
                  </span>
                  {d.net_amount !== null && (
                    <span className="block text-xs text-muted">Net à payer : {money(d.net_amount)}</span>
                  )}
                </span>
              </span>
              <Download size={15} className="text-muted" />
            </a>
          ))}
        </Card>
      )}
      </>
      )}

      {autres.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-navy">Autres documents</h2>
          <Card className="divide-y divide-line/60 overflow-hidden">
            {autres.map((d) => (
              <a
                key={d.id}
                href={`/api/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-cream-muted"
              >
                <span className="text-navy">
                  {d.label}
                  <span className="ml-2 text-xs text-muted">{DOCUMENT_LABEL[d.kind] ?? d.kind}</span>
                </span>
                <span className="text-xs text-muted">{formatDate(d.created_at)}</span>
              </a>
            ))}
          </Card>
        </section>
      )}
    </>
  )
}
