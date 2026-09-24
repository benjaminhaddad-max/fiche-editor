import Link from 'next/link'
import { PageHeader } from '@/components/ui/Page'
import type { TabItem } from '@/components/ui/Tabs'
import { RelanceBouton } from '@/components/admin/RelanceBouton'
import { VueBulletins, VueMois } from '@/components/remunerations/VueMois'
import { VueElements } from '@/components/remunerations/VueElements'
import { VueFactures } from '@/components/remunerations/VueFactures'
import { VueSocial } from '@/components/remunerations/VueSocial'
import { MiscInvoiceUpload } from '@/components/admin/MiscInvoiceUpload'
import { Card } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { activeCycle, cycleForMonth, nextCycle, previousCycle } from '@/lib/cycle'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 300

/**
 * Tout l'argent au même endroit : factures, éléments de paie, bulletins,
 * envoi au social. Un seul onglet dans le menu, des sous-onglets à
 * l'intérieur — c'est le même sujet vu sous plusieurs angles.
 */
export default async function RemunerationsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; mois?: string; onglet?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const { vue, mois, onglet } = await searchParams
  const cycle = mois && /^\d{4}-\d{2}$/.test(mois) ? cycleForMonth(mois) : activeCycle()

  const vues: TabItem[] =
    user.role === 'admin'
      ? [
          { key: 'mois', label: 'Ce mois-ci', href: `/remunerations?mois=${cycle.month}` },
          { key: 'factures', label: 'Factures', href: `/remunerations?vue=factures&mois=${cycle.month}` },
          { key: 'elements', label: 'Éléments de paie', href: `/remunerations?vue=elements&mois=${cycle.month}` },
          { key: 'bulletins', label: 'Bulletins', href: `/remunerations?vue=bulletins&mois=${cycle.month}` },
          { key: 'social', label: 'À envoyer au social', href: `/remunerations?vue=social&mois=${cycle.month}` },
        ]
      : [
          { key: 'elements', label: 'Éléments de paie', href: `/remunerations?vue=elements&mois=${cycle.month}` },
          { key: 'deposer', label: 'Déposer une facture', href: '/remunerations?vue=deposer' },
        ]

  const courant = vues.some((v) => v.key === vue) ? vue! : vues[0].key
  const { data: cats } =
    courant === 'deposer'
      ? await createServiceClient().from('inv_categories').select('id, name').eq('is_active', true).order('sort_order')
      : { data: [] }

  return (
    <>
      <PageHeader
        title="Rémunérations"
        description="Ce que vous versez chaque mois : factures des indépendants, éléments variables des salariés, bulletins."
        tabs={vues}
        currentTab={courant}
      />

      {courant !== 'deposer' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`/remunerations?vue=${courant}&mois=${previousCycle(cycle).month}`}
            className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep"
          >
            ←
          </Link>
          <p className="font-semibold capitalize text-navy">{cycle.label}</p>
          <Link
            href={`/remunerations?vue=${courant}&mois=${nextCycle(cycle).month}`}
            className="rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep"
          >
            →
          </Link>
        </div>
      )}

      {courant === 'mois' && user.role === 'admin' && (
        <div className="mb-6">
          <RelanceBouton declaration={cycle.declarationDeadline} facture={cycle.invoiceDeadline} />
        </div>
      )}
      {courant === 'mois' && <VueMois cycle={cycle} />}
      {courant === 'factures' && <VueFactures onglet={onglet} />}
      {courant === 'elements' && <VueElements cycle={cycle} />}
      {courant === 'bulletins' && <VueBulletins cycle={cycle} />}
      {courant === 'social' && <VueSocial cycle={cycle} />}
      {courant === 'deposer' && (
        <Card className="p-5">
          <MiscInvoiceUpload categories={cats ?? []} inboundAddress={process.env.DEPOT_FACTURES_EMAIL ?? null} />
        </Card>
      )}
    </>
  )
}
