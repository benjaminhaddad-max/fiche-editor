import Link from 'next/link'
import { clsx } from 'clsx'
import { VueElements } from '@/components/remunerations/VueElements'
import { VueSocial } from '@/components/remunerations/VueSocial'
import { VueBulletins } from '@/components/remunerations/VueMois'
import type { BillingCycle } from '@/lib/cycle'
import type { Role } from '@/lib/types'

const ETAPES = [
  { cle: 'elements', label: '1 — Éléments variables', pour: 'tous' },
  { cle: 'social', label: '2 — Envoi au social', pour: 'admin' },
  { cle: 'bulletins', label: '3 — Bulletins', pour: 'admin' },
] as const

/**
 * La paie des salariés, d'un bout à l'autre.
 *
 * Elle occupait trois onglets — les éléments variables, l'envoi au service
 * paie, les bulletins reçus — comme s'il s'agissait de trois sujets. C'est
 * le même, à trois moments : on recueille, on transmet, on reçoit. Les
 * étapes sont donc numérotées à l'intérieur d'un seul onglet, et le menu
 * du haut en compte trois de moins.
 */
export async function VuePaie({
  cycle,
  etape,
  role,
}: {
  cycle: BillingCycle
  etape?: string
  role: Role
}) {
  const visibles = ETAPES.filter((e) => e.pour === 'tous' || role === 'admin')
  const courant = visibles.find((e) => e.cle === etape)?.cle ?? visibles[0].cle

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {visibles.map((e) => (
          <Link
            key={e.cle}
            href={`/remunerations?vue=paie&etape=${e.cle}&mois=${cycle.month}`}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
              courant === e.cle
                ? 'border-navy bg-navy font-medium text-cream'
                : 'border-line bg-white text-navy/75 hover:bg-cream-muted'
            )}
          >
            {e.label}
          </Link>
        ))}
      </div>

      {courant === 'elements' && <VueElements cycle={cycle} />}
      {courant === 'social' && <VueSocial cycle={cycle} />}
      {courant === 'bulletins' && <VueBulletins cycle={cycle} />}
    </>
  )
}
