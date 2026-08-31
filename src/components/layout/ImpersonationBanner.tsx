import { Eye } from 'lucide-react'
import { stopImpersonation } from '@/app/(app)/admin/utilisateurs/actions'

/** Bandeau permanent : on ne doit jamais croire qu'on est sur son propre compte. */
export function ImpersonationBanner({
  admin,
  viewing,
}: {
  admin: string
  viewing: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-400 px-5 py-2.5 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Eye size={16} />
        <strong>{admin}</strong>, vous voyez la plateforme comme{' '}
        <strong>{viewing}</strong>. Toute action sera enregistrée à son nom.
      </span>
      <form action={stopImpersonation}>
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-50 hover:bg-amber-900"
        >
          Quitter ce compte
        </button>
      </form>
    </div>
  )
}
