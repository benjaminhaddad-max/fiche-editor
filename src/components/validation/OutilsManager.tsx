'use client'

import { useActionState, useState } from 'react'
import { Send, UserPlus } from 'lucide-react'
import { Input, Select } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ajouterPrestataire, type AjoutResultat } from '@/app/(app)/validation/actions'
import { relancerMaintenant, type RelanceResultat } from '@/app/(app)/admin/factures/actions'
import { formatDateLong } from '@/lib/format'

/**
 * Les deux gestes d'un manager en début de cycle : faire entrer quelqu'un,
 * et réveiller ceux qui n'ont rien déclaré.
 *
 * Ils sont côte à côte parce qu'ils vont ensemble : on ajoute la personne,
 * puis on relance tout le monde une fois la liste complète.
 */
export function OutilsManager({
  declaration,
  facture,
  admin,
  onglet = 'prestataires',
}: {
  declaration: string
  facture: string
  admin: boolean
  /** L'onglet d'Équipe ouvert : il dit qui on est en train d'ajouter. */
  onglet?: string
}) {
  // Sur « Vacataires et alternants », le choix utile n'est pas le rôle mais
  // le statut : ces gens sont des intervenants payés en salaire. Sur
  // « Managers et admins », c'est l'inverse — et il n'y a pas de fiche de
  // facturation à créer.
  const salaries = onglet === 'salaries'
  const equipe = onglet === 'equipe'
  const [ouvert, setOuvert] = useState(false)
  const [ajout, ajouter] = useActionState<AjoutResultat | null, FormData>(ajouterPrestataire, null)
  const [relance, relancer] = useActionState<RelanceResultat | null, FormData>(relancerMaintenant, null)

  return (
    <div className="mb-6 grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">
              {equipe
                ? 'Ajouter un membre de l’équipe et lui envoyer ses accès'
                : salaries
                  ? 'Ajouter un salarié et lui envoyer ses accès'
                  : admin
                    ? 'Ajouter quelqu’un et lui envoyer ses accès'
                    : 'Ajouter un intervenant et lui envoyer ses accès'}
            </p>
            <p className="mt-1 text-xs text-muted">
              Un nom, une adresse, et il reçoit son lien de connexion et le mode d’emploi.
              {equipe
                ? ' Un compte d’équipe n’a pas de fiche de facturation : il valide, il ne facture pas.'
                : salaries
                  ? ' Ses heures partiront à la paie, et il lui sera demandé ses éléments du mois.'
                  : admin
                    ? ' Choisissez son rôle : un intervenant déclare et facture, un manager valide.'
                    : ' Le SIRET et l’IBAN, c’est lui qui les remplira.'}
            </p>
          </div>
          {!ouvert && (
            <button
              type="button"
              onClick={() => setOuvert(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy hover:border-gold/50 hover:bg-cream-muted"
            >
              <UserPlus size={15} />
              Ajouter
            </button>
          )}
        </div>

        {ouvert && (
          <form action={ajouter} className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="nom" name="nom" label="Nom et prénom" placeholder="Camille Durand" required />
              <Input
                id="email"
                name="email"
                type="email"
                label="Email"
                placeholder="camille.durand@exemple.fr"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="telephone" name="telephone" type="tel" label="Téléphone (facultatif)" placeholder="06 12 34 56 78" />
              {/* Un manager n'ouvre pas de compte d'équipe : le choix ne lui
                  est pas montré, et le serveur le refuserait de toute façon. */}
              {salaries ? (
                <Select id="employment_type" name="employment_type" label="Statut" defaultValue="vacataire">
                  <option value="vacataire">Vacataire — payé en salaire</option>
                  <option value="alternant">Alternant — contrat d’apprentissage</option>
                  <option value="salarie">Salarié — contrat de travail</option>
                  <option value="salarie_enseignant">Salarié enseignant</option>
                  <option value="interim">Intérim — via l’agence</option>
                </Select>
              ) : equipe && admin ? (
                <Select id="role" name="role" label="Rôle" defaultValue="manager">
                  <option value="manager">Manager — valide les déclarations</option>
                  <option value="admin">Administration — accès complet</option>
                </Select>
              ) : (
                /* Sans ce choix, tout le monde entrait en indépendant : la
                   personne recevait le mode d'emploi de l'auto-entrepreneur
                   et cherchait un SIRET qu'elle n'a pas. On ne devine plus,
                   on demande — et il n'y a pas de valeur par défaut. */
                <Select id="role" name="role" label="Rôle et statut" defaultValue="" required>
                  <option value="" disabled>
                    Choisir…
                  </option>
                  <option value="prestataire">Intervenant — facture ses prestations</option>
                  <option value="prestataire:vacataire">Intervenant sous contrat — payé en salaire, sans facture</option>
                  <option value="prestataire:droits_auteur">Intervenant en droits d’auteur — note de droits, sans SIRET</option>
                  {admin && <option value="manager">Manager — valide les déclarations</option>}
                  {admin && <option value="admin">Administration — accès complet</option>}
                </Select>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-navy/75">
              <input type="checkbox" name="prevenir" value="1" defaultChecked className="accent-navy" />
              Lui envoyer son accès et le calendrier du mois tout de suite
            </label>
            <div className="flex items-center gap-2">
              <SubmitButton size="sm" pendingLabel="Ajout…">
                Ajouter
              </SubmitButton>
              <button
                type="button"
                onClick={() => setOuvert(false)}
                className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-navy/70 hover:bg-cream-deep"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {ajout?.message && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ajout.message}</p>
        )}
        {ajout?.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{ajout.error}</p>}
      </div>

      <form action={relancer} className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">
              Envoyer les accès et le rappel de déclarer {admin ? 'à tout le monde' : 'à mes prestataires'}
            </p>
            <p className="mt-1 text-xs text-muted">
              Déclarations attendues avant le {formatDateLong(declaration)}. Ceux qui ne se sont jamais connectés
              reçoivent leur accès et le calendrier ; ceux qui ont déjà déclaré ne reçoivent rien.
              {admin && ` Les managers sont prévenus pour leurs factures diverses, à recevoir avant le ${formatDateLong(facture)}.`}
            </p>
          </div>
          <SubmitButton size="sm" pendingLabel="Envoi…">
            <Send size={14} />
            Envoyer les mails
          </SubmitButton>
        </div>

        {relance?.message && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{relance.message}</p>
        )}
        {relance?.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{relance.error}</p>}
      </form>
    </div>
  )
}
