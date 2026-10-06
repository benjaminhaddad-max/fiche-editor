import { AlertTriangle } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/Page'
import { formatDate, money } from '@/lib/format'
import { depensesDuMois } from '@/lib/pennylane/depenses'
import type { BillingCycle } from '@/lib/cycle'

/**
 * Ce qui est sorti du compte ce mois-ci, catégorisé.
 *
 * Les autres onglets racontent ce qu'on doit aux intervenants ; celui-ci
 * dit ce que la société a réellement payé — salaires, virements,
 * prélèvements, fournisseurs — tel que la banque l'a enregistré. Ce qui
 * manque s'affiche aussi : une dépense sans catégorie ou sans justificatif
 * est une ligne qu'il faudra compléter avant le bilan.
 */
export async function VueDepenses({ cycle }: { cycle: BillingCycle }) {
  const d = await depensesDuMois(cycle.month)

  if (d.indisponible) {
    return (
      <EmptyState
        title="Comptabilité injoignable"
        description="Les dépenses viennent de Pennylane. Réessayez dans un instant ; en attendant, rien n’est affiché plutôt qu’un total faux."
      />
    )
  }
  if (d.lignes.length === 0) {
    return <EmptyState title={`Aucune sortie enregistrée sur ${cycle.label}`} />
  }

  const aCompleter = d.lignes.filter((l) => l.justificatifManquant || !l.categorie)

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="ds-eyebrow">Sorti du compte</p>
          <p className="font-display mt-1 text-2xl font-semibold text-navy">{money(d.total)}</p>
          <p className="text-xs text-muted">{d.lignes.length} mouvement(s)</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="ds-eyebrow">Sans catégorie</p>
          <p className="font-display mt-1 text-2xl font-semibold text-navy">{money(d.sansCategorie)}</p>
          <p className="text-xs text-muted">à ventiler dans Pennylane</p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <p className="ds-eyebrow">Justificatif manquant</p>
          <p className="font-display mt-1 text-2xl font-semibold text-navy">{d.sansJustificatif}</p>
          <p className="text-xs text-muted">mouvement(s) sans facture rattachée</p>
        </div>
      </div>

      <Card className="mb-6 overflow-hidden">
        <p className="border-b border-line bg-cream-muted px-5 py-3 text-sm font-semibold text-navy">
          Par poste de dépense
        </p>
        <ul className="divide-y divide-line/60">
          {d.parCategorie.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
              <span className={c.label === '—' ? 'text-amber-800' : 'text-navy'}>
                {c.label === '—' ? 'Sans catégorie' : c.label}
                <span className="ml-2 text-xs text-muted">{c.nombre} mouvement(s)</span>
              </span>
              <span className="font-semibold text-navy">{money(c.total)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {aCompleter.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <div className="border-b border-line bg-amber-50 px-5 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle size={15} />
              {aCompleter.length} mouvement(s) à compléter
            </p>
            <p className="mt-0.5 text-xs text-amber-900/80">
              Une catégorie ou un justificatif manque. Cela se corrige dans Pennylane ; c’est listé ici pour
              que rien ne traîne jusqu’au bilan.
            </p>
          </div>
          <ul className="max-h-80 divide-y divide-line/60 overflow-y-auto">
            {aCompleter.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="text-navy">{l.libelle}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(l.date)}
                    {!l.categorie ? ' · sans catégorie' : ` · ${l.categorie}`}
                    {l.justificatifManquant ? ' · justificatif manquant' : ''}
                  </span>
                </span>
                <span className="whitespace-nowrap font-medium text-navy">{money(l.montant)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <p className="border-b border-line bg-cream-muted px-5 py-3 text-sm font-semibold text-navy">
          Tous les mouvements de {cycle.label}
        </p>
        <ul className="divide-y divide-line/60">
          {d.lignes.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-4 px-5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="text-navy">{l.libelle}</span>
                <span className="block text-xs text-muted">
                  {formatDate(l.date)}
                  {l.categorie ? ` · ${l.categorie}` : ' · sans catégorie'}
                  {l.fournisseur ? ` · ${l.fournisseur}` : ''}
                </span>
              </span>
              <span className="whitespace-nowrap font-medium text-navy">{money(l.montant)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
