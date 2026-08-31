import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

const PROGRAMME: Record<string, string> = {
  pass_las_lsps: 'PASS / LAS / LSPS',
  paes: 'PAES',
  terminale_sante: 'Terminale Santé',
}

interface Row {
  id: string
  program: string
  academic_year: string
  headcount: number | null
  headcount_fixed_at: string | null
  rate_base_amount: number | null
  rate_base_headcount: number | null
  total_ht: number
  status: string
  lab_coach_email: string | null
  provider: { legal_name: string } | null
  instalments: { id: string; amount_ht: number; due_date: string; mission_id: string | null }[]
}

export default async function ContractsPage() {
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_coaching_contracts')
    .select(
      `id, program, academic_year, headcount, headcount_fixed_at, rate_base_amount,
       rate_base_headcount, total_ht, status, lab_coach_email,
       provider:inv_providers(legal_name),
       instalments:inv_contract_instalments(id, amount_ht, due_date, mission_id)`
    )
    .order('total_ht', { ascending: false })

  const contracts = (data ?? []) as unknown as Row[]
  const total = contracts.reduce((s, c) => s + Number(c.total_ht), 0)
  const ouvertes = contracts.flatMap((c) => c.instalments).filter((i) => i.mission_id)
  const aVenir = contracts.flatMap((c) => c.instalments).filter((i) => !i.mission_id)

  return (
    <>
      <PageHeader
        title="Contrats de coaching"
        description="Chaque contrat fige l'effectif au moment de sa signature et son échéancier."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Engagé sur l'année" value={money(total)} sub={`${contracts.length} contrat(s)`} accent="brand" />
        <StatTile
          label="Échéances ouvertes"
          value={money(ouvertes.reduce((s, i) => s + Number(i.amount_ht), 0))}
          sub={`${ouvertes.length} déjà facturables`}
          accent="emerald"
        />
        <StatTile
          label="Reste à venir"
          value={money(aVenir.reduce((s, i) => s + Number(i.amount_ht), 0))}
          sub={`${aVenir.length} échéance(s)`}
        />
      </div>

      {contracts.length === 0 ? (
        <EmptyState
          title="Aucun contrat de coaching"
          description="Les contrats se créent depuis Diploma Lab avec npm run contrats-coaching."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Coach</th>
                  <th className="px-4 py-3 font-medium">Programme</th>
                  <th className="px-4 py-3 text-right font-medium">Effectif</th>
                  <th className="px-4 py-3 font-medium">Barème</th>
                  <th className="px-4 py-3 text-right font-medium">Total année</th>
                  <th className="px-4 py-3 font-medium">Échéances</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contracts.map((c) => {
                  const attendu =
                    c.rate_base_amount && c.rate_base_headcount && c.headcount
                      ? Math.round((Number(c.rate_base_amount) * c.headcount) / c.rate_base_headcount * 100) / 100 * 2
                      : null
                  const ecart = attendu !== null && Math.abs(attendu - Number(c.total_ht)) > 0.01
                  const faites = c.instalments.filter((i) => i.mission_id).length

                  return (
                    <tr key={c.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/contrats/${c.id}`}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {c.provider?.legal_name}
                        </Link>
                        {c.lab_coach_email && (
                          <p className="text-xs text-slate-400">{c.lab_coach_email}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {PROGRAMME[c.program] ?? c.program}
                        <span className="block text-xs text-slate-400">{c.academic_year}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">{c.headcount ?? '—'}</span>
                        {c.headcount_fixed_at && (
                          <span className="block text-xs text-slate-400">
                            figé le {formatDate(c.headcount_fixed_at)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {c.rate_base_amount
                          ? `${money(c.rate_base_amount)} / ${c.rate_base_headcount} élèves / semestre`
                          : 'forfait'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">{money(c.total_ht)}</span>
                        {ecart && (
                          <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-amber-600">
                            <AlertCircle size={11} />
                            calcul : {money(attendu!)}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge
                          className={
                            faites === c.instalments.length
                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                              : 'bg-slate-100 text-slate-600 ring-slate-200'
                          }
                        >
                          {faites} / {c.instalments.length} ouvertes
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
