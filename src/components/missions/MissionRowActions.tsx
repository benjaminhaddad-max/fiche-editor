'use client'

import Link from 'next/link'
import { Pencil, Send, Trash2, Undo2 } from 'lucide-react'
import { deleteMission, submitMission } from '@/app/(app)/missions/actions'
import type { MissionStatus } from '@/lib/types'

/** Actions disponibles sur une prestation encore modifiable. */
export function MissionRowActions({
  id,
  status,
}: {
  id: string
  status: MissionStatus
}) {
  if (status !== 'draft' && status !== 'submitted' && status !== 'rejected') return null

  // Envoyée mais pas encore regardée : on ne peut plus la modifier sans que
  // le manager lise autre chose que ce qu'on lui a soumis — mais on peut
  // encore la retirer, ce qui ne trompe personne.
  if (status === 'submitted') {
    return (
      <div className="flex items-center justify-end">
        <form
          action={deleteMission}
          onSubmit={(e) => {
            if (!confirm('Retirer cette prestation ? Elle ne sera plus soumise à votre manager.'))
              e.preventDefault()
          }}
        >
          <input type="hidden" name="mission_id" value={id} />
          <button
            type="submit"
            title="Retirer cette prestation"
            className="cursor-pointer rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <Undo2 size={15} />
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/missions/${id}`}
        title="Modifier"
        className="rounded p-1.5 text-muted transition-colors hover:bg-cream-deep hover:text-navy"
      >
        <Pencil size={15} />
      </Link>

      <form action={submitMission}>
        <input type="hidden" name="mission_id" value={id} />
        <button
          type="submit"
          title="Envoyer en validation"
          className="cursor-pointer rounded p-1.5 text-muted transition-colors hover:bg-gold/10 hover:text-gold-dark"
        >
          <Send size={15} />
        </button>
      </form>

      <form
        action={deleteMission}
        onSubmit={(e) => {
          if (!confirm('Supprimer définitivement cette prestation ?')) e.preventDefault()
        }}
      >
        <input type="hidden" name="mission_id" value={id} />
        <button
          type="submit"
          title="Supprimer"
          className="cursor-pointer rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 size={15} />
        </button>
      </form>
    </div>
  )
}
