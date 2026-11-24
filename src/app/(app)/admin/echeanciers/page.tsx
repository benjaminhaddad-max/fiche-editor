import { PageHeader, Card } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { enregistrerGroupeEcheancier, supprimerGroupeEcheancier } from '../actions'

const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']

type Groupe = { id: string; name: string; mois_sans_versement: number[] }
type Fiche = { id: string; legal_name: string; echeancier_groupe_id: string | null }

function FormGroupe({ groupe, fiches, groupes }: { groupe: Groupe | null; fiches: Fiche[]; groupes: Groupe[] }) {
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

export default async function EcheanciersPage() {
  await requireRole('admin')
  const db = createServiceClient()
  const ecole = await activeBrandId()
  const [{ data: g }, { data: f }] = await Promise.all([
    db.from('inv_echeancier_groupes').select('id, name, mois_sans_versement').eq('brand', ecole).order('name'),
    db.from('inv_providers').select('id, legal_name, echeancier_groupe_id').eq('brand', ecole).order('legal_name'),
  ])
  const groupes = (g ?? []) as Groupe[]
  const fiches = (f ?? []) as Fiche[]

  return (
    <>
      <PageHeader
        title="Échéanciers par groupe"
        description="Un groupe de prestataires, un calendrier de versements. Sans groupe, on applique l’échéancier par défaut : professeurs payés chaque mois, tuteurs et coachs Medibox sans versement en novembre."
      />
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
            <FormGroupe groupe={gr} fiches={fiches} groupes={groupes} />
          </Card>
        ))}
        <Card>
          <p className="mb-3 text-sm font-semibold text-navy">Nouveau groupe</p>
          <FormGroupe groupe={null} fiches={fiches} groupes={groupes} />
        </Card>
      </div>
    </>
  )
}
