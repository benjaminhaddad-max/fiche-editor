import Link from 'next/link'
import { clsx } from 'clsx'
import { Download } from 'lucide-react'
import { ActionsMois, TableauSocial } from '@/components/social/TableauSocial'
import { ongletsSocial } from '@/components/social/onglets'
import { FlecheMois } from '@/components/ui/FlecheMois'
import { EmptyState, PageHeader, StatTile } from '@/components/ui/Page'
import { formatDate } from '@/lib/format'
import { etapes, maintenantParis, moisPrecedentDe, moisSuivant, repere } from '@/lib/social/calendrier'
import { tableauDuMois } from '@/lib/social/donnees'
import { lireParametres, requireEquipeSocial } from '@/lib/social/parametres'
import { codesManquants, lignesSilae } from '@/lib/social/saisie'
import { GROUPE_LABEL, type GroupeSocial } from '@/lib/social/types'

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Le tableau du mois de l'Espace Social (§6) : qui a répondu, ce qui est à
 * valider, les anomalies, et l'envoi à Net Paye une fois tout validé.
 */
export default async function SocialPage({ searchParams }: { searchParams: Promise<{ mois?: string; groupe?: string }> }) {
  const user = await requireEquipeSocial()
  const sp = await searchParams
  const groupe: GroupeSocial = sp.groupe === 'vacataires' ? 'vacataires' : 'fixes'
  const ici = maintenantParis()
  // Tout le monde est payé sur le mois en cours : on ouvre sur lui.
  const parDefaut = ici.date.slice(0, 7)
  const mois = sp.mois && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : parDefaut

  const [lignes, params] = await Promise.all([tableauDuMois(mois, groupe), lireParametres()])
  const calendrier = etapes(groupe, mois, params.calendrier)
  const compte = (s: string) => lignes.filter((l) => l.saisie.status === s).length
  const validees = lignes.filter((l) => l.saisie.status === 'valide')
  const manquants = codesManquants(validees.flatMap((l) => lignesSilae(l.salarie, l.saisie, l.netMissions, params.codes)))
  const url = (m: string, g: GroupeSocial = groupe) => `/social?groupe=${g}&mois=${m}`

  return (
    <>
      <PageHeader
        title="Espace Social"
        description="La paie des salariés, à part des factures : éléments variables, validation, envoi à Net Paye."
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="mois"
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['fixes', 'vacataires'] as GroupeSocial[]).map((g) => (
            <Link
              key={g}
              href={url(mois, g)}
              className={clsx(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                g === groupe ? 'border-navy bg-navy font-medium text-cream' : 'border-line bg-white text-navy/75 hover:bg-cream-muted'
              )}
            >
              {GROUPE_LABEL[g]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <FlecheMois href={url(moisPrecedentDe(mois))} sens="prec" />
          <p className="font-semibold capitalize text-navy">{libelleMois(mois)}</p>
          <FlecheMois href={url(moisSuivant(mois))} sens="suiv" />
        </div>
      </div>

      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {calendrier.map((e) => {
          const passe = ici.repere >= repere(e.date, Math.min(e.heure, 23))
          return (
            <li
              key={e.cle}
              className={clsx('rounded-lg border px-2.5 py-1.5', passe ? 'border-line bg-cream-muted text-muted' : 'border-gold/40 bg-white text-navy')}
              title={e.automatique ? 'Joué automatiquement' : 'Geste de l’équipe paie'}
            >
              <span className="font-semibold">{formatDate(e.date)}{e.heure < 24 && e.heure !== 12 ? ` ${e.heure} h` : e.heure === 12 ? ' midi' : ' minuit'}</span> — {e.libelle}
            </li>
          )
        })}
      </ol>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatTile label="Pas répondu" value={String(compte('attente'))} accent={compte('attente') ? 'amber' : 'emerald'} />
        <StatTile label="À valider" value={String(compte('a_valider'))} accent={compte('a_valider') ? 'brand' : undefined} />
        <StatTile label="Renvoyés pour correction" value={String(compte('a_corriger'))} />
        <StatTile label="Validés / transmis" value={`${compte('valide')} / ${compte('transmis')}`} accent="emerald" />
      </div>

      {lignes.length === 0 ? (
        <EmptyState
          title="Aucun salarié dans ce groupe"
          description="Importez la liste des salariés de Silae (onglet Salariés) : chacun y reçoit son matricule et son profil."
        />
      ) : (
        <>
          <TableauSocial mois={mois} groupe={groupe} lignes={lignes} />

          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-navy">Envoi à Net Paye</p>
                <p className="mt-1 text-xs text-muted">
                  Le fichier ne reprend que les {validees.length} saisie(s) validée(s). L’envoi part sur votre clic, avec les justificatifs, et
                  les lignes passent « transmis à la paie ».
                  {params.netpayeEmail ? ` Destinataire : ${params.netpayeNom} (${params.netpayeEmail}).` : ' Aucune adresse Net Paye : renseignez-la dans Paramètres.'}
                </p>
                {manquants.length > 0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Codes Silae manquants (laissés vides dans le fichier) : {manquants.map((m) => `${m.libelle} (${m.lignes} ligne${m.lignes > 1 ? 's' : ''})`).join(', ')}.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={`/api/social/export?mois=${mois}&groupe=${groupe}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-navy hover:bg-cream-muted"
                >
                  <Download size={14} />
                  Télécharger le fichier Silae
                </a>
                <ActionsMois mois={mois} groupe={groupe} pret={validees.length > 0 && Boolean(params.netpayeEmail)} />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
