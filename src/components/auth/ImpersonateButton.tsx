'use client'

import { useState } from 'react'
import { prepareImpersonation } from '@/app/(app)/admin/utilisateurs/actions'
import { switchSession } from './switchSession'

export function ImpersonateButton({ userId }: { userId: string }) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function ouvrir() {
    setEnCours(true)
    setErreur(null)
    const message = await switchSession(await prepareImpersonation(userId))
    if (message) {
      setErreur(message)
      setEnCours(false)
    }
  }

  return (
    <button
      type="button"
      onClick={ouvrir}
      disabled={enCours}
      title={erreur ?? 'Voir la plateforme comme cette personne'}
      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-gold/10 disabled:cursor-wait disabled:opacity-60 ${
        erreur ? 'text-red-700' : 'text-gold-dark'
      }`}
    >
      {enCours ? 'Ouverture…' : erreur ? 'Échec — réessayer' : 'Se connecter en tant que'}
    </button>
  )
}
