import { MailQuestion } from 'lucide-react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { rattacherExpediteur } from '@/app/(app)/admin/factures/actions'
import { formatDate, money } from '@/lib/format'

export interface FactureARattacher {
  id: string
  number: string
  issue_date: string
  total_ttc: number
  inbound_from: string | null
  fournisseur: string
}

/**
 * Les factures arrivées d'une adresse que personne n'a reconnue.
 *
 * Elles sont là, lisibles, avec l'adresse qui les a envoyées — c'est tout ce
 * qu'il faut pour désigner le bon manager. Tant que ce n'est pas fait elles
 * restent à valider et n'entrent pas en compta.
 */
export function ARattacher({
  factures,
  managers,
}: {
  factures: FactureARattacher[]
  managers: { id: string; full_name: string }[]
}) {
  if (factures.length === 0) return null

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gold/45 bg-gold/10">
      <div className="flex items-center gap-2 border-b border-gold/30 px-5 py-3">
        <MailQuestion size={16} className="text-gold-dark" />
        <p className="text-sm font-semibold text-navy">
          {factures.length} facture{factures.length > 1 ? 's' : ''} reçue{factures.length > 1 ? 's' : ''} d’une adresse
          inconnue
        </p>
      </div>
      <p className="px-5 pt-3 text-xs text-navy/70">
        Personne dans l’équipe n’a cette adresse, et le rapprochement automatique n’a rien donné de sûr. Désignez le
        manager concerné : la facture rejoindra alors les factures validées.
      </p>
      <ul className="divide-y divide-gold/25 px-5 py-3">
        {factures.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy">
                {f.fournisseur} — {money(f.total_ttc)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {f.number} · {formatDate(f.issue_date)} · envoyée par{' '}
                <strong className="font-semibold text-navy/80">{f.inbound_from ?? 'adresse inconnue'}</strong>
              </p>
            </div>
            <form action={rattacherExpediteur} className="flex shrink-0 items-center gap-2">
              <input type="hidden" name="invoice_id" value={f.id} />
              <select name="manager_id" required defaultValue="" className="field py-1.5 text-sm" aria-label="Manager">
                <option value="" disabled>
                  Rattacher à…
                </option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm" pendingLabel="…">
                Rattacher
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
