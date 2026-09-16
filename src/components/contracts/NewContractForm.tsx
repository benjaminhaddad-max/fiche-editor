'use client'

import { useActionState, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { creerContrat, type ContractResult } from '@/app/(app)/admin/contrats/actions'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { money, round2 } from '@/lib/format'
import { POLE_HINT, POLE_LABEL, RATE_TYPE_LABEL } from '@/lib/labels'
import { POLES, type ContractRateType, type Pole } from '@/lib/types'

interface Ech {
  cle: number
  label: string
  due_date: string
  amount_ht: string
}
let n = 0

export function NewContractForm({
  providers,
  managers,
  defaultPole,
}: {
  providers: { id: string; name: string; employment: string }[]
  managers: { id: string; full_name: string }[]
  defaultPole: Pole
}) {
  const [state, action] = useActionState<ContractResult, FormData>(creerContrat, {})
  const [pole, setPole] = useState<Pole>(defaultPole)
  const [rate, setRate] = useState<ContractRateType>(defaultPole === 'coaching' ? 'forfait' : 'mission')
  const [echs, setEchs] = useState<Ech[]>([])
  const somme = round2(echs.reduce((s, e) => s + (Number(e.amount_ht) || 0), 0))
  const maj = (cle: number, p: Partial<Ech>) => setEchs((l) => l.map((e) => (e.cle === cle ? { ...e, ...p } : e)))

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="echeances" value={JSON.stringify(echs.map(({ label, due_date, amount_ht }) => ({ label, due_date, amount_ht })))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select id="provider_id" name="provider_id" label="Personne" defaultValue="" required>
          <option value="" disabled>Choisir…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.employment !== 'independant' ? ` (${p.employment})` : ''}
            </option>
          ))}
        </Select>
        <Select id="contract_type" name="contract_type" label="Type de contrat" value={pole} onChange={(e) => setPole(e.target.value as Pole)} hint={POLE_HINT[pole]}>
          {POLES.map((p) => (
            <option key={p} value={p}>{POLE_LABEL[p]}</option>
          ))}
        </Select>
        <div className="sm:col-span-2">
          <Input id="title" name="title" label="Intitulé" placeholder="Ex : Professeur d’anatomie PASS — 2026-2027" required />
        </div>
        <Select id="manager_id" name="manager_id" label="Manager référent" defaultValue="">
          <option value="">—</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.full_name}</option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input id="start_date" name="start_date" type="date" label="Début" required />
          <Input id="end_date" name="end_date" type="date" label="Fin" />
        </div>
        <Select id="rate_type" name="rate_type" label="Rémunération" value={rate} onChange={(e) => setRate(e.target.value as ContractRateType)}>
          {(Object.keys(RATE_TYPE_LABEL) as ContractRateType[]).map((r) => (
            <option key={r} value={r}>{RATE_TYPE_LABEL[r]}</option>
          ))}
        </Select>
        {rate === 'forfait' ? (
          <Input id="total_ht" name="total_ht" type="number" step="0.01" min="0" label="Montant total HT" hint="Laissé vide : somme des échéances." />
        ) : (
          <Input id="rate_amount" name="rate_amount" type="number" step="0.01" min="0" label={`Tarif HT ${rate === 'horaire' ? 'de l’heure' : rate === 'mensuel' ? 'par mois' : 'par mission'}`} required />
        )}
        <div className="sm:col-span-2">
          <span className="field-label">Contrat signé (PDF, facultatif)</span>
          <input
            type="file"
            name="file"
            accept="application/pdf,.pdf"
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
          <p className="field-hint">La personne pourra le consulter depuis « Mes contrats ». 4 Mo au plus.</p>
        </div>
        <div className="sm:col-span-2">
          <Textarea id="conditions" name="conditions" label="Conditions" rows={3} placeholder="Missions couvertes, volume, modalités…" />
        </div>
      </div>

      {rate === 'forfait' && (
        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between border-b border-line bg-cream-muted px-4 py-2 text-sm">
            <span className="font-medium text-navy">Échéancier</span>
            <span className="text-navy/70">Total : {money(somme)}</span>
          </div>
          {echs.map((e) => (
            <div key={e.cle} className="grid grid-cols-[1fr_150px_130px_36px] gap-2 border-b border-line/60 px-4 py-2">
              <input className="field" placeholder="Libellé" value={e.label} onChange={(x) => maj(e.cle, { label: x.target.value })} aria-label="Libellé" />
              <input className="field" type="date" value={e.due_date} onChange={(x) => maj(e.cle, { due_date: x.target.value })} aria-label="Date" />
              <input className="field" type="number" step="0.01" min="0" placeholder="Montant HT" value={e.amount_ht} onChange={(x) => maj(e.cle, { amount_ht: x.target.value })} aria-label="Montant" />
              <button type="button" onClick={() => setEchs((l) => l.filter((x) => x.cle !== e.cle))} className="cursor-pointer rounded p-1.5 text-muted hover:text-red-700" title="Supprimer">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEchs((l) => [...l, { cle: ++n, label: `Échéance ${l.length + 1}`, due_date: '', amount_ht: '' }])}
            className="m-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-navy hover:bg-cream"
          >
            <Plus size={14} />
            Ajouter une échéance
          </button>
        </div>
      )}

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer le contrat</SubmitButton>
      </div>
    </form>
  )
}
