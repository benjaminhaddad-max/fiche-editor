'use client'

import { useRef } from 'react'
import { choisirMarque } from '@/app/(app)/marque-actions'

/**
 * Le sélecteur d'école, dans le rail.
 *
 * Il n'apparaît que pour une direction qui en suit plusieurs, et seulement
 * là où le déploiement en sert plusieurs : ailleurs, il n'y aurait qu'une
 * ligne à choisir et le menu ne ferait qu'encombrer.
 */
export function SelecteurMarque({
  marques,
  active,
}: {
  marques: { id: string; nom: string }[]
  active: string
}) {
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form action={choisirMarque} ref={ref} className="px-3 pb-1 pt-3">
      <label htmlFor="selecteur-marque" className="sr-only">
        École affichée
      </label>
      <select
        id="selecteur-marque"
        name="marque"
        defaultValue={active}
        onChange={() => ref.current?.requestSubmit()}
        className="w-full cursor-pointer rounded-lg border border-cream/20 bg-cream/10 px-2.5 py-1.5
                   text-[12px] font-semibold text-cream outline-none focus:border-cream/50"
      >
        {marques.map((m) => (
          <option key={m.id} value={m.id} className="text-navy">
            {m.nom}
          </option>
        ))}
      </select>
    </form>
  )
}
