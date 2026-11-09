import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { FactureBloquee } from '@/lib/invoice/bloquees'
import { formatDate, money } from '@/lib/format'

/**
 * Les factures validées que la comptabilité n'a pas reçues : elles ne seront
 * pas payées tant que la cause n'est pas réglée. L'alerte ne se ferme pas,
 * elle disparaît quand la facture est partie.
 */
export function FacturesBloquees({ factures }: { factures: FactureBloquee[] }) {
  if (factures.length === 0) return null
  const total = factures.reduce((s, f) => s + f.total, 0)

  return (
    <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="flex items-center gap-2 font-semibold text-red-800">
        <AlertTriangle size={17} />
        {factures.length} facture{factures.length > 1 ? 's' : ''} validée{factures.length > 1 ? 's' : ''} bloquée
        {factures.length > 1 ? 's' : ''} avant Pennylane — {money(total)} non payés
      </p>
      <p className="mt-1 text-sm text-red-800/80">
        Elles ne partent pas en comptabilité, donc personne ne les paiera. Réglez la cause : elles repartent toutes
        seules le lendemain matin, ou tout de suite depuis la facture.
      </p>
      <ul className="mt-3 divide-y divide-red-200/70 text-sm">
        {factures.map((f) => (
          <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
            <span className="min-w-0">
              <Link href={`/admin/factures/${f.id}`} className="font-medium text-navy underline-offset-2 hover:underline">
                {f.prestataire} · {f.number}
              </Link>
              <span className="block text-xs text-red-900/80">{f.motif}</span>
            </span>
            <span className="shrink-0 text-xs text-navy/70">
              {money(f.total)}
              {f.depuis ? ` · validée le ${formatDate(f.depuis)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
