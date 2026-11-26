import { ImportSalaries, LigneSalarie } from '@/components/social/Salaries'
import { ongletsSocial } from '@/components/social/onglets'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { salaries } from '@/lib/social/donnees'
import { requireEquipeSocial } from '@/lib/social/parametres'
import { activeBrandId } from '@/lib/brand/actif'
import { createServiceClient } from '@/lib/supabase/service'
import { PROFIL_LABEL, PROFILS } from '@/lib/social/types'

/**
 * Les fiches salarié (§3 et §4) : matricule Silae et profil, importables
 * depuis la liste exportée de Silae. Un salarié rattaché ici ne dépose pas
 * de facture ; il remplit son formulaire mensuel.
 */
export default async function SalariesPage() {
  const user = await requireEquipeSocial()
  // Les fiches à relire d'abord.
  const tous = (await salaries()).sort((a, b) => Number(!!b.aVerifier) - Number(!!a.aVerifier))
  const sansMatricule = tous.filter((s) => !s.matricule).length
  const aVerifier = tous.filter((s) => s.aVerifier).length
  // Prestataire et salarié à la fois : interdit désormais (migration 64) ;
  // les cas déjà en base restent ici, à trancher par l'équipe paie.
  const { data: doublons } = await createServiceClient().rpc('inv_doublons_prestataire_salarie', { p_brand: await activeBrandId() })
  const deuxCotes = (doublons ?? []) as { salarie_id: string; salarie_nom: string; salarie_statut: string; prestataire_nom: string; prestataire_statut: string; lien: string }[]

  return (
    <>
      <PageHeader
        title="Espace Social"
        description="Les salariés : fixes, alternants, vacataires. Le matricule Silae est la clé de l’export."
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="salaries"
      />

      {deuxCotes.length ? (
        <Card className="mb-6 border-amber-300 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Anomalie : {deuxCotes.length} personne(s) à la fois prestataire et salariée</p>
          <p className="mt-1 text-sm text-amber-900">Une personne est soit prestataire (facture), soit salariée (fiche de paie). Rien n’a été déplacé ni supprimé : à vous de trancher.</p>
          <ul className="mt-3 space-y-1 text-sm text-amber-900">
            {deuxCotes.map((d, i) => (
              <li key={i}>
                <strong>{d.salarie_nom}</strong> ({d.salarie_statut}) ↔ {d.prestataire_nom} ({d.prestataire_statut}) — {d.lien}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-6 p-5">
        <ImportSalaries />
      </Card>

      <p className="mb-3 text-sm text-muted">
        {tous.length} salarié(s) — {PROFILS.map((p) => `${tous.filter((s) => s.profil === p).length} ${PROFIL_LABEL[p].toLowerCase()}`).join(', ')}
        {sansMatricule ? ` · ${sansMatricule} sans matricule` : ''}
        {aVerifier ? ` · ${aVerifier} à vérifier (profil ou email devinés : corrigez si besoin puis « Enregistrer »)` : ''}.
      </p>

      {tous.length ? (
        <Card className="divide-y divide-line/60">
          {tous.map((s) => (
            <LigneSalarie key={s.providerId} s={s} />
          ))}
        </Card>
      ) : (
        <EmptyState title="Aucun salarié" description="Importez la liste des salariés exportée de Silae." />
      )}
    </>
  )
}
