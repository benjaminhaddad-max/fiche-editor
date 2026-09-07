'use client'

import { useRouter, useSearchParams } from 'next/navigation'

/** Choix du manager dont on examine les prestations. */
export function ManagerPicker({
  managers,
  value,
  ailleurs,
}: {
  managers: { id: string; full_name: string }[]
  value: string
  ailleurs: number
}) {
  const router = useRouter()
  const params = useSearchParams()

  function choisir(v: string) {
    const next = new URLSearchParams(params.toString())
    if (v) next.set('manager', v)
    else next.delete('manager')
    router.push(`/validation?${next.toString()}`)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <label htmlFor="manager" className="text-sm text-navy/70">
        Manager
      </label>
      <select
        id="manager"
        value={value}
        onChange={(e) => choisir(e.target.value)}
        className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy focus:border-gold focus:ring-2 focus:ring-gold/25 focus:outline-none"
      >
        <option value="tous">Tous les managers</option>
        {managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>

      {value !== 'tous' && ailleurs > 0 && (
        <button
          onClick={() => choisir('tous')}
          className="cursor-pointer text-sm text-amber-700 underline hover:text-amber-900"
        >
          {ailleurs} prestation{ailleurs > 1 ? 's' : ''} rattachée
          {ailleurs > 1 ? 's' : ''} à d’autres managers — tout afficher
        </button>
      )}
    </div>
  )
}
