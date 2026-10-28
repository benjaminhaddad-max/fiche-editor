import { Suspense } from 'react'
import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { RecherchePrestataire } from '@/components/prestations/RecherchePrestataire'
import { ListeManquants } from '@/components/prestations/ListeManquants'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { EmptyState, StatTile } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { cycleForDate, todayParis } from '@/lib/cycle'
import { formatDateLong, money } from '@/lib/format'
import { correspondPrestataire } from '@/lib/recherche-prestataire'
import { prestatairesSansDeclaration } from '@/lib/manquants'

export default async function ManquantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const cherche = ((await searchParams).q ?? '').trim()
  const cycle = cycleForDate(todayParis())

  const tous = await prestatairesSansDeclaration(
    user.role === 'manager' ? { managerId: user.id } : {}
  )
  const gens = tous.filter((m) => correspondPrestataire(m.nom, cherche))

  const echeances = gens.filter((m) => m.echeance)
  const habitues = gens.filter((m) => !m.echeance && m.dernierMois)
  const jamais = gens.filter((m) => !m.echeance && !m.dernierMois)
  const bloques = gens.filter((m) => m.manque.length > 0)
  const duContrat = echeances.reduce((s, m) => s + (m.echeance?.montant ?? 0), 0)

  return (
    <>
      <PrestationsNav
        user={user}
        current="manquants"
        description={`Qui n’a rien déclaré sur ${cycle.label}, nommément — et ce qu’il faut faire pour chacun.`}
      />
      <CalendrierMois pour="manager" />

      {tous.length === 0 ? (
        <EmptyState
          title={`Tout le monde a déclaré sur ${cycle.label}`}
          description="Personne ne manque à l’appel. Il n’y a plus qu’à valider ce qui est remonté."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile
              label="Sans déclaration"
              value={String(tous.length)}
              sub={`Déclarations closes le ${formatDateLong(cycle.declarationDeadline)}`}
              accent={tous.length > 0 ? 'amber' : 'slate'}
            />
            <StatTile
              label="Échéance de contrat à porter"
              value={String(echeances.length)}
              sub={echeances.length ? `${money(duContrat)} prévus par leur contrat` : 'Aucune'}
            />
            <StatTile
              label="Fiche à compléter"
              value={String(bloques.length)}
              sub={bloques.length ? 'Leur paiement ne partira pas en l’état' : 'Aucune'}
            />
          </div>

          <Suspense fallback={null}>
            <RecherchePrestataire className="mb-4" />
          </Suspense>

          {gens.length === 0 ? (
            <EmptyState title={`Personne de ce nom dans la liste pour « ${cherche} »`} />
          ) : (
            <>
              <ListeManquants
                titre="Rien à saisir de leur part"
                aide="Leur contrat prévoit cette échéance : un clic la porte sur le mois, sans rien leur demander."
                gens={echeances}
              />
              <ListeManquants
                titre="Ils déclarent d’habitude"
                aide="Ils ont déjà déclaré les mois précédents : c’est ici que la relance sert à quelque chose."
                gens={habitues}
              />
              <ListeManquants
                titre="N’ont jamais rien déclaré"
                aide="Un compte ouvert et jamais utilisé. Si la personne ne travaille plus, mieux vaut la désactiver que la relancer chaque mois."
                gens={jamais}
              />
            </>
          )}
        </>
      )}
    </>
  )
}
