'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { MISSION_STATUS_LABEL } from '@/lib/labels'
import type { MissionStatus } from '@/lib/types'

const STATUTS: MissionStatus[] = [
  'submitted', 'manager_approved', 'approved', 'invoiced', 'rejected', 'contested', 'draft',
]

export function MissionFilters({
  categories,
  providers,
  months,
}: {
  categories: { id: string; name: string }[]
  providers: { id: string; legal_name: string }[]
  months: string[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/admin/prestations?${next.toString()}`)
  }

  const champ =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none'

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <select className={champ} value={params.get('statut') ?? ''} onChange={(e) => set('statut', e.target.value)}>
        <option value="">Tous les statuts</option>
        <option value="facturable">À facturer (validées)</option>
        {STATUTS.map((s) => (
          <option key={s} value={s}>{MISSION_STATUS_LABEL[s]}</option>
        ))}
      </select>

      <select className={champ} value={params.get('categorie') ?? ''} onChange={(e) => set('categorie', e.target.value)}>
        <option value="">Toutes les catégories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select className={champ} value={params.get('prestataire') ?? ''} onChange={(e) => set('prestataire', e.target.value)}>
        <option value="">Tous les prestataires</option>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>{p.legal_name}</option>
        ))}
      </select>

      <select className={champ} value={params.get('mois') ?? ''} onChange={(e) => set('mois', e.target.value)}>
        <option value="">Toutes les périodes</option>
        {months.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {[...params.keys()].length > 0 && (
        <button
          onClick={() => router.push('/admin/prestations')}
          className="cursor-pointer text-sm text-slate-500 underline hover:text-slate-800"
        >
          Tout effacer
        </button>
      )}
    </div>
  )
}
