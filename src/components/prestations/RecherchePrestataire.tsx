'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Champ « Rechercher un prestataire » des onglets de Prestations. Le texte vit
 * dans l'adresse (`?q=`) : la page serveur filtre ses lignes avec
 * `correspondPrestataire`, et un lien partagé garde la recherche.
 */
export function RecherchePrestataire({ className = '' }: { className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const dansLAdresse = params.get('q') ?? ''
  const [texte, setTexte] = useState(dansLAdresse)
  const [vu, setVu] = useState(dansLAdresse)
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Retour arrière / lien suivi : le champ reprend ce que dit l'adresse. On
  // le recale pendant le rendu plutôt que dans un effet — un effet ferait
  // s'afficher l'ancien texte le temps d'une image.
  if (vu !== dansLAdresse) {
    setVu(dansLAdresse)
    setTexte(dansLAdresse)
  }

  function appliquer(v: string) {
    const next = new URLSearchParams(params.toString())
    if (v.trim()) next.set('q', v.trim())
    else next.delete('q')
    const qs = next.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  function changer(v: string) {
    setTexte(v)
    if (minuteur.current) clearTimeout(minuteur.current)
    minuteur.current = setTimeout(() => appliquer(v), 300)
  }

  return (
    <div className={`relative w-full max-w-sm ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
      <input
        type="search"
        value={texte}
        onChange={(e) => changer(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (minuteur.current) clearTimeout(minuteur.current)
            appliquer(texte)
          }
        }}
        placeholder="Rechercher un prestataire…"
        aria-label="Rechercher un prestataire"
        className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-8 text-sm text-navy placeholder:text-stone focus:border-gold focus:ring-2 focus:ring-gold/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {texte && (
        <button
          type="button"
          onClick={() => changer('')}
          aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-stone hover:text-navy"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
