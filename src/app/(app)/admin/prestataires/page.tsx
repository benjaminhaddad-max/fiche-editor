import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { createServerSupabase } from '@/lib/supabase/server'

interface Row {
  id: string
  legal_name: string
  siret: string | null
  vat_regime: 'franchise' | 'normal'
  pennylane_supplier_id: number | null
  onboarding_complete: boolean
  user: { full_name: string; email: string; is_active: boolean } | null
}

export default async function ProvidersPage() {
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const [{ data }, { data: totals }] = await Promise.all([
    supabase
      .from('inv_providers')
      .select(
        'id, legal_name, siret, vat_regime, pennylane_supplier_id, onboarding_complete, user:inv_users!inv_providers_user_id_fkey(full_name, email, is_active)'
      )
      .order('legal_name'),
    supabase.from('inv_invoices').select('provider_id, total_ttc'),
  ])

  const providers = (data ?? []) as unknown as Row[]

  const billedByProvider = new Map<string, number>()
  for (const inv of (totals ?? []) as { provider_id: string; total_ttc: number }[]) {
    billedByProvider.set(
      inv.provider_id,
      (billedByProvider.get(inv.provider_id) ?? 0) + Number(inv.total_ttc)
    )
  }

  return (
    <>
      <PageHeader
        title="Prestataires"
        description="Fiches de facturation. Les comptes se créent depuis Utilisateurs."
        actions={
          <Link
            href="/admin/utilisateurs"
            className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-light"
          >
            Créer un compte
          </Link>
        }
      />

      {providers.length === 0 ? (
        <EmptyState
          title="Aucun prestataire"
          description="Créez un compte avec le rôle « Prestataire » : sa fiche de facturation sera générée automatiquement."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-cream-muted text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Raison sociale</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">SIRET</th>
                  <th className="px-4 py-3 font-medium">TVA</th>
                  <th className="px-4 py-3 font-medium">ID Pennylane</th>
                  <th className="px-4 py-3 text-right font-medium">Facturé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {providers.map((p) => (
                  <tr key={p.id} className="hover:bg-cream-muted">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/prestataires/${p.id}`}
                        className="font-medium text-gold-dark hover:underline"
                      >
                        {p.legal_name}
                      </Link>
                      {!p.onboarding_complete && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertCircle size={12} />
                          profil incomplet
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-navy/70">
                      {p.user?.full_name}
                      <span className="block text-xs text-stone">{p.user?.email}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                      {p.siret ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-navy/70">
                      {p.vat_regime === 'franchise' ? 'Franchise' : 'Assujetti 20 %'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {p.pennylane_supplier_id ? (
                        <span className="text-navy/70">{p.pennylane_supplier_id}</span>
                      ) : (
                        <span className="text-xs text-amber-600">à renseigner</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-navy">
                      {money(billedByProvider.get(p.id) ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
