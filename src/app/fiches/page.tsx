'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, FileText, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { FicheListItem } from '@/lib/types/fiche'

export default function FichesPage() {
  const [fiches, setFiches] = useState<FicheListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/fiches')
      .then((res) => res.json())
      .then((data) => {
        setFiches(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette fiche ?')) return
    await fetch(`/api/fiches/${id}`, { method: 'DELETE' })
    setFiches((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Mes fiches</h1>
        <Link href="/fiches/new">
          <Button>
            <Plus size={18} className="mr-2" />
            Nouvelle fiche
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-gray-500">Chargement...</div>
      ) : fiches.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-4">Aucune fiche pour le moment</p>
          <Link href="/fiches/new">
            <Button>Creer ma premiere fiche</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fiches.map((fiche) => (
            <div
              key={fiche.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
            >
              <Link href={`/fiches/${fiche.id}`} className="block">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                    Fiche {fiche.numero}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded ${
                    fiche.status === 'published'
                      ? 'text-green-700 bg-green-50'
                      : 'text-gray-500 bg-gray-100'
                  }`}>
                    {fiche.status === 'published' ? 'Publiee' : 'Brouillon'}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{fiche.titre}</h3>
                <p className="text-sm text-gray-500">{fiche.matiere}</p>
                <p className="text-xs text-gray-400 mt-3">
                  Modifiee le {new Date(fiche.updated_at).toLocaleDateString('fr-FR')}
                </p>
              </Link>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  handleDelete(fiche.id)
                }}
                className="mt-3 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
