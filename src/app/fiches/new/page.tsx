'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const FACULTES = [
  'UNIVERSITE PARIS CITE',
  'SORBONNE UNIVERSITE',
  'UNIVERSITE PARIS SACLAY',
  'UNIVERSITE PARIS EST CRETEIL',
  'UNIVERSITE PARIS NORD',
]

export default function NewFichePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    annee: '2025-2026',
    faculte: FACULTES[0],
    matiere: '',
    numero: 1,
    titre: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const res = await fetch('/api/fiches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (res.ok) {
      const fiche = await res.json()
      router.push(`/fiches/${fiche.id}`)
    } else {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Nouvelle fiche</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 bg-white p-6 rounded-xl border border-gray-200">
        <Input
          id="annee"
          label="Annee"
          value={form.annee}
          onChange={(e) => setForm({ ...form, annee: e.target.value })}
          placeholder="2025-2026"
          required
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="faculte" className="text-sm font-medium text-gray-700">
            Faculte
          </label>
          <select
            id="faculte"
            value={form.faculte}
            onChange={(e) => setForm({ ...form, faculte: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {FACULTES.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <Input
          id="matiere"
          label="Matiere"
          value={form.matiere}
          onChange={(e) => setForm({ ...form, matiere: e.target.value })}
          placeholder="UE3 Biochimie"
          required
        />

        <Input
          id="numero"
          label="Numero de fiche"
          type="number"
          min={1}
          value={form.numero}
          onChange={(e) => setForm({ ...form, numero: parseInt(e.target.value) || 1 })}
          required
        />

        <Input
          id="titre"
          label="Titre de la fiche"
          value={form.titre}
          onChange={(e) => setForm({ ...form, titre: e.target.value })}
          placeholder="L'hematopoiese"
          required
        />

        <div className="flex gap-3 mt-2">
          <Button type="submit" disabled={loading}>
            {loading ? 'Creation...' : 'Creer la fiche'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Annuler
          </Button>
        </div>
      </form>
    </div>
  )
}
