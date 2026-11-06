'use client'

import Link, { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'

/**
 * Flèche « mois précédent / suivant ».
 *
 * Changer de mois ne change que `?mois=` : l'écran de chargement de la
 * rubrique ne s'affiche pas, et la page met plusieurs secondes à revenir.
 * Pendant ce temps rien ne bougeait — Nolwenn a cru que la flèche ne
 * marchait pas. La flèche tourne maintenant tant que le mois se charge.
 */
export function FlecheMois({ href, sens }: { href: string; sens: 'prec' | 'suiv' }) {
  return (
    <Link
      href={href}
      aria-label={sens === 'prec' ? 'Mois précédent' : 'Mois suivant'}
      className="inline-flex min-w-7 items-center justify-center rounded-lg px-2 py-1 text-navy/60 hover:bg-cream-deep"
    >
      <Contenu sens={sens} />
    </Link>
  )
}

function Contenu({ sens }: { sens: 'prec' | 'suiv' }) {
  const { pending } = useLinkStatus()
  if (pending) return <Loader2 size={14} className="animate-spin" aria-label="Chargement du mois" />
  return <>{sens === 'prec' ? '←' : '→'}</>
}
