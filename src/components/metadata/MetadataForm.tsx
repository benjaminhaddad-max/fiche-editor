'use client'

import { useState, useRef, useCallback } from 'react'
import type { Fiche } from '@/lib/types/fiche'

interface MetadataFormProps {
  fiche: Fiche
}

export function MetadataForm({ fiche }: MetadataFormProps) {
  const [form, setForm] = useState({
    annee: fiche.annee,
    faculte: fiche.faculte,
    matiere: fiche.matiere,
    numero: fiche.numero,
    titre: fiche.titre,
  })

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(
    (updates: Partial<typeof form>) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        await fetch(`/api/fiches/${fiche.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      }, 500)
    },
    [fiche.id]
  )

  function update(key: string, value: string | number) {
    const newForm = { ...form, [key]: value }
    setForm(newForm)
    save({ [key]: value })
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 text-sm overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-gray-400 text-xs">Annee</span>
        <input
          value={form.annee}
          onChange={(e) => update('annee', e.target.value)}
          className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-gray-400 text-xs">Fac</span>
        <input
          value={form.faculte}
          onChange={(e) => update('faculte', e.target.value)}
          className="w-44 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-gray-400 text-xs">Matiere</span>
        <input
          value={form.matiere}
          onChange={(e) => update('matiere', e.target.value)}
          className="w-32 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-gray-400 text-xs">N°</span>
        <input
          type="number"
          min={1}
          value={form.numero}
          onChange={(e) => update('numero', parseInt(e.target.value) || 1)}
          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-gray-400 text-xs">Titre</span>
        <input
          value={form.titre}
          onChange={(e) => update('titre', e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
    </div>
  )
}
