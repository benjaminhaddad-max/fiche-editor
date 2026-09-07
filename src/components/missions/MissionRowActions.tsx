'use client'

import Link from 'next/link'
import { Pencil, Send, Trash2 } from 'lucide-react'
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
  if (status !== 'draft' && status !== 'rejected') return null

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
