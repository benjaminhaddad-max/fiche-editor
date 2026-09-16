'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { prepareStopImpersonation } from '@/app/(app)/admin/utilisateurs/actions'
import { switchSession } from '@/components/auth/switchSession'

/** Bandeau permanent : on ne doit jamais croire qu'on est sur son propre compte. */
export function ImpersonationBanner({
  admin,
  viewing,
}: {
  admin: string
  viewing: string
}) {
  const [enCours, setEnCours] = useState(false)

  async function quitter() {
    setEnCours(true)
    await switchSession(await prepareStopImpersonation())
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-400 px-5 py-2.5 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Eye size={16} />
        <strong>{admin}</strong>, vous voyez la plateforme comme{' '}
        <strong>{viewing}</strong>. Toute action sera enregistrée à son nom.
      </span>
      <button
        type="button"
        onClick={quitter}
        disabled={enCours}
        className="cursor-pointer rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-900 disabled:cursor-wait disabled:opacity-70"
      >
        {enCours ? 'Retour à votre compte…' : 'Quitter ce compte'}
      </button>
    </div>
  )
}
