import { PageHeader, Card } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import Link from 'next/link'
import { enregistrerGroupeEcheancier, supprimerGroupeEcheancier, creerLissage, arreterLissage } from '../actions'

const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

type Groupe = { id: string; name: string; mois_sans_versement: number[] }
type Fiche = { id: string; legal_name: string; echeancier_groupe_id: string | null }
/** Bons de mission déposés ce mois-ci, par prestataire. */
type Depots = Map<string, number>

function FormGroupe({ groupe, fiches, groupes, depots }: { groupe: Groupe | null; fiches: Fiche[]; groupes: Groupe[]; depots: Depots }) {
  const nomGroupe = new Map(groupes.map((g) => [g.id, g.name]))
  return (
    <form action={enregistrerGroupeEcheancier} className="space-y-3">
      {groupe && <input type="hidden" name="id" value={groupe.id} />}
      <input
        name="name"
        required
        defaultValue={groupe?.name ?? ''}
        placeholder="Nom du groupe (ex. Coachs Medibox)"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
      />
      <div>
        <p className="mb-1 text-xs font-semibold text-navy">Mois sans versement</p>
        <p className="mb-2 text-xs text-muted">
          Ces mois-là, pas de bordereau : le travail validé attend et part avec le premier mois payé suivant.
          Rien coché = payé tous les mois.
        </p>
        <div className="flex flex-wrap gap-2">
          {MOIS.map((m, i) => (
            <label key={m} className="flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-navy">
              <input type="checkbox" name="mois" value={i + 1} defaultChecked={groupe?.mois_sans_versement.includes(i + 1)} />
              {m}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-navy">Prestataires du groupe</p>
        <div className="grid max-h-56 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
          {fiches.map((f) => {
            const ailleurs = f.echeancier_groupe_id && f.echeancier_groupe_id !== groupe?.id ? nomGroupe.get(f.echeancier_groupe_id) : null
            return (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 text-xs text-navy">
                <input type="checkbox" name="provider_id" value={f.id} defaultChecked={!!groupe && f.echeancier_groupe_id === groupe.id} />
                <span>{f.legal_name}</span>
                {depots.get(f.id) ? (
                  <span className="rounded-full bg-gold/15 px-1.5 text-[10px] font-medium text-gold-dark">
                    {depots.get(f.id)} bon{(depots.get(f.id) ?? 0) > 1 ? 's' : ''} déposé{(depots.get(f.id) ?? 0) > 1 ? 's' : ''}
                  </span>
                ) : null}
                {ailleurs && <span className="text-[10px] text-muted">(dans « {ailleurs} »)</span>}
              </label>
            )
          })}
        </div>
      </div>
      <button type="submit" className="cursor-pointer rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">
        {groupe ? 'Enregistrer' : 'Créer le groupe'}
      </button>
    </form>
  )
}

export default async function EcheanciersPage({ searchParams }: { searchParams: Promise<{ deposes?: string }> }) {
  const { deposes } = await searchParams
  await requireRole('admin')
  const db = createServiceClient()
  const ecole = await activeBrandId()
  const [{ data: g }, { data: f }] = await Promise.all([
    db.from('inv_echeancier_groupes').select('id, name, mois_sans_versement').eq('brand', ecole).order('name'),
    db.from('inv_providers').select('id, legal_name, echeancier_groupe_id').eq('brand', ecole).order('legal_name'),
  ])
  const { data: pl } = await db
    .from('inv_lissages')
    .select('id, titre, provider_id, beneficiaire_id, mois_debut_source, mois_fin_source, actif, echeances:inv_lissage_echeances(rang, mois, montant_ht, mission_id)')
    .eq('brand', ecole)
    .order('created_at', { ascending: false })
  const plans = (pl ?? []) as unknown as {
    id: string; titre: string; provider_id: string; beneficiaire_id: string
    mois_debut_source: string; mois_fin_source: string; actif: boolean
    echeances: { rang: number; mois: string; montant_ht: number; mission_id: string | null }[]
  }[]
  const groupes = (g ?? []) as Groupe[]
  const fiches = (f ?? []) as Fiche[]

  // Les bons de mission déposés depuis le début du mois dernier (hors brouillons et refus) :
  // la liste se relit à chaque affichage, « Actualiser » la recharge.
  const debut = new Date()
  debut.setUTCDate(1)
  debut.setUTCMonth(debut.getUTCMonth() - 1)
  const { data: ms } = await db
    .from('inv_missions')
    .select('provider_id')
    .eq('brand', ecole)
    .gte('start_date', debut.toISOString().slice(0, 10))
    .in('status', ['submitted', 'manager_approved', 'approved', 'invoiced'])
  const depots: Depots = new Map()
  for (const m of (ms ?? []) as { provider_id: string }[]) depots.set(m.provider_id, (depots.get(m.provider_id) ?? 0) + 1)
  const seulementDeposes = deposes === '1'
  // Les membres des groupes restent affichés, même sans dépôt : on ne les décoche pas par accident.
  const visibles = seulementDeposes ? fiches.filter((x) => depots.has(x.id) || x.echeancier_groupe_id) : fiches

  return (
    <>
      <PageHeader
        title="Échéanciers par groupe"
        description="Un groupe de prestataires, un calendrier de versements. Sans groupe, on applique l’échéancier par défaut : professeurs payés chaque mois, tuteurs et coachs Medibox sans versement en novembre."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href={seulementDeposes ? '/admin/echeanciers?deposes=1' : '/admin/echeanciers'} className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white">
          Actualiser la liste
        </Link>
        <Link href={seulementDeposes ? '/admin/echeanciers' : '/admin/echeanciers?deposes=1'} className="text-xs text-navy underline">
          {seulementDeposes ? 'Afficher tous les prestataires' : 'Afficher seulement ceux qui ont déposé un bon de mission'}
        </Link>
        <span className="text-xs text-muted">{depots.size} prestataire(s) ont déposé un bon de mission depuis le mois dernier.</span>
      </div>
      <div className="space-y-4">
        {groupes.map((gr) => (
          <Card key={gr.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-xs text-muted">
                {fiches.filter((x) => x.echeancier_groupe_id === gr.id).length} membre(s) ·{' '}
                {gr.mois_sans_versement.length
                  ? `sans versement : ${gr.mois_sans_versement.map((m) => MOIS[m - 1]).join(', ')}`
                  : 'payé tous les mois'}
              </p>
              <form action={supprimerGroupeEcheancier}>
                <input type="hidden" name="id" value={gr.id} />
                <button type="submit" className="cursor-pointer text-xs text-red-600 underline" title="Les membres reviennent à l’échéancier par défaut">
                  Supprimer le groupe
                </button>
              </form>
            </div>
            <FormGroupe groupe={gr} fiches={visibles} groupes={groupes} depots={depots} />
          </Card>
        ))}
        <Card>
          <p className="mb-1 text-sm font-semibold text-navy">Étaler les paiements d’un intervenant</p>
          <p className="mb-3 text-xs text-muted">
            Pour un auto-entrepreneur qui ne doit pas dépasser son plafond. Il déclare et fait valider son travail comme
            d’habitude ; au lieu d’être payé d’un coup, le total est réparti en parts mensuelles. Chaque mois, la part
            arrive dans le bordereau de la personne qui facture (lui, ou un tiers comme son conjoint) et se facture au
            montant exact du bordereau. Rien n’est payé ni validé à la création.
          </p>
          {plans.map((pn) => {
            const nom = (id: string) => fiches.find((x) => x.id === id)?.legal_name ?? '—'
            const total = pn.echeances.reduce((n, e) => n + Number(e.montant_ht), 0)
            return (
              <div key={pn.id} className="mb-3 rounded-lg border border-line p-3 text-xs text-navy">
                <div className="flex items-start justify-between gap-3">
                  <p>
                    <strong>{nom(pn.provider_id)}</strong> → facture par <strong>{nom(pn.beneficiaire_id)}</strong> · travail de{' '}
                    {pn.mois_debut_source} à {pn.mois_fin_source} · {pn.actif ? 'en cours' : 'arrêté'}
                  </p>
                  {pn.actif && (
                    <form action={arreterLissage}>
                      <input type="hidden" name="id" value={pn.id} />
                      <button type="submit" className="cursor-pointer text-red-600 underline">Arrêter</button>
                    </form>
                  )}
                </div>
                <ul className="mt-2 grid gap-x-4 sm:grid-cols-2">
                  {[...pn.echeances].sort((a, b) => a.rang - b.rang).map((e) => (
                    <li key={e.rang}>
                      Part {e.rang} · bordereau {e.mois} ·{' '}
                      {e.mission_id ? `${Number(e.montant_ht).toFixed(2)} € HT portée` : Number(e.montant_ht) > 0 ? `${Number(e.montant_ht).toFixed(2)} € HT prévus` : 'montant connu après validation'}
                    </li>
                  ))}
                </ul>
                {total > 0 && <p className="mt-1 text-muted">Total réparti : {total.toFixed(2)} € HT</p>}
              </div>
            )
          })}
          <form action={creerLissage} className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-navy">Intervenant qui a fait le travail
              <select name="provider_id" required className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm">
                {fiches.map((f) => <option key={f.id} value={f.id}>{f.legal_name}</option>)}
              </select>
            </label>
            <label className="text-xs text-navy">Fiche qui facture et reçoit (lui-même ou un tiers)
              <select name="beneficiaire_id" className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm">
                <option value="">Le même intervenant</option>
                {fiches.map((f) => <option key={f.id} value={f.id}>{f.legal_name}</option>)}
              </select>
            </label>
            <label className="text-xs text-navy">Travail du mois
              <input type="month" name="mois_debut" required className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-navy">au mois
              <input type="month" name="mois_fin" required className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-navy">Nombre de parts
              <input type="number" name="parts" min={2} max={12} defaultValue={5} required className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-navy">Première part dans le bordereau du mois
              <input type="month" name="premier_mois" required className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
            </label>
            <input name="titre" placeholder="Intitulé (ex. Missions nov.–déc. 2026)" className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2" />
            <button type="submit" className="cursor-pointer rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Créer l’étalement</button>
          </form>
        </Card>
        <Card>
          <p className="mb-3 text-sm font-semibold text-navy">Nouveau groupe</p>
          <FormGroupe groupe={null} fiches={visibles} groupes={groupes} depots={depots} />
        </Card>
      </div>
    </>
  )
}
