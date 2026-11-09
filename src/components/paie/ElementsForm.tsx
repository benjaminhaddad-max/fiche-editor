'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { enregistrerElements, rienASignaler, type ElementsResult } from '@/app/(app)/elements-paie/actions'
import { corrigerSaisie } from '@/app/(app)/social/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { money } from '@/lib/format'
import type { Saisie } from '@/lib/social/saisie'
import { priseEnChargeTransport, VALIDEURS_HEURES_SUP, type LigneHeuresSup } from '@/lib/social/types'

const fichier =
  'block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80'

function Section({ titre, aide, children }: { titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line p-4">
      <legend className="px-1.5 text-sm font-semibold text-navy">{titre}</legend>
      {aide && <p className="-mt-1 mb-3 text-xs text-muted">{aide}</p>}
      {children}
    </fieldset>
  )
}

type LigneHS = { heures: string; du: string; au: string; motif: string; validees_par: string }

/**
 * Le formulaire mensuel du salarié (§5 du plan de Shirel) : transport,
 * congés, sans solde, arrêt, heures sup avec leur valideur, mutuelle,
 * remarque — et « Rien à signaler » pour arrêter les relances.
 */
export function ElementsForm({
  period,
  existant,
  precedent,
  vacataire,
  correction,
}: {
  /** Shirel corrige à la place du salarié : autre action, trace au journal. */
  correction?: { providerId: string }
  period: string
  existant: Saisie | null
  /** Le mois d'avant : pour proposer de reconduire l'abonnement de transport. */
  precedent: Pick<Saisie, 'transport' | 'transport_amount'> | null
  vacataire: boolean
}) {
  const [state, action] = useActionState<ElementsResult, FormData>(correction ? corrigerSaisie : enregistrerElements, {})
  const [rien, actionRien] = useActionState<ElementsResult, FormData>(rienASignaler, {})
  const [transport, setTransport] = useState(existant?.transport ? 'oui' : 'non')
  const [montant, setMontant] = useState(existant?.transport_amount != null ? String(existant.transport_amount) : '')
  const [mutuelle, setMutuelle] = useState(existant && existant.mutuelle !== 'inconnu' && existant.mutuelle !== 'refus' ? existant.mutuelle : '')
  const [hs, setHs] = useState<LigneHS[]>(
    (existant?.overtime_lines ?? []).map((l: LigneHeuresSup) => ({
      heures: String(l.heures),
      du: l.du ?? '',
      au: l.au ?? '',
      motif: l.motif ?? '',
      validees_par: l.validees_par ?? '',
    }))
  )
  const reconduire = Boolean(precedent?.transport && !existant?.submitted_at)
  const majHs = (i: number, champ: keyof LigneHS, val: string) =>
    setHs((t) => t.map((l, k) => (k === i ? { ...l, [champ]: val } : l)))

  const retour = state.error || state.success ? state : rien

  return (
    <div className="flex flex-col gap-5">
      {!correction && (
      <form action={actionRien} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
        <input type="hidden" name="period" value={period} />
        <p className="text-sm text-navy">
          Pas de congé, d’arrêt, d’heures sup. ni de changement ce mois-ci{vacataire ? ' (vos missions sont reprises d’office)' : ''} ?
        </p>
        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
          Rien à signaler ce mois-ci
        </SubmitButton>
      </form>
      )}

      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="period" value={period} />
        {correction && <input type="hidden" name="provider_id" value={correction.providerId} />}
        <input
          type="hidden"
          name="heures_sup"
          value={JSON.stringify(hs.map((l) => ({ ...l, du: l.du || null, au: l.au || null })))}
        />

        <Section titre="Transport" aide="Abonnement (Navigo ou équivalent) : la moitié est prise en charge, sur justificatif.">
          {reconduire && transport === 'non' && (
            <button
              type="button"
              onClick={() => {
                setTransport('oui')
                setMontant(precedent?.transport_amount != null ? String(precedent.transport_amount) : '')
              }}
              className="mb-3 cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-navy hover:bg-cream-muted"
            >
              Reconduire l’abonnement du mois dernier
              {precedent?.transport_amount ? ` (${money(precedent.transport_amount)})` : ''}
            </button>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Select id="transport" name="transport" label="Abonnement" value={transport} onChange={(e) => setTransport(e.target.value)}>
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </Select>
            {transport === 'oui' && (
              <>
                <Input
                  id="transport_amount"
                  name="transport_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  label="Montant mensuel"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  hint={montant ? `Prise en charge : ${money(priseEnChargeTransport(Number(montant)))} (50 %)` : undefined}
                  required
                />
                <div>
                  <span className="field-label">Justificatif du mois</span>
                  <input type="file" name="justificatif" accept="application/pdf,image/*" className={fichier} />
                  <p className="field-hint">
                    {existant?.transport_document
                      ? 'Déjà déposé ; un nouveau fichier le remplace.'
                      : 'Obligatoire. PDF ou photo, 4 Mo au plus.'}
                  </p>
                </div>
                {reconduire && <input type="hidden" name="transport_renewed" value="on" />}
              </>
            )}
          </div>
        </Section>

        <Section titre="Congés payés">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="paid_leave_start" name="paid_leave_start" type="date" label="Du" defaultValue={existant?.paid_leave_start ?? ''} />
            <Input id="paid_leave_end" name="paid_leave_end" type="date" label="Au" defaultValue={existant?.paid_leave_end ?? ''} />
            <Input id="paid_leave_days" name="paid_leave_days" type="number" step="0.5" min="0" label="Nombre de jours" defaultValue={existant?.paid_leave_days ?? 0} required />
          </div>
          <p className="field-hint mt-2">Des congés prévus après la clôture se déclarent dès maintenant ; un écart se régularise le mois suivant.</p>
        </Section>

        <Section titre="Congé sans solde">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input id="unpaid_leave_start" name="unpaid_leave_start" type="date" label="Du" defaultValue={existant?.unpaid_leave_start ?? ''} />
            <Input id="unpaid_leave_end" name="unpaid_leave_end" type="date" label="Au" defaultValue={existant?.unpaid_leave_end ?? ''} />
            <Input id="unpaid_leave_days" name="unpaid_leave_days" type="number" step="0.5" min="0" label="Nombre de jours" defaultValue={existant?.unpaid_leave_days ?? 0} required />
          </div>
        </Section>

        <Section titre="Arrêt de travail" aide="Un arrêt qui commence après la clôture se déclare le mois suivant.">
          <div className="grid gap-4 sm:grid-cols-4">
            <Input id="sick_leave_start" name="sick_leave_start" type="date" label="Du" defaultValue={existant?.sick_leave_start ?? ''} />
            <Input id="sick_leave_end" name="sick_leave_end" type="date" label="Au" defaultValue={existant?.sick_leave_end ?? ''} />
            <Input id="sick_leave_days" name="sick_leave_days" type="number" step="0.5" min="0" label="Nombre de jours" defaultValue={existant?.sick_leave_days ?? 0} required />
            <div>
              <span className="field-label">Arrêt (volet employeur)</span>
              <input type="file" name="arret" accept="application/pdf,image/*" className={fichier} />
              <p className="field-hint">{existant?.sick_leave_document ? 'Déjà déposé.' : 'PDF ou photo.'}</p>
            </div>
          </div>
        </Section>

        <Section titre="Heures supplémentaires" aide="Chaque ligne doit dire qui les a validées : sans manager, elle ne peut pas être enregistrée.">
          <div className="flex flex-col gap-3">
            {hs.map((l, i) => (
              <div key={i} className="grid items-end gap-3 rounded-lg bg-cream-muted/60 p-3 sm:grid-cols-[6rem_9rem_9rem_1fr_12rem_auto]">
                <Input id={`hs-h-${i}`} type="number" step="0.25" min="0" label="Heures" value={l.heures} onChange={(e) => majHs(i, 'heures', e.target.value)} required />
                <Input id={`hs-du-${i}`} type="date" label="Le / du" value={l.du} onChange={(e) => majHs(i, 'du', e.target.value)} />
                <Input id={`hs-au-${i}`} type="date" label="Au" value={l.au} onChange={(e) => majHs(i, 'au', e.target.value)} />
                <Input id={`hs-m-${i}`} label="Motif" value={l.motif} onChange={(e) => majHs(i, 'motif', e.target.value)} placeholder="Ex : journée portes ouvertes" />
                <Select id={`hs-v-${i}`} label="Validées par" value={l.validees_par} onChange={(e) => majHs(i, 'validees_par', e.target.value)} required>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {VALIDEURS_HEURES_SUP.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setHs((t) => t.filter((_, k) => k !== i))}
                  aria-label="Retirer la ligne"
                  className="mb-1 cursor-pointer rounded-lg p-2 text-navy/50 hover:bg-white hover:text-red-700"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHs((t) => [...t, { heures: '', du: '', au: '', motif: '', validees_par: '' }])}
              className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-navy/80 hover:bg-cream-muted"
            >
              <Plus size={14} />
              Ajouter des heures sup.
            </button>
          </div>
        </Section>

        <Section titre="Mutuelle d’entreprise">
          <div className="grid gap-4 sm:grid-cols-3">
            <Select id="mutuelle" name="mutuelle" label="Situation" value={mutuelle} onChange={(e) => setMutuelle(e.target.value)} required>
              <option value="" disabled>
                Choisir…
              </option>
              <option value="adherent">J’y adhère</option>
              <option value="dispense">Je demande une dispense</option>
              <option value="changement">Changement de situation</option>
            </Select>
            {(mutuelle === 'dispense' || mutuelle === 'changement') && (
              <>
                <Input
                  id="mutuelle_detail"
                  name="mutuelle_detail"
                  label={mutuelle === 'dispense' ? 'Motif de la dispense' : 'Ce qui change'}
                  defaultValue={existant?.mutuelle_detail ?? ''}
                  placeholder={mutuelle === 'dispense' ? 'Ex : couvert par la mutuelle du conjoint' : 'Ex : ajout d’un enfant'}
                />
                <div>
                  <span className="field-label">Justificatif</span>
                  <input type="file" name="mutuelle_piece" accept="application/pdf,image/*" className={fichier} />
                  <p className="field-hint">
                    {existant?.mutuelle_document ? 'Déjà déposé.' : mutuelle === 'dispense' ? 'Attestation de l’autre mutuelle.' : 'Si besoin.'}
                  </p>
                </div>
              </>
            )}
          </div>
        </Section>

        <Textarea
          id="comment"
          name="comment"
          label="Remarque (facultatif)"
          rows={2}
          defaultValue={existant?.comment ?? ''}
          placeholder="Changement d’adresse, prime convenue, question pour la paie…"
        />

        {retour.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{retour.error}</p>}
        {retour.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{retour.success}</p>}

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Enregistrement…">
            {correction ? 'Enregistrer la correction' : existant?.submitted_at ? 'Mettre à jour' : 'Envoyer mes éléments'}
          </SubmitButton>
        </div>
      </form>
    </div>
  )
}
