'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { FileUp, MessageSquareWarning, Plus } from 'lucide-react'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import type { BordereauResult } from '@/app/(app)/bordereaux/actions'

type Action = (prev: BordereauResult, formData: FormData) => Promise<BordereauResult>

function Retour({ state }: { state: BordereauResult }) {
  if (state.error)
    return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
  if (state.success)
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.success}</p>
    )
  return null
}

export function BordereauActions({
  statementId,
  deadline,
  paiement,
  managers,
  categories,
  defaultManagerId,
  signalerAction,
  ajouterAction,
  accepterAction,
  modifiable,
}: {
  statementId: string
  deadline: string
  paiement: string
  managers: { id: string; full_name: string }[]
  categories: { id: string; name: string; provider_label: string | null }[]
  defaultManagerId: string | null
  signalerAction: Action
  ajouterAction: Action
  accepterAction: (formData: FormData) => Promise<void>
  modifiable: boolean
}) {
  const [ouvert, setOuvert] = useState<'ajout' | 'signalement' | null>(null)
  const [etatAjout, ajouter] = useActionState<BordereauResult, FormData>(ajouterAction, {})
  const [etatSignal, signaler] = useActionState<BordereauResult, FormData>(signalerAction, {})

  const [quantite, setQuantite] = useState('1')
  const [montant, setMontant] = useState('')

  if (!modifiable) {
    return (
      <Card className="p-6 text-sm text-slate-600">
        Ce bordereau est clos. Retrouvez vos factures dans{' '}
        <Link href="/factures" className="font-medium text-brand-600 hover:underline">
          Mes factures
        </Link>
        .
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-900">Tout est correct ?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Votre facture doit nous parvenir avant le <strong>{formatDate(deadline)}</strong>.
          Les paiements sont effectués à partir du {formatDate(paiement)}.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <form action={accepterAction}>
            <input type="hidden" name="statement_id" value={statementId} />
            <SubmitButton pendingLabel="…">Générer ma facture</SubmitButton>
          </form>

          <Link
            href="/factures/deposer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <FileUp size={16} />
            Déposer ma propre facture
          </Link>

          <button
            type="button"
            onClick={() => setOuvert(ouvert === 'ajout' ? null : 'ajout')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Plus size={16} />
            Il manque une prestation
          </button>

          <button
            type="button"
            onClick={() => setOuvert(ouvert === 'signalement' ? null : 'signalement')}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            <MessageSquareWarning size={16} />
            Signaler un problème
          </button>
        </div>
      </Card>

      {ouvert === 'ajout' && (
        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Ajouter une prestation</h2>
          <p className="mb-5 text-xs text-slate-500">
            Elle partira en validation chez le responsable que vous indiquez, et rejoindra ce
            bordereau une fois validée.
          </p>

          <form action={ajouter} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="statement_id" value={statementId} />

            <div className="sm:col-span-2">
              <Textarea
                id="detail"
                name="detail"
                label="Qu’avez-vous fait ?"
                rows={2}
                maxLength={500}
                placeholder="Ex : surveillance du concours blanc n°2, campus Lauriston"
                required
              />
            </div>

            <Select
              id="manager_id"
              name="manager_id"
              label="Qui vous l’a confiée ?"
              defaultValue={defaultManagerId ?? ''}
              required
            >
              <option value="" disabled>Sélectionner…</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </Select>

            <Select id="category_id" name="category_id" label="Type de prestation" defaultValue="" required>
              <option value="" disabled>Sélectionner…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.provider_label || c.name}</option>
              ))}
            </Select>

            <Input id="start_date" name="start_date" type="date" label="Date" required />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="quantity" name="quantity" type="number" step="0.25" min="0.25"
                label="Quantité" value={quantite}
                onChange={(e) => setQuantite(e.target.value)} required
              />
              <Input
                id="unit_amount_ht" name="unit_amount_ht" type="number" step="0.01" min="0"
                label="Montant unitaire HT" value={montant}
                onChange={(e) => setMontant(e.target.value)} required
              />
            </div>

            <div className="sm:col-span-2">
              <Retour state={etatAjout} />
            </div>

            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              <span className="mr-auto text-sm text-slate-500">
                Total : <strong className="text-slate-900">
                  {money((Number(quantite) || 0) * (Number(montant) || 0))}
                </strong> HT
              </span>
              <SubmitButton variant="secondary" pendingLabel="Ajout…">Ajouter</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      {ouvert === 'signalement' && (
        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Signaler un problème</h2>
          <p className="mb-5 text-xs text-slate-500">
            Décrivez librement ce qui ne va pas. Les responsables concernés le verront cette
            semaine et vous répondront.
          </p>
          <form action={signaler} className="flex flex-col gap-4">
            <input type="hidden" name="statement_id" value={statementId} />
            <Textarea
              id="commentaire" name="commentaire" rows={4} maxLength={2000}
              placeholder="Ex : la ligne du 12 août correspond à 4 h et non 3 h ; il manque la séance du 19."
              required
            />
            <Retour state={etatSignal} />
            <div className="flex justify-end">
              <SubmitButton variant="secondary" pendingLabel="Envoi…">Envoyer ma remarque</SubmitButton>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
