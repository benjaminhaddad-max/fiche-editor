'use client'

import { useActionState, useState } from 'react'
import { creerDepuisModele, type ContractResult } from '@/app/(app)/admin/contrats/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { MODELES } from '@/lib/contracts/modeles'

export function ModeleContractForm({
  providers,
  managers,
  today,
}: {
  providers: { id: string; name: string }[]
  managers: { id: string; full_name: string }[]
  today: string
}) {
  const [state, action] = useActionState<ContractResult, FormData>(creerDepuisModele, {})
  const [cle, setCle] = useState(MODELES[0].cle)
  const [qui, setQui] = useState('')
  const m = MODELES.find((x) => x.cle === cle)!

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id="profile" name="profile" label="Modèle de contrat" value={cle} onChange={(e) => setCle(e.target.value)}>
          {MODELES.map((x) => (
            <option key={x.cle} value={x.cle}>
              {x.nom}
            </option>
          ))}
        </Select>
        <div className="rounded-lg bg-cream-muted px-4 py-3 text-sm">
          <p className="font-medium text-navy">{m.resume}</p>
          <p className="mt-1 text-xs text-muted">
            {m.employment === 'independant'
              ? m.monthlyAuto
                ? 'Le forfait mensuel est ajouté chaque fin de mois à ses prestations à facturer.'
                : 'Rémunéré à la mission, par bon de mission.'
              : 'Salarié : les commissions partent en prime sur la paie, pas en facture.'}
            {!m.signable && ' Le contrat de travail se signe hors plateforme (CERFA) ; cette annexe fixe le reste.'}
          </p>
        </div>

        <Select id="provider_id" name="provider_id" label="Personne" value={qui} onChange={(e) => setQui(e.target.value)} required>
          <option value="" disabled>
            Choisir…
          </option>
          <option value="nouveau">+ Nouvelle personne (compte à créer)</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select id="manager_id" name="manager_id" label="Responsable du contrat" defaultValue="">
          <option value="">Moi</option>
          {managers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.full_name}
            </option>
          ))}
        </Select>

        {qui === 'nouveau' && (
          <div className="grid gap-4 rounded-lg border border-gold/40 bg-gold/5 p-4 sm:col-span-2 sm:grid-cols-3">
            <Input id="new_name" name="new_name" label="Nom et prénom" required />
            <Input id="new_email" name="new_email" type="email" label="Email" required />
            <Input id="new_phone" name="new_phone" type="tel" label="Téléphone" placeholder="06 12 34 56 78" />
            <p className="text-xs text-navy/70 sm:col-span-3">
              Son compte est créé à l’envoi. Le lien de signature lui sert aussi de première entrée sur la
              plateforme.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input id="start_date" name="start_date" type="date" label="Début" defaultValue={today} required />
          <Input id="end_date" name="end_date" type="date" label="Fin (facultatif)" />
        </div>
        <Input
          id="rate_amount"
          name="rate_amount"
          type="number"
          step="0.01"
          min="0"
          label={m.rateType === 'mensuel' ? 'Forfait mensuel HT' : 'Tarif HT'}
          defaultValue={m.rateAmount ?? ''}
          key={cle}
          hint="Laissez le montant du modèle, ou ajustez-le pour cette personne."
        />
        {m.baremes && (
          <Select id="bareme" name="bareme" label="Barème" defaultValue={m.baremes[0].cle} key={`b-${cle}`}>
            {m.baremes.map((b) => (
              <option key={b.cle} value={b.cle}>
                {b.nom} — {b.resume}
              </option>
            ))}
          </Select>
        )}
        {m.demandeLieu && <Input id="lieu" name="lieu" label="Fac ou campus" placeholder="Ex : UPEC L2" />}

        <div className="sm:col-span-2">
          <Textarea
            id="precisions"
            name="precisions"
            label="Dispositions particulières (facultatif)"
            rows={3}
            placeholder="Ce qui a été convenu en plus : périmètre, objectifs, horaires…"
          />
        </div>
      </div>

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <SubmitButton name="envoyer" value="non" variant="secondary" pendingLabel="Enregistrement…">
          Enregistrer sans envoyer
        </SubmitButton>
        <SubmitButton name="envoyer" value="oui" pendingLabel="Envoi…" disabled={!m.signable}>
          {m.signable ? 'Créer et envoyer à signer' : 'Signature hors plateforme'}
        </SubmitButton>
      </div>
    </form>
  )
}
