import { ImportSalaries, LigneSalarie } from '@/components/social/Salaries'
import { ongletsSocial } from '@/components/social/onglets'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { salaries } from '@/lib/social/donnees'
import { requireEquipeSocial } from '@/lib/social/parametres'
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

  return (
    <>
      <PageHeader
        title="Espace Social"
        description="Les salariés : fixes, alternants, vacataires. Le matricule Silae est la clé de l’export."
        tabs={ongletsSocial(user.role === 'admin')}
        currentTab="salaries"
      />

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
