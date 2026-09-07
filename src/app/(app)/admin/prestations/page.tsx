import Link from 'next/link'
import { Suspense } from 'react'
import { FileSignature, UserPen, UserPlus } from 'lucide-react'
import { Badge, MissionStatusBadge } from '@/components/ui/Badge'
import { Card, EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { MissionFilters } from '@/components/admin/MissionFilters'
import { requireRole } from '@/lib/auth'
import { formatPeriod, money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'
import type { MissionStatus } from '@/lib/types'

type Origin = 'contract' | 'manager' | 'provider'

const ORIGINE: Record<Origin, { label: string; style: string; Icon: typeof UserPen }> = {
  contract: { label: 'Contrat', style: 'bg-indigo-50 text-indigo-700 ring-indigo-200', Icon: FileSignature },
  manager: { label: 'Saisi par un manager', style: 'bg-cream-deep text-navy/70 ring-line', Icon: UserPen },
  provider: { label: 'Ajouté par le prestataire', style: 'bg-amber-50 text-amber-800 ring-amber-200', Icon: UserPlus },
}

interface Row {
  id: string
  detail: string
  start_date: string
  end_date: string | null
  total_ht: number
  status: MissionStatus
  origin: Origin
  invoice_id: string | null
  category: { id: string; name: string } | null
  provider: { id: string; legal_name: string } | null
  manager: { full_name: string } | null
}

export default async function AdminMissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireRole('admin')
  const f = await searchParams
  const supabase = await createServerSupabase()

  let query = supabase
    .from('inv_missions')
    .select(
      `id, detail, start_date, end_date, total_ht, status, origin, invoice_id,
       category:inv_categories(id, name),
       provider:inv_providers(id, legal_name),
       manager:inv_users!inv_missions_manager_id_fkey(full_name)`
    )
    .order('start_date', { ascending: false })

  // « facturable » n'est pas un statut mais la question qu'on se pose le plus :
  // validé, et pas encore rattaché à une facture.
  if (f.statut === 'facturable') query = query.eq('status', 'approved').is('invoice_id', null)
  else if (f.statut) query = query.eq('status', f.statut)
  if (f.categorie) query = query.eq('category_id', f.categorie)
  if (f.prestataire) query = query.eq('provider_id', f.prestataire)
  if (f.mois) query = query.gte('start_date', `${f.mois}-01`).lte('start_date', `${f.mois}-31`)

  const [{ data }, { data: cats }, { data: provs }] = await Promise.all([
    query,
    supabase.from('inv_categories').select('id, name').order('sort_order'),
    supabase.from('inv_providers').select('id, legal_name').order('legal_name'),
  ])

  const missions = (data ?? []) as unknown as Row[]
  const facturables = missions.filter((m) => m.status === 'approved' && !m.invoice_id)
  const aValider = missions.filter((m) => ['submitted', 'manager_approved'].includes(m.status))
  const ajouts = missions.filter((m) => m.origin === 'provider' && m.status !== 'invoiced')

  // Ce que chaque prestataire facturera : c'est la somme qui apparaîtra sur
  // sa facture, toutes catégories confondues.
  const parPresta = new Map<string, { nom: string; total: number; n: number }>()
  for (const m of facturables) {
    const k = m.provider?.id ?? '—'
    const cur = parPresta.get(k) ?? { nom: m.provider?.legal_name ?? '—', total: 0, n: 0 }
    parPresta.set(k, { ...cur, total: cur.total + Number(m.total_ht), n: cur.n + 1 })
  }
  const recap = [...parPresta.entries()].sort((a, b) => b[1].total - a[1].total)

  const mois = [...new Set(missions.map((m) => m.start_date.slice(0, 7)))].sort().reverse()

  return (
    <>
      <PageHeader
        title="Toutes les prestations"
        description="Ce que chaque prestataire va facturer, toutes catégories confondues."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="À facturer"
          value={money(facturables.reduce((s, m) => s + Number(m.total_ht), 0))}
          sub={`${facturables.length} prestation(s) · ${parPresta.size} prestataire(s)`}
          accent="emerald"
        />
        <StatTile label="En attente de validation" value={String(aValider.length)} accent="amber" />
        <StatTile
          label="Ajouts des prestataires"
          value={String(ajouts.length)}
          sub="à regarder avant de payer"
          accent={ajouts.length ? 'amber' : 'slate'}
        />
      </div>

      <Suspense fallback={null}>
        <MissionFilters categories={cats ?? []} providers={provs ?? []} months={mois} />
      </Suspense>

      {recap.length > 0 && (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold text-navy">
            Montant par prestataire — c’est ce qui s’additionnera sur sa facture
          </h2>
          <div className="flex flex-wrap gap-2">
            {recap.map(([id, r]) => (
              <Link
                key={id}
                href={`/admin/prestations?prestataire=${id}`}
                className="rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:bg-cream-muted"
              >
                <span className="font-medium text-navy">{r.nom}</span>
                <span className="ml-2 font-semibold text-emerald-700">{money(r.total)}</span>
                <span className="ml-1.5 text-xs text-stone">{r.n} ligne(s)</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {missions.length === 0 ? (
        <EmptyState title="Aucune prestation ne correspond à ces filtres" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Prestataire</th>
                  <th className="px-4 py-3 font-medium">Prestation</th>
                  <th className="px-4 py-3 font-medium">Période</th>
                  <th className="px-4 py-3 font-medium">Origine</th>
                  <th className="px-4 py-3 text-right font-medium">Montant HT</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {missions.map((m) => {
                  const o = ORIGINE[m.origin]
                  return (
                    <tr key={m.id} className="align-top hover:bg-cream-muted">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-navy">
                        {m.provider?.legal_name}
                        {m.manager && (
                          <span className="block text-xs font-normal text-stone">
                            {m.manager.full_name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-navy">{m.detail}</p>
                        <p className="mt-0.5 text-xs text-muted">{m.category?.name}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                        {formatPeriod(m.start_date, m.end_date)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={o.style}>
                          <o.Icon size={11} className="mr-1" />
                          {o.label}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                        {money(m.total_ht)}
                      </td>
                      <td className="px-4 py-3">
                        <MissionStatusBadge status={m.status} />
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
