'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Send } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDateLong, money } from '@/lib/format'
import { relancerVerification, type RelanceVerification } from '@/app/(app)/validation/actions'

export interface LigneManager {
  id: string
  nom: string
  /** Ce qu'il n'a pas encore regardé. */
  attente: number
  attenteTotal: number
  /** Ce qu'il a validé, et qui n'attend plus que le feu vert. */
  faites: number
  faitesTotal: number
}

/**
 * Où en est la vérification, d'un coup d'œil.
 *
 * Pendant les trois jours de vérification, la seule question qui compte est
 * « qui n'a pas fini ». Le filtre par manager y répondait un manager à la
 * fois : il fallait les parcourir un à un pour savoir qui relancer, et une
 * liste déjà validée ressemblait à une liste en retard.
 *
 * On montre donc les deux colonnes côte à côte, et on ne relance que ceux
 * qui ont vraiment quelque chose à faire.
 */
export function EtatVerification({
  lignes,
  reviewEnd,
}: {
  lignes: LigneManager[]
  reviewEnd: string
}) {
  const [etat, relancer] = useActionState<RelanceVerification | null, FormData>(
    () => relancerVerification(),
    null
  )

  const enRetard = lignes.filter((l) => l.attente > 0)
  const attente = lignes.reduce((s, l) => s + l.attente, 0)
  const attenteTotal = lignes.reduce((s, l) => s + l.attenteTotal, 0)
  const faites = lignes.reduce((s, l) => s + l.faites, 0)
  const faitesTotal = lignes.reduce((s, l) => s + l.faitesTotal, 0)

  if (lignes.length === 0) return null

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-cream-muted px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">Où en est la vérification</p>
          <p className="mt-0.5 text-xs text-muted">
            À valider avant le {formatDateLong(reviewEnd)} : le bordereau part le lendemain.
          </p>
        </div>
        {enRetard.length > 0 && (
          <form action={relancer}>
            <SubmitButton size="sm" pendingLabel="Envoi…">
              <Send size={14} />
              Relancer {enRetard.length} manager{enRetard.length > 1 ? 's' : ''}
            </SubmitButton>
          </form>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 sm:px-5">Manager</th>
              <th className="px-4 py-2.5 text-right">Reste à valider</th>
              <th className="px-4 py-2.5 text-right">Validé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {lignes.map((l) => (
              <tr key={l.id} className={l.attente > 0 ? 'bg-amber-50/40' : undefined}>
                <td className="px-4 py-2.5 sm:px-5">
                  <Link
                    href={`/validation?manager=${l.id}`}
                    className="font-medium text-navy hover:text-gold-dark hover:underline"
                  >
                    {l.nom}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {l.attente === 0 ? (
                    <span className="text-xs font-medium text-emerald-700">à jour</span>
                  ) : (
                    <>
                      <span className="font-semibold text-amber-800">{l.attente}</span>
                      <span className="block text-xs text-muted">{money(l.attenteTotal)} HT</span>
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-navy/75">
                  {l.faites === 0 ? (
                    <span className="text-xs text-stone">—</span>
                  ) : (
                    <>
                      {l.faites}
                      <span className="block text-xs text-muted">{money(l.faitesTotal)} HT</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-cream-muted text-sm">
            <tr>
              <td className="px-4 py-2.5 font-semibold text-navy sm:px-5">Ensemble</td>
              <td className="px-4 py-2.5 text-right font-semibold text-navy">
                {attente}
                <span className="block text-xs font-normal text-muted">{money(attenteTotal)} HT</span>
              </td>
              <td className="px-4 py-2.5 text-right font-semibold text-navy">
                {faites}
                <span className="block text-xs font-normal text-muted">{money(faitesTotal)} HT</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {etat?.message && (
        <p className="border-t border-line bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 sm:px-5">
          {etat.message}
        </p>
      )}
      {etat?.error && (
        <p className="border-t border-line bg-red-50 px-4 py-2.5 text-sm text-red-700 sm:px-5">{etat.error}</p>
      )}
    </Card>
  )
}
