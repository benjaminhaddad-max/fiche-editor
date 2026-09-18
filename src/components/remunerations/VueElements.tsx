import { CheckCircle2, Download } from 'lucide-react'
import { ElementsTable } from '@/components/paie/ElementsTable'
import { EmptyState, StatTile } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { marquerTransmis } from '@/app/(app)/paie-du-mois/actions'
import type { BillingCycle } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'
import { elementsDuMois } from '@/lib/paie/elements'

/** Les éléments variables du mois, déclarés par chacun. */
export async function VueElements({ cycle }: { cycle: BillingCycle }) {
  const lignes = await elementsDuMois(cycle)

  const manquants = lignes.filter((l) => !l.rempli)
  const transport = lignes.filter((l) => l.transport)
  const transmis = lignes.some((l) => l.transmisLe)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Heures supplémentaires, congés, transport, mutuelle : chacun les renseigne dans son espace, avant le{' '}
          {formatDateLong(cycle.declarationDeadline)}.
        </p>
        <a
          href={`/api/elements-paie?mois=${cycle.month}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-cream-muted"
        >
          <Download size={15} />
          Export pour Silae
        </a>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Réponses reçues"
          value={`${lignes.length - manquants.length} / ${lignes.length}`}
          accent={manquants.length ? 'amber' : 'emerald'}
        />
        <StatTile
          label="Heures supplémentaires"
          value={String(lignes.reduce((s, l) => s + l.heuresSup, 0))}
          sub="toutes personnes confondues"
        />
        <StatTile
          label="Abonnements de transport"
          value={String(transport.length)}
          sub={transport.some((l) => !l.justificatifId) ? 'un justificatif manque' : 'justificatifs fournis'}
        />
      </div>

      {lignes.length === 0 ? (
        <EmptyState
          title="Aucun salarié pour l’instant"
          description="Les personnes en statut vacataire, alternant, salarié, enseignant ou intérim apparaissent ici."
        />
      ) : (
        <>
          <ElementsTable mois={cycle.month} lignes={lignes} />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {manquants.length
                ? `${manquants.length} personne(s) n’ont pas encore répondu : cochez-les pour les relancer par email et SMS.`
                : 'Tout le monde a répondu.'}
            </p>
            {!transmis && (
              <form action={marquerTransmis}>
                <input type="hidden" name="mois" value={cycle.month} />
                <SubmitButton size="sm" variant="secondary" pendingLabel="…">
                  <CheckCircle2 size={14} />
                  Marquer comme transmis à la paie
                </SubmitButton>
              </form>
            )}
          </div>
        </>
      )}
    </>
  )
}
