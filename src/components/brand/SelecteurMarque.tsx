'use client'

import { useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { choisirMarque } from '@/app/(app)/marque-actions'

/**
 * Le sélecteur d'école, dans le rail.
 *
 * Il n'apparaît que pour une direction qui en suit plusieurs, et seulement
 * là où le déploiement en sert plusieurs : ailleurs, il n'y aurait qu'une
 * ligne à choisir et le menu ne ferait qu'encombrer.
 *
 * Il se voyait si peu qu'on le trouvait par hasard : un fond à 10 % sur le
 * rail bleu, sans intitulé, se lisait comme un bandeau et pas comme un
 * bouton. Il porte donc son titre comme les autres sections du rail, et le
 * chevron dit que ça s'ouvre.
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
      <label
        htmlFor="selecteur-marque"
        className="mb-1.5 block px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gold-dark"
      >
        École affichée
      </label>
      <div className="relative">
        <select
          id="selecteur-marque"
          name="marque"
          defaultValue={active}
          onChange={() => ref.current?.requestSubmit()}
          className="w-full cursor-pointer appearance-none rounded-lg border border-cream/40 bg-cream/20 py-2 pl-2.5 pr-8
                     text-[13px] font-semibold text-cream outline-none transition-colors
                     hover:border-cream/70 hover:bg-cream/25 focus:border-cream/80"
        >
          {marques.map((m) => (
            <option key={m.id} value={m.id} className="text-navy">
              {m.nom}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-cream/80"
        />
      </div>
    </form>
  )
}
