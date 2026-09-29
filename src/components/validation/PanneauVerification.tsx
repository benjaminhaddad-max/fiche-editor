'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { Gauge, X } from 'lucide-react'
import { EtatVerification, type LigneManager } from '@/components/validation/EtatVerification'

/**
 * L'état de la vérification, rangé sur le côté.
 *
 * Il occupait le haut de l'écran de validation : un tableau de sept lignes
 * avant d'arriver au travail. Or on ne le consulte pas en continu — on y
 * jette un œil pour savoir qui relancer, puis on revient valider.
 *
 * Il s'ouvre donc à la demande, se referme à l'Échap ou en cliquant à côté,
 * et laisse la page tranquille le reste du temps.
 */
export function PanneauVerification({
  lignes,
  reviewEnd,
}: {
  lignes: LigneManager[]
  reviewEnd: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const enRetard = lignes.filter((l) => l.attente > 0)
  const attente = lignes.reduce((s, l) => s + l.attente, 0)

  useEffect(() => {
    if (!ouvert) return
    const fermer = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false)
    window.addEventListener('keydown', fermer)
    return () => window.removeEventListener('keydown', fermer)
  }, [ouvert])

  if (lignes.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mb-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-navy hover:border-gold/50 hover:bg-cream-muted"
      >
        <Gauge size={15} className="text-navy/60" />
        Où en est la vérification
        {enRetard.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-px text-xs font-semibold text-amber-800">
            {attente} chez {enRetard.length}
          </span>
        )}
      </button>

      {/* Le voile : il ferme au clic, et signale qu'on est dans un aparté. */}
      <div
        onClick={() => setOuvert(false)}
        className={clsx(
          'fixed inset-0 z-40 bg-navy/20 transition-opacity',
          ouvert ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden
      />

      <aside
        className={clsx(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-cream shadow-2xl transition-transform duration-200',
          ouvert ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-hidden={!ouvert}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-lg text-navy">Où en est la vérification</p>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            title="Fermer"
            className="cursor-pointer rounded-lg p-1.5 text-navy/60 hover:bg-cream-deep hover:text-navy"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <EtatVerification lignes={lignes} reviewEnd={reviewEnd} nu />
        </div>
      </aside>
    </>
  )
}
