'use client'

import { Fragment, useActionState, useState } from 'react'
import { Check, Pencil, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toggleCategoryVisibility } from '@/app/(app)/admin/actions'
import type { AdminResult } from '@/app/(app)/admin/actions'
import type { Category } from '@/lib/types'

function CategoryForm({
  action,
  category,
  onDone,
}: {
  action: (prev: AdminResult, formData: FormData) => Promise<AdminResult>
  category?: Category
  onDone?: () => void
}) {
  const [state, formAction] = useActionState<AdminResult, FormData>(action, {})
  const e = state.fieldErrors ?? {}

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      {category && <input type="hidden" name="id" value={category.id} />}

      <Input
        id={`name-${category?.id ?? 'new'}`}
        name="name"
        label="Nom interne"
        defaultValue={category?.name ?? ''}
        error={e.name}
        required
      />
      <Input
        id={`pl-${category?.id ?? 'new'}`}
        name="pennylane_label"
        label="Libellé Pennylane"
        defaultValue={category?.pennylane_label ?? ''}
        error={e.pennylane_label}
      />
      <Input
        id={`prl-${category?.id ?? 'new'}`}
        name="provider_label"
        label="Libellé affiché au prestataire"
        hint="Vide = le nom interne est utilisé."
        defaultValue={category?.provider_label ?? ''}
        error={e.provider_label}
      />
      <Input
        id={`led-${category?.id ?? 'new'}`}
        name="pennylane_category_id"
        label="id_pennylane (catégorie Pennylane)"
        inputMode="numeric"
        hint="Sert à ventiler la facture dans Pennylane."
        defaultValue={category?.pennylane_category_id ?? ''}
        error={e.pennylane_category_id}
      />
      <Input
        id={`ord-${category?.id ?? 'new'}`}
        name="sort_order"
        type="number"
        min={0}
        max={999}
        label="Ordre d’affichage"
        defaultValue={category?.sort_order ?? 50}
        error={e.sort_order}
        required
      />

      <div className="flex items-end gap-6 pb-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="visible_to_provider"
            defaultChecked={category?.visible_to_provider ?? true}
            className="h-4 w-4 accent-brand-600"
          />
          Visible prestataire
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={category?.is_active ?? true}
            className="h-4 w-4 accent-brand-600"
          />
          Active
        </label>
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:col-span-2">
          {state.success}
        </p>
      )}

      <div className="flex justify-end gap-2 sm:col-span-2">
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Fermer
          </button>
        )}
        <SubmitButton pendingLabel="Enregistrement…">
          {category ? 'Enregistrer' : 'Créer la catégorie'}
        </SubmitButton>
      </div>
    </form>
  )
}

function ToggleCell({
  id,
  field,
  value,
}: {
  id: string
  field: 'visible_to_provider' | 'is_active'
  value: boolean
}) {
  return (
    <form action={toggleCategoryVisibility}>
      <input type="hidden" name="category_id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="current" value={String(value)} />
      <button
        type="submit"
        title={value ? 'Désactiver' : 'Activer'}
        className={`inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors ${
          value
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
        }`}
      >
        {value ? <Check size={14} /> : <X size={14} />}
      </button>
    </form>
  )
}

export function CategoryManager({
  categories,
  saveAction,
}: {
  categories: Category[]
  saveAction: (prev: AdminResult, formData: FormData) => Promise<AdminResult>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setCreating((c) => !c)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={16} />
          Nouvelle catégorie
        </button>
      </div>

      {creating && (
        <Card className="mb-6 p-6">
          <h2 className="mb-5 text-sm font-semibold text-slate-900">Nouvelle catégorie</h2>
          <CategoryForm action={saveAction} onDone={() => setCreating(false)} />
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Libellé Pennylane</th>
                <th className="px-4 py-3 font-medium">Libellé prestataire</th>
                <th className="px-4 py-3 font-medium">id_pennylane</th>
                <th className="px-4 py-3 text-center font-medium">Visible</th>
                <th className="px-4 py-3 text-center font-medium">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <Fragment key={c.id}>
                  <tr className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.pennylane_label ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.provider_label ?? '—'}</td>
                    <td className="px-4 py-3">
                      {c.pennylane_category_id ?? (
                        <span className="text-xs text-amber-600">manquant</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ToggleCell
                          id={c.id}
                          field="visible_to_provider"
                          value={c.visible_to_provider}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <ToggleCell id={c.id} field="is_active" value={c.is_active} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(editing === c.id ? null : c.id)}
                        title="Modifier"
                        className="cursor-pointer rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                  {editing === c.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-4 py-5">
                        <CategoryForm
                          action={saveAction}
                          category={c}
                          onDone={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
