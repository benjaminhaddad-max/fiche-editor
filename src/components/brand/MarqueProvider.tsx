'use client'

import { createContext, useContext } from 'react'
import { BRANDS, deploymentBrandId, type BrandConfig } from '@/lib/brand'

/**
 * La marque affichée, côté navigateur.
 *
 * Le serveur la résout par requête — elle dépend du compte et du sélecteur —
 * et la passe ici une seule fois. Un composant client ne peut pas la relire
 * lui-même : NEXT_PUBLIC_BRAND ne connaît que la marque du déploiement, et
 * répondrait « Diploma » sur l'onglet Medibox.
 */
const Contexte = createContext<BrandConfig | null>(null)

export function MarqueProvider({ valeur, children }: { valeur: BrandConfig; children: React.ReactNode }) {
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>
}

/**
 * La marque courante.
 *
 * Hors de l'application connectée — l'écran de connexion, par exemple — il
 * n'y a pas de session pour trancher : on retombe sur celle du déploiement,
 * qui est bien la bonne à cet endroit.
 */
export function useMarque(): BrandConfig {
  return useContext(Contexte) ?? BRANDS[deploymentBrandId()]
}
