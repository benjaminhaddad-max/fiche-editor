import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Clock } from 'lucide-react'
import { Badge, MissionStatusBadge } from '@/components/ui/Badge'
import { Card, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionStatus } from '@/lib/types'

const PROGRAMME: Record<string, string> = {
  pass_las_lsps: 'PASS / LAS / LSPS',
  paes: 'PAES',
  terminale_sante: 'Terminale Santé',
}

interface Contract {
  id: string
  program: string
  academic_year: string
  classes_label: string
  headcount: number | null
  headcount_fixed_at: string | null
  rate_base_amount: number | null
  rate_base_headcount: number | null
  total_ht: number
  status: string
  lab_coach_email: string | null
  notes: string | null
  provider: { legal_name: string; user: { email: string; full_name: string } | null } | null
  instalments: {
    id: string
    label: string
    due_date: string
    amount_ht: number
    sort_order: number
    mission: { id: string; status: MissionStatus; invoice_id: string | null } | null
  }[]
}

export default async function ContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_coaching_contracts')
    .select(
      `*, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)),
       instalments:inv_contract_instalments(id, label, due_date, amount_ht, sort_order,
         mission:inv_missions(id, status, invoice_id))`
    )
    .eq('id', contractId)
    .maybeSingle()

  if (!data) notFound()
  const c = data as unknown as Contract
  const echeances = [...c.instalments].sort((a, b) => a.sort_order - b.sort_order)
  const sommeEcheances = echeances.reduce((s, e) => s + Number(e.amount_ht), 0)
  const equilibre = Math.abs(sommeEcheances - Number(c.total_ht)) < 0.01

  const calcul =
    c.rate_base_amount && c.rate_base_headcount && c.headcount
      ? `${money(c.rate_base_amount)} × (${c.headcount} ÷ ${c.rate_base_headcount}) × 2 semestres`
      : null

  return (
    <>
      <Link
        href="/admin/contrats"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Contrats de coaching
      </Link>

      <PageHeader
        title={c.provider?.legal_name ?? 'Contrat'}
        description={`${PROGRAMME[c.program] ?? c.program} — ${c.academic_year}`}
      />

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-navy">Comment le montant est calculé</h2>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div className="flex gap-3">
            <dt className="w-40 shrink-0 text-muted">Effectif retenu</dt>
            <dd className="font-semibold text-navy">
              {c.headcount ?? '—'} étudiants
              {c.headcount_fixed_at && (
                <span className="ml-2 font-normal text-xs text-stone">
                  figé le {formatDate(c.headcount_fixed_at)}
                </span>
              )}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-40 shrink-0 text-muted">Barème</dt>
            <dd className="text-navy">
              {c.rate_base_amount
                ? `${money(c.rate_base_amount)} par semestre pour ${c.rate_base_headcount} étudiants`
                : 'forfait'}
            </dd>
          </div>
          {calcul && (
            <div className="flex gap-3 sm:col-span-2">
              <dt className="w-40 shrink-0 text-muted">Calcul</dt>
              <dd className="font-mono text-xs text-navy/80">
                {calcul} = <span className="font-semibold">{money(c.total_ht)}</span>
              </dd>
            </div>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <dt className="w-40 shrink-0 text-muted">Classes suivies</dt>
            <dd className="text-navy/80">{c.classes_label}</dd>
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <dt className="w-40 shrink-0 text-muted">Source</dt>
            <dd className="text-navy/70">
              {c.lab_coach_email
                ? `Diploma Lab — ${c.lab_coach_email}`
                : 'saisi manuellement'}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-navy">Échéancier</h2>
        <span className={equilibre ? 'text-xs text-muted' : 'text-xs font-semibold text-red-600'}>
          {equilibre
            ? `somme des échéances = total du contrat (${money(sommeEcheances)})`
            : `écart : échéances ${money(sommeEcheances)} vs contrat ${money(c.total_ht)}`}
        </span>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Échéance</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Montant HT</th>
              <th className="px-4 py-3 font-medium">État</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {echeances.map((e) => (
              <tr key={e.id} className="hover:bg-cream-muted">
                <td className="px-4 py-3 text-navy">{e.label}</td>
                <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                  {formatDate(e.due_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                  {money(e.amount_ht)}
                </td>
                <td className="px-4 py-3">
                  {e.mission ? (
                    <MissionStatusBadge status={e.mission.status} />
                  ) : (
                    <Badge className="bg-cream-deep text-muted ring-line">
                      <Clock size={11} className="mr-1" />
                      pas encore ouverte
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {c.notes && (
        <Card className="mt-6 p-6">
          <h2 className="mb-2 text-sm font-semibold text-navy">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-navy/70">{c.notes}</p>
        </Card>
      )}
    </>
  )
}
