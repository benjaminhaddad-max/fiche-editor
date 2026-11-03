import { FileText, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { formatDate, money } from '@/lib/format'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { listerJustificatifs, type Justificatif } from '@/lib/justificatifs/rapprochement'
import { rapprochementSur } from '@/lib/justificatifs/correspondance'
import { dernierEtat, lireEtat } from '@/lib/justificatifs/etat'
import { lireReglages } from '@/lib/justificatifs/reglages'
import { gmailBranche } from '@/lib/justificatifs/gmail'
import {
  enregistrerReglagesJustificatifs,
  ignorerJustificatif,
  recalculerEtat,
  rechercherMouvements,
} from '@/app/(app)/remunerations/justificatifs-actions'
import { BoutonRattacher } from '@/components/remunerations/justificatifs/Boutons'
import type { BillingCycle } from '@/lib/cycle'

const nomDuRecu = (j: Justificatif) => j.marque ?? j.fournisseur ?? j.filename
const montantDuRecu = (j: Justificatif) =>
  j.montant === null ? 'montant illisible' : j.devise === 'EUR' ? money(Number(j.montant)) : `${Number(j.montant).toFixed(2)} ${j.devise}`

/**
 * Les reçus arrivés par la boîte de dépôt, et ce qu'ils sont devenus.
 *
 * Un rapprochement sûr est déjà parti dans Pennylane ; ici restent ceux
 * qui demandent un regard — plusieurs mouvements possibles, un montant en
 * devise, un nom qui ne colle pas — avec, pour chacun, le bouton qui le
 * pose sur le bon mouvement.
 */
export async function RecusARattacher({ inboundEmail }: { inboundEmail: string | null }) {
  const [tous, reglages] = await Promise.all([listerJustificatifs(), lireReglages()])
  const enAttente = tous.filter((j) => j.statut === 'a_rattacher')
  const recents = tous.filter((j) => j.statut === 'rattache').slice(0, 15)

  const chemins = [...enAttente, ...recents].map((j) => j.pdf_path)
  const { data: liens } = chemins.length
    ? await createServiceClient().storage.from(INVOICE_BUCKET).createSignedUrls(chemins, 3600)
    : { data: [] }
  const lien = new Map((liens ?? []).map((l) => [l.path, l.signedUrl]))

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-cream-muted px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-navy">
            Reçus à rattacher{enAttente.length > 0 ? ` (${enAttente.length})` : ''}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Les reçus d’abonnement et de carte — relevés dans la boîte de Ben ou envoyés à{' '}
            {inboundEmail ?? 'la boîte de dépôt'} — cherchent leur mouvement : même montant, à cinq jours près,
            au nom du fournisseur ; en devise, la même carte dans le quart d’heure du reçu.{' '}
            {reglages.depotAuto
              ? 'Quand un seul mouvement correspond au centime, le reçu part tout seul dans Pennylane.'
              : 'Le dépôt automatique est éteint : chaque reçu attend un clic.'}
          </p>
        </div>
        {enAttente.length > 0 && (
          <form action={rechercherMouvements}>
            <SubmitButton size="sm" variant="secondary" pendingLabel="Recherche…">
              <RefreshCw size={13} />
              Chercher à nouveau
            </SubmitButton>
          </form>
        )}
      </div>

      {enAttente.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">
          {tous.length === 0
            ? 'Aucun reçu reçu pour l’instant. Faites envoyer les reçus d’abonnement à la boîte de dépôt : ils seront lus et rattachés ici.'
            : 'Rien en attente : chaque reçu a trouvé son mouvement.'}
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {enAttente.map((j) => {
            const sur = rapprochementSur(
              { fournisseur: j.fournisseur, marque: j.marque, date: j.date_paiement, montant: j.montant === null ? null : Number(j.montant), devise: j.devise },
              j.candidats ?? []
            )
            return (
              <li key={j.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-navy">{nomDuRecu(j)}</span>
                    <span className="ml-2 font-semibold text-navy">{montantDuRecu(j)}</span>
                    <span className="block text-xs text-muted">
                      {j.date_paiement ? `payé le ${formatDate(j.date_paiement)}` : 'date illisible'}
                      {j.inbound_from ? ` · envoyé par ${j.inbound_from}` : ''}
                      {lien.get(j.pdf_path) && (
                        <>
                          {' · '}
                          <a href={lien.get(j.pdf_path)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                            <FileText size={11} />
                            voir le reçu
                          </a>
                        </>
                      )}
                    </span>
                    {j.erreur && <span className="block text-xs text-amber-800">{j.erreur}</span>}
                  </span>
                  <form action={ignorerJustificatif}>
                    <input type="hidden" name="id" value={j.id} />
                    <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                      Ignorer
                    </SubmitButton>
                  </form>
                </div>
                {(j.candidats ?? []).length === 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    Aucun mouvement sans justificatif ne correspond encore. Il est recherché à chaque relève
                    pendant dix jours — la carte est parfois débitée plus tard.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {j.candidats.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-cream-muted px-3 py-2">
                        <span className="min-w-0 text-xs">
                          <span className="text-navy">{c.libelle}</span>
                          <span className="block text-muted">
                            {formatDate(c.date)} · {money(c.montant)}
                            {c.montantExact ? ' · même montant' : ''}
                            {c.nomCoherent ? ' · même fournisseur' : ' · nom différent'}
                          </span>
                        </span>
                        <BoutonRattacher id={j.id} transactionId={c.id} principal={sur?.id === c.id || j.candidats.length === 1} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {recents.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-navy/70 hover:text-navy">
            Derniers reçus rattachés ({recents.length})
          </summary>
          <ul className="divide-y divide-line/60">
            {recents.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-4 px-5 py-2 text-xs">
                <span className="min-w-0">
                  <span className="text-navy">{nomDuRecu(j)}</span>
                  <span className="block text-muted">
                    {j.transaction_label} · {formatDate(j.transaction_date)} ·{' '}
                    {j.rattache_par === 'auto' ? 'tout seul' : 'à la main'}
                  </span>
                </span>
                <span className="whitespace-nowrap font-medium text-navy">{money(Number(j.transaction_montant))}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}

/**
 * L'état du mois, figé le 5 du mois suivant, et les fournisseurs qui
 * manquent mois après mois.
 */
export async function EtatEtRecurrents({ cycle, inboundEmail }: { cycle: BillingCycle; inboundEmail: string | null }) {
  const [enregistre, dernier, reglages] = await Promise.all([lireEtat(cycle.month), dernierEtat(), lireReglages()])
  const etat = enregistre?.etat ?? null
  const recurrents = (etat ?? dernier)?.recurrents ?? []
  const releveBranchee = gmailBranche()

  return (
    <>
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-cream-muted px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy">État des justificatifs de {cycle.label}</p>
            <p className="mt-0.5 text-xs text-muted">
              Calculé le 5 du mois suivant.{' '}
              {reglages.envoiEtat && reglages.destinataireEtat
                ? `Il part alors à ${reglages.destinataireEtat}.`
                : 'L’envoi au comptable est éteint : rien ne part par mail.'}
            </p>
          </div>
          <form action={recalculerEtat}>
            <input type="hidden" name="mois" value={cycle.month} />
            <SubmitButton size="sm" variant="secondary" pendingLabel="Calcul… (une minute)">
              <RefreshCw size={13} />
              {etat ? 'Recalculer' : 'Calculer maintenant'}
            </SubmitButton>
          </form>
        </div>
        {etat ? (
          <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-4">
            <div>
              <p className="ds-eyebrow">Manquants</p>
              <p className="font-display text-xl font-semibold text-navy">{etat.manquants}</p>
              <p className="text-xs text-muted">{money(etat.montantManquant)}</p>
            </div>
            <div>
              <p className="ds-eyebrow">Rattachés tout seuls</p>
              <p className="font-display text-xl font-semibold text-navy">{etat.rattachesAuto}</p>
              <p className="text-xs text-muted">{etat.rattachesMain} à la main</p>
            </div>
            <div>
              <p className="ds-eyebrow">Reçus en attente</p>
              <p className="font-display text-xl font-semibold text-navy">{etat.recusARattacher}</p>
              <p className="text-xs text-muted">au moment du calcul</p>
            </div>
            <div>
              <p className="ds-eyebrow">Calculé le</p>
              <p className="text-sm font-medium text-navy">{formatDate(etat.calculeLe)}</p>
              <p className="text-xs text-muted">
                {enregistre?.envoyeLe ? `envoyé à ${enregistre.envoyeA} le ${formatDate(enregistre.envoyeLe)}` : 'non envoyé'}
              </p>
            </div>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-muted">Pas encore calculé pour ce mois.</p>
        )}
      </Card>

      <Card className="mb-6 overflow-hidden">
        <div className="border-b border-line bg-cream-muted px-5 py-3">
          <p className="text-sm font-semibold text-navy">Fournisseurs prioritaires sans justificatif</p>
          <p className="mt-0.5 text-xs text-muted">
            Ceux qui manquent au moins deux mois sur les trois derniers, du plus gros débit au plus petit.
            Leurs reçus sont cherchés directement dans la boîte où ils arrivent déjà
            {releveBranchee ? '' : ' — dès que son accès sera branché'} ; ceux envoyés à{' '}
            {inboundEmail ?? 'la boîte de dépôt'} sont pris aussi.
          </p>
        </div>
        {recurrents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            {etat || dernier ? 'Aucun fournisseur ne manque deux mois de suite.' : 'Calculez l’état du mois pour voir cette liste.'}
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-line/60 overflow-y-auto">
            {recurrents.map((r) => (
              <li key={r.cle} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-navy">{r.cle}</span>
                  <span className="block text-xs text-muted">
                    {r.nombre} paiement{r.nombre > 1 ? 's' : ''} sans pièce · {r.mois} mois sur 3
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold text-navy">{money(r.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-6 overflow-hidden">
        <p className="border-b border-line bg-cream-muted px-5 py-3 text-sm font-semibold text-navy">Réglages des justificatifs</p>
        <form action={enregistrerReglagesJustificatifs} className="flex flex-col gap-3 px-5 py-4 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="depot_auto" defaultChecked={reglages.depotAuto} className="mt-1" />
            <span>
              <span className="font-medium text-navy">Dépôt automatique dans Pennylane</span>
              <span className="block text-xs text-muted">
                Un reçu en euros dont un seul mouvement a le même montant, à cinq jours près et au même nom,
                part tout seul.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="miroir" defaultChecked={reglages.miroirPennylane} className="mt-1" />
            <span>
              <span className="font-medium text-navy">Chaque reçu entre aussi dans Pennylane</span>
              <span className="block text-xs text-muted">
                Même sans mouvement trouvé : il y entre en facture d’achat marquée réglée, et sera rattaché
                à son paiement dès qu’il apparaît.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="releve_gmail" defaultChecked={reglages.releveGmail} className="mt-1" />
            <span>
              <span className="font-medium text-navy">Relever les reçus dans la boîte de Ben</span>
              <span className="block text-xs text-muted">
                {releveBranchee
                  ? 'En lecture seule, chaque heure : seulement les mails à PDF des fournisseurs prioritaires.'
                  : 'Accès à la boîte pas encore branché (RECUS_GMAIL_EMAIL et RECUS_GMAIL_PASSWORD) : rien n’est relevé.'}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="envoi_etat" defaultChecked={reglages.envoiEtat} className="mt-1" />
            <span>
              <span className="font-medium text-navy">Envoyer l’état du mois au comptable, le 5</span>
              <span className="block text-xs text-muted">Éteint par défaut.</span>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">Adresse du comptable</span>
            <input
              type="email"
              name="destinataire"
              defaultValue={reglages.destinataireEtat}
              placeholder="comptable@cabinet.fr"
              className="max-w-sm rounded-lg border border-line px-3 py-1.5 text-sm"
            />
          </label>
          <div>
            <SubmitButton size="sm" pendingLabel="Enregistrement…">
              Enregistrer
            </SubmitButton>
          </div>
        </form>
      </Card>
    </>
  )
}
