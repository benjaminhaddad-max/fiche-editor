import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { baseDeRemuneration, modeDeRemuneration, type Employment } from '@/lib/types'

/**
 * Ce qui a été convenu avec la personne, une fois pour toutes.
 *
 * Ces deux réglages se posaient ailleurs, mal : la base brut/net était une
 * case à cocher sur chaque ligne déclarée, décochée par défaut, et le rythme
 * n'existait pas — tout le monde était relancé comme s'il devait déclarer.
 */
export function ReglagesRemuneration({
  action,
  provider,
}: {
  action: (fd: FormData) => Promise<void>
  provider: { id: string; employment_type: Employment; pay_basis: string | null; pay_mode: string | null }
}) {
  const facture = provider.employment_type === 'independant'
  const base = baseDeRemuneration(provider)
  const mode = modeDeRemuneration(provider)

  return (
    <Card className="mb-6 p-6">
      <h2 className="mb-1 text-sm font-semibold text-navy">Ce qui a été convenu</h2>
      <p className="mb-4 text-xs text-muted">
        Réglé ici, au contrat, et repris sur chacune de ses lignes — au lieu d’être redemandé à chaque
        déclaration.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="provider_id" value={provider.id} />

        {!facture && (
          <label className="text-xs text-muted">
            Base convenue
            <select name="pay_basis" defaultValue={base ?? 'brut'} className="field mt-1 block w-48">
              <option value="net">Net à payer</option>
              <option value="brut">Brut</option>
            </select>
          </label>
        )}

        <label className="text-xs text-muted">
          Rythme
          <select name="pay_mode" defaultValue={mode} className="field mt-1 block w-64">
            <option value="variable">Montant variable — déclare chaque mois</option>
            <option value="fixe">Montant fixe — rien à redéclarer, on valide</option>
          </select>
        </label>

        <SubmitButton size="sm" pendingLabel="Enregistrement…">
          Enregistrer
        </SubmitButton>
      </form>
      {!facture && (
        <p className="mt-3 text-xs text-muted">
          {base === 'net'
            ? 'Ses montants sont des nets à payer : c’est au service paie de remonter au brut.'
            : 'Ses montants sont des bruts : c’est ce qui part au service paie.'}
        </p>
      )}
    </Card>
  )
}
