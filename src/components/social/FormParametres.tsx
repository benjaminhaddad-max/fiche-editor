'use client'

import { useActionState } from 'react'
import { enregistrerParametres, type Resultat } from '@/app/(app)/social/actions'
import { Input } from '@/components/ui/Field'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { Moment } from '@/lib/social/calendrier'
import type { ParametresSocial } from '@/lib/social/parametres'
import { VARIABLES } from '@/lib/social/types'

function ChampMoment({ id, label, m, aide }: { id: string; label: string; m: Moment; aide?: string }) {
  return (
    <div className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
      <div className="pb-2 text-sm text-navy">
        {label}
        {aide && <p className="text-xs text-muted">{aide}</p>}
      </div>
      <Input id={`${id}_jour`} name={`${id}_jour`} type="number" min="1" max="31" label="Jour" defaultValue={m.jour} required />
      <Input id={`${id}_heure`} name={`${id}_heure`} type="number" min="0" max="24" label="Heure" defaultValue={m.heure} required />
    </div>
  )
}

function ChampJour({ id, label, jour, aide }: { id: string; label: string; jour: number; aide?: string }) {
  return (
    <div className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
      <div className="pb-2 text-sm text-navy">
        {label}
        {aide && <p className="text-xs text-muted">{aide}</p>}
      </div>
      <Input id={id} name={id} type="number" min="1" max="31" label="Jour" defaultValue={jour} required />
    </div>
  )
}

/**
 * Tout ce qui se règle sans redéploiement : les deux calendriers, la
 * correspondance variable → code Silae, Net Paye, l'équipe paie.
 */
export function FormParametres({ p, admin }: { p: ParametresSocial; admin: boolean }) {
  const [r, action] = useActionState<Resultat, FormData>(enregistrerParametres, {})
  const f = p.calendrier.fixes
  const v = p.calendrier.vacataires
  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold text-navy">Fixes et alternants — paie du mois en cours</h2>
          <ChampMoment id="f_ouverture" label="Demande des éléments" m={f.ouverture} aide="email et SMS" />
          <ChampMoment id="f_relance" label="Relance des non-répondants" m={f.relance} />
          <ChampMoment id="f_derniere" label="Dernière relance" m={f.derniereRelance} />
          <ChampMoment id="f_cloture" label="Clôture de la saisie" m={f.cloture} aide="24 h = minuit ; alerte à l’équipe paie" />
          <ChampMoment id="f_validation" label="Validation par l’équipe paie" m={f.validation} />
          <ChampMoment id="f_envoi" label="Envoi à Net Paye" m={f.envoi} aide="sur clic, après validation" />
          <ChampJour id="f_limite" label="Limite de réception chez Net Paye" jour={f.limiteNetPaye} />
          <ChampJour id="f_versement" label="Versement des salaires" jour={f.versement} aide="31 = dernier jour du mois" />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold text-navy">Vacataires — paie du mois précédent</h2>
          <div className="grid grid-cols-[1fr_5rem_5rem] items-end gap-2">
            <div className="pb-2 text-sm text-navy">Relance avant la fin du mois travaillé</div>
            <Input id="v_relance_jours" name="v_relance_jours" type="number" min="0" max="10" label="Jours avant" defaultValue={v.relanceJoursAvantFin} required />
            <Input id="v_relance_heure" name="v_relance_heure" type="number" min="0" max="24" label="Heure" defaultValue={v.relanceHeure} required />
          </div>
          <ChampMoment id="v_cloture" label="Clôture (mois suivant)" m={v.cloture} />
          <ChampMoment id="v_validation" label="Validation (mois suivant)" m={v.validation} />
          <ChampMoment id="v_envoi" label="Envoi à Net Paye (mois suivant)" m={v.envoi} aide="sur clic, après validation" />
          <ChampJour id="v_versement" label="Versement (mois suivant)" jour={v.versement} aide="à confirmer avec Net Paye" />
          <div className="mt-2 flex flex-wrap gap-5 text-sm text-navy">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="email" defaultChecked={p.calendrier.email} className="h-4 w-4 accent-navy" />
              Demandes et relances par email
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sms" defaultChecked={p.calendrier.sms} className="h-4 w-4 accent-navy" />
              … et par SMS
            </label>
          </div>
          <p className="text-xs text-muted">
            Une date qui tombe un week-end ou un jour férié est avancée au jour ouvré précédent.
          </p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold text-navy">Correspondance variable → code Silae</h2>
        <p className="mb-4 mt-1 text-xs text-muted">
          Un code vide reste vide dans le fichier, et l’envoi le signale. Codes d’absence déjà transmis par Net Paye : congés payés 300,
          congé sans solde 632, maladie non professionnelle 100.
        </p>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {VARIABLES.map((x) => (
            <div key={x.cle} className="grid grid-cols-[1fr_7rem] items-end gap-2">
              <div className="pb-2 text-sm text-navy">
                {x.libelle}
                <p className="text-xs text-muted">Valeur : {x.valeur}</p>
              </div>
              <Input id={`code_${x.cle}`} name={`code_${x.cle}`} label="Code" defaultValue={p.codes[x.cle]} placeholder="à obtenir" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="font-semibold text-navy sm:col-span-2">Net Paye et équipe paie</h2>
        <Input id="netpaye_nom" name="netpaye_nom" label="Interlocuteur Net Paye" defaultValue={p.netpayeNom} />
        <Input id="netpaye_email" name="netpaye_email" type="email" label="Adresse qui reçoit le fichier" defaultValue={p.netpayeEmail} hint="Vide : l’envoi est désactivé." />
        <div className="sm:col-span-2">
          <Input
            id="equipe"
            name="equipe"
            label="Équipe paie (adresses, séparées par des virgules)"
            defaultValue={p.equipe.join(', ')}
            disabled={!admin}
            hint={admin ? 'Ces personnes ouvrent l’Espace Social et reçoivent l’alerte de clôture. Les administrateurs y ont toujours accès.' : 'Modifiable par un administrateur.'}
          />
        </div>
      </Card>

      {r.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{r.error}</p>}
      {r.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{r.success}</p>}
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Enregistrement…">Enregistrer les paramètres</SubmitButton>
      </div>
    </form>
  )
}
