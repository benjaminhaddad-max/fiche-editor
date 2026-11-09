'use client'

import { useActionState, useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import { envoyerAcces, importerFichier, modifierSalarie, type Resultat } from '@/app/(app)/social/actions'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { ResultatImport } from '@/lib/social/import'
import type { Salarie } from '@/lib/social/saisie'
import { PROFIL_LABEL, PROFILS } from '@/lib/social/types'

type RetourImport = (ResultatImport & { applique: boolean }) | { error: string } | null

function Liste({ titre, items, ton }: { titre: string; items: string[]; ton?: 'alerte' }) {
  if (!items.length) return null
  return (
    <div>
      <p className={ton === 'alerte' ? 'font-medium text-amber-800' : 'font-medium text-navy'}>
        {titre} ({items.length})
      </p>
      <ul className="mt-1 list-disc pl-5 text-navy/75">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Import de la liste des salariés exportée de Silae. Deux temps : on lit
 * et on montre ce qui va se passer, puis on applique.
 */
export function ImportSalaries() {
  const [r, action] = useActionState<RetourImport, FormData>(importerFichier, null)
  const [fichier, setFichier] = useState<File | null>(null)
  const [enCours, demarrer] = useTransition()
  // React vide le formulaire après l'envoi : le fichier lu est gardé ici
  // pour l'appliquer sans le rechoisir.
  const appliquer = () => {
    if (!fichier) return
    const fd = new FormData()
    fd.set('fichier', fichier)
    fd.set('appliquer', '1')
    demarrer(() => action(fd))
  }
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">Liste des salariés (Silae)</span>
          <input
            type="file"
            name="fichier"
            accept=".xlsx,.csv"
            required
            onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            className="block text-sm text-navy/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-cream-deep file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy/80"
          />
          <p className="field-hint">.xlsx ou .csv : Matricule et nom au minimum ; email, type de contrat, dates d’entrée et de sortie si présents.</p>
        </div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Lecture…">
          <Upload size={14} />
          Lire le fichier
        </SubmitButton>
        {r && !('error' in r) && !r.applique && fichier && (
          <Button type="button" size="sm" onClick={appliquer} disabled={enCours}>
            {enCours ? 'Import…' : 'Appliquer l’import'}
          </Button>
        )}
      </form>
      {r && 'error' in r && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.error}</p>}
      {r && !('error' in r) && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-cream-muted/50 p-4 text-sm">
          <p className="font-semibold text-navy">{r.applique ? 'Import appliqué.' : 'Aperçu — rien n’est encore écrit.'}</p>
          <Liste titre="Matricule déjà connu, fiche mise à jour" items={r.mis_a_jour} />
          <Liste titre="Rattachés à une fiche ou un compte existant" items={r.rattaches} />
          <Liste titre="Fiches salarié créées (sans compte : envoyer l’accès ensuite)" items={r.crees} />
          <Liste titre="Profil à vérifier (mis à « fixe » par défaut)" items={r.profil_a_verifier} ton="alerte" />
          <Liste titre="À trancher à la main" items={r.conflits} ton="alerte" />
          <Liste titre="Dans Invoice mais absents de ce fichier (rien n’est supprimé)" items={r.absents_de_silae} ton="alerte" />
        </div>
      )}
    </div>
  )
}

/** Une ligne de la liste des salariés, modifiable sur place. */
export function LigneSalarie({ s }: { s: Salarie }) {
  const [r, action] = useActionState<Resultat, FormData>(modifierSalarie, {})
  const [a, acces] = useActionState<Resultat, FormData>(envoyerAcces, {})
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_9rem_9rem_9rem_auto]">
        <input type="hidden" name="provider_id" value={s.providerId} />
        <div className="min-w-0">
          <p className="truncate font-medium text-navy">{s.nom}</p>
          <p className="truncate text-xs text-muted">{s.email ?? 'pas de compte'}</p>
        </div>
        <Input id={`m-${s.providerId}`} name="matricule" label="Matricule" defaultValue={s.matricule ?? ''} placeholder="00000" />
        <Select id={`p-${s.providerId}`} name="profil" label="Profil" defaultValue={s.profil}>
          {PROFILS.map((p) => (
            <option key={p} value={p}>
              {PROFIL_LABEL[p]}
            </option>
          ))}
        </Select>
        <Input id={`e-${s.providerId}`} name="entree" type="date" label="Entrée" defaultValue={s.entree ?? ''} />
        <Input id={`s-${s.providerId}`} name="sortie" type="date" label="Sortie" defaultValue={s.sortie ?? ''} />
        <SubmitButton size="sm" variant="secondary" pendingLabel="…">
          Enregistrer
        </SubmitButton>
      </form>
      {!s.userId && (
        <form action={acces} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="provider_id" value={s.providerId} />
          <Input id={`a-${s.providerId}`} name="email" type="email" label="Email du salarié" placeholder="prenom.nom@…" required />
          <SubmitButton size="sm" pendingLabel="Envoi…">
            Envoyer l’accès
          </SubmitButton>
        </form>
      )}
      {[r, a].map((x, i) =>
        x.error ? (
          <p key={i} className="text-xs text-red-700">{x.error}</p>
        ) : x.success ? (
          <p key={i} className="text-xs text-emerald-700">{x.success}</p>
        ) : null
      )}
    </div>
  )
}
