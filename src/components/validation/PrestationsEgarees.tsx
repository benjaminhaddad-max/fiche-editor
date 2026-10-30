'use client'

import { useActionState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { reattribuerMissions, type TransfertResultat } from '@/app/(app)/validation/actions'
import type { ReviewMission } from '@/components/validation/ValidationTable'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'

/**
 * Les prestations de ses prestataires déclarées au mauvais manager.
 *
 * On ne propose qu'un geste — les reprendre — et rien d'autre : tant que la
 * ligne est chez un collègue, ce n'est pas à nous de la valider, de la
 * corriger ou de la refuser. Une fois reprise, elle rejoint la liste à
 * valider et redevient une prestation comme les autres.
 */
export function PrestationsEgarees({ missions, moi }: { missions: ReviewMission[]; moi: string }) {
  const [etat, reprendre] = useActionState<TransfertResultat | null, FormData>(
    reattribuerMissions,
    null
  )
  if (missions.length === 0) return null

  const total = missions.reduce((s, m) => s + m.total_ht, 0)

  return (
    <div className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
        <ArrowLeftRight size={15} />
        Déclarées à quelqu’un d’autre
      </h2>
      <p className="mb-4 mt-1 text-xs text-muted">
        {missions.length} prestation{missions.length > 1 ? 's' : ''} · {money(total)} HT. Ces
        personnes vous sont rattachées, mais {missions.length > 1 ? 'ces lignes sont parties' : 'cette ligne est partie'}{' '}
        dans la liste d’un collègue — le prestataire s’est trompé de destinataire en déclarant.
        Reprenez-{missions.length > 1 ? 'les' : 'la'} et {missions.length > 1 ? 'elles reviennent' : 'elle revient'}{' '}
        dans votre liste à valider.
      </p>

      {etat?.message && (
        <p className="mb-3 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{etat.message}</p>
      )}
      {etat?.error && (
        <p className="mb-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{etat.error}</p>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {missions.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <span className="font-medium text-navy">{m.provider_name}</span>
                  <span className="block text-xs text-muted">
                    {formatDate(m.start_date)} · {m.detail}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-navy/70">
                  chez {m.manager_name}
                  {m.manager_approved_at && (
                    <span className="block text-xs text-amber-700">
                      déjà validée par {m.valide_par ?? m.manager_name} — la reprendre rouvre la validation
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-navy">
                  {money(m.total_ht)} HT
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={reprendre}>
                    <input type="hidden" name="mission_id" value={m.id} />
                    <input type="hidden" name="vers" value={moi} />
                    <SubmitButton size="sm" variant="secondary" pendingLabel="Reprise…">
                      Me la confier
                    </SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
