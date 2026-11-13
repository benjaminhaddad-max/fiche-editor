'use client'

import { useActionState } from 'react'
import { Input, Select } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { deposerJustificatifDA, enregistrerFicheDA, type DAResult } from '@/app/(app)/admin/droits-auteur/actions'
import { MODELE_LABEL, STATUT_FICHE_LABEL } from '@/lib/invoice/fiche-da'
import type { Provider } from '@/lib/types'

function Message({ s }: { s: DAResult }) {
  if (s.error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{s.error}</p>
  if (s.success) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{s.success}</p>
  return null
}

/**
 * La partie « droits d'auteur » de la fiche, côté administration :
 * résidence fiscale, pays de l'adresse, modèle de certification, A1,
 * statut, et dépôt des justificatifs.
 */
export function FicheAuteurDA({ provider, suggestion }: { provider: Provider; suggestion: string }) {
  const [state, action] = useActionState<DAResult, FormData>(enregistrerFicheDA, {})
  const [depot, deposer] = useActionState<DAResult, FormData>(deposerJustificatifDA, {})

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="provider_id" value={provider.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="tax_residence_country"
            name="tax_residence_country"
            label="Pays de résidence fiscale"
            defaultValue={provider.tax_residence_country ?? ''}
            placeholder="France"
            hint="Décide du modèle : A1 valide → 4 (même pour un résident français), sinon France → 2, autre pays → 3."
          />
          <Input
            id="country"
            name="country"
            label="Pays de l’adresse"
            defaultValue={provider.country ?? 'France'}
            hint="Champ distinct : on peut habiter un pays et être résident fiscal d’un autre."
            required
          />
          <Select
            id="da_model"
            name="da_model"
            label="Modèle de certification de précompte"
            defaultValue={provider.da_model && provider.da_model !== '1' ? provider.da_model : 'auto'}
            hint={suggestion}
          >
            <option value="auto">Automatique (selon la résidence et le A1)</option>
            {(['2', '3', '4'] as const).map((m) => (
              <option key={m} value={m}>
                {MODELE_LABEL[m]}
              </option>
            ))}
            <option value="1" disabled>
              {MODELE_LABEL['1']}
            </option>
          </Select>
          <Select
            id="da_profile_status"
            name="da_profile_status"
            label="Statut de la fiche"
            defaultValue={provider.da_profile_status ?? ''}
          >
            <option value="">Non renseigné</option>
            {Object.entries(STATUT_FICHE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 rounded-lg border border-line bg-cream-muted p-4 sm:grid-cols-2">
          <p className="text-xs text-muted sm:col-span-2">
            Formulaire A1 (affiliation dans un autre pays de l’UE). Valide s’il a un numéro, une date de début, et une fin
            vide ou à venir. Expiré ou absent : les notes passent en modèle 3.
          </p>
          <Input id="a1_number" name="a1_number" label="Numéro du A1" defaultValue={provider.a1_number ?? ''} />
          <Input id="a1_issuer" name="a1_issuer" label="Organisme émetteur" defaultValue={provider.a1_issuer ?? ''} />
          <Input id="a1_start" name="a1_start" type="date" label="Début de validité" defaultValue={provider.a1_start ?? ''} />
          <Input id="a1_end" name="a1_end" type="date" label="Fin de validité" defaultValue={provider.a1_end ?? ''} />
        </div>

        <Message s={state} />
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
        </div>
      </form>

      <form action={deposer} className="flex flex-col gap-3 rounded-lg border border-line p-4">
        <input type="hidden" name="provider_id" value={provider.id} />
        <p className="text-xs font-semibold text-navy">Déposer un justificatif</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select id="kind" name="kind" label="Type" defaultValue="residence_fiscale">
            <option value="residence_fiscale">Attestation de résidence fiscale</option>
            <option value="a1">Formulaire A1</option>
          </Select>
          <Input
            id="expires_at"
            name="expires_at"
            type="date"
            label="Expire le"
            hint="Alerte 30 jours avant."
          />
          <Input id="file" name="file" type="file" accept="application/pdf" label="PDF" required />
        </div>
        <Message s={depot} />
        <div className="flex justify-end">
          <SubmitButton variant="secondary" pendingLabel="Dépôt…">
            Déposer
          </SubmitButton>
        </div>
      </form>
    </div>
  )
}
