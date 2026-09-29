import Link from 'next/link'
import { Suspense } from 'react'
import { cycleForDate, todayParis } from '@/lib/cycle'
import { Clock } from 'lucide-react'
import { EmptyState } from '@/components/ui/Page'
import { ValidationTable } from '@/components/validation/ValidationTable'
import { PanneauVerification } from '@/components/validation/PanneauVerification'
import type { LigneManager } from '@/components/validation/EtatVerification'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { getMissionsByStatus } from '@/lib/missions'
import { ManagerPicker } from '@/components/validation/ManagerPicker'
import { getManagers } from '@/lib/queries'
import { CalendrierMois } from '@/components/cycle/CalendrierMois'
import { PrestationsNav } from '@/components/prestations/PrestationsNav'
import { RecherchePrestataire } from '@/components/prestations/RecherchePrestataire'
import { correspondPrestataire } from '@/lib/recherche-prestataire'
import { PenLine } from 'lucide-react'

export default async function ValidationPage({
  searchParams,
}: {
  searchParams: Promise<{ manager?: string; q?: string }>
}) {
  const user = await requireRole('manager', 'admin')
  const { manager, q } = await searchParams
  const cherche = (q ?? '').trim()
  const cycle = cycleForDate(todayParis())

  if (user.role === 'manager') {
    const [toutes, managers] = await Promise.all([
      getMissionsByStatus(['submitted'], { managerId: user.id }),
      getManagers(),
    ])
    const missions = toutes.filter((m) => correspondPrestataire(m.provider_name, cherche))
    return (
      <>
        <PrestationsNav
          user={user}
          current="a-valider"
          actions={
            <Link href="/validation/declarer" className="ds-header-action-ghost">
              <PenLine size={16} />
              Déclarer pour un prestataire
            </Link>
          }
        />
        <CalendrierMois pour="manager" />
        {(toutes.length > 0 || cherche) && (
          <Suspense fallback={null}>
            <RecherchePrestataire className="mb-4" />
          </Suspense>
        )}
        {missions.length === 0 ? (
          cherche ? (
            <EmptyState title={`Aucune prestation à valider pour « ${cherche} »`} />
          ) : (
            <EmptyState
              title="Rien à valider"
              description="Aucune prestation ne vous est soumise pour le moment."
            />
          )
        ) : (
          <>
            <p className="mb-4 text-sm text-navy/70">
              {missions.length} prestation{missions.length > 1 ? 's' : ''} ·{' '}
              <span className="font-semibold text-navy">
                {money(missions.reduce((s, m) => s + m.total_ht, 0))} HT
              </span>
            </p>
            <ValidationTable missions={missions} managers={managers} moi={user.id} />
          </>
        )}
      </>
    )
  }

  // Par défaut on montre ce qui est rattaché à l'administrateur connecté,
  // mais on signale toujours combien de lignes vivent ailleurs : personne ne
  // doit rater une prestation parce qu'un filtre la masquait.
  const choix = manager ?? user.id
  const filtre = choix === 'tous' ? {} : { managerId: choix }

  const [parFiltreAdmin, parFiltreManager, tousAdmin, tousManager, managers] =
    await Promise.all([
      getMissionsByStatus(['manager_approved'], filtre),
      getMissionsByStatus(['submitted'], filtre),
      getMissionsByStatus(['manager_approved']),
      getMissionsByStatus(['submitted']),
      getManagers(),
    ])

  // Une recherche de prestataire porte sur TOUS les managers : cherché par son
  // nom, un prestataire rattaché à un autre manager ne doit pas rester caché
  // derrière le filtre.
  const awaitingAdmin = cherche
    ? tousAdmin.filter((m) => correspondPrestataire(m.provider_name, cherche))
    : parFiltreAdmin
  const awaitingManager = cherche
    ? tousManager.filter((m) => correspondPrestataire(m.provider_name, cherche))
    : parFiltreManager

  const ailleurs = cherche
    ? 0
    : tousAdmin.length + tousManager.length - parFiltreAdmin.length - parFiltreManager.length

  // L'état de la vérification, tous managers confondus : pendant ces trois
  // jours, la seule question utile est « qui n'a pas fini ». Le filtre y
  // répondait un manager à la fois.
  const parManager = new Map<string, LigneManager>()
  const nom = new Map(managers.map((m) => [m.id, m.full_name]))
  const compter = (liste: typeof tousAdmin, champ: 'attente' | 'faites') => {
    for (const m of liste) {
      const id = m.manager_id ?? ''
      const l =
        parManager.get(id) ??
        { id, nom: nom.get(id) ?? m.manager_name, attente: 0, attenteTotal: 0, faites: 0, faitesTotal: 0 }
      if (champ === 'attente') { l.attente++; l.attenteTotal += m.total_ht }
      else { l.faites++; l.faitesTotal += m.total_ht }
      parManager.set(id, l)
    }
  }
  compter(tousManager, 'attente')
  compter(tousAdmin, 'faites')
  const etat = [...parManager.values()].sort(
    (a, b) => b.attente - a.attente || a.nom.localeCompare(b.nom, 'fr')
  )

  return (
    <>
      <PrestationsNav
        user={user}
        current="a-valider"
        description="Ce que les managers ont validé part dans le bordereau du 1er. Vous pouvez intervenir avant."
        actions={
          <Link href="/validation/declarer" className="ds-header-action-ghost">
            <PenLine size={16} />
            Déclarer pour un prestataire
          </Link>
        }
      />

      <PanneauVerification lignes={etat} reviewEnd={cycle.reviewEnd} />

      <Suspense fallback={null}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 [&>div]:mb-0">
          <ManagerPicker managers={managers} value={choix} ailleurs={ailleurs} />
          <RecherchePrestataire />
        </div>
      </Suspense>
      {cherche && (
        <p className="-mt-3 mb-6 text-xs text-muted">
          Recherche « {cherche} » sur tous les managers.
        </p>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-navy">
            Validées par le manager — partiront dans le bordereau
          </h2>
          {awaitingAdmin.length > 0 && (
            <span className="text-sm text-navy/70">
              {awaitingAdmin.length} ·{' '}
              <span className="font-semibold text-navy">
                {money(awaitingAdmin.reduce((s, m) => s + m.total_ht, 0))} HT
              </span>
            </span>
          )}
        </div>
        {awaitingAdmin.length === 0 ? (
          <EmptyState title={cherche ? `Rien de validé pour « ${cherche} »` : 'Rien de validé en attente du bordereau'} />
        ) : (
          <ValidationTable missions={awaitingAdmin} showManager managers={managers} moi={user.id} />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Clock size={15} className="text-stone" />
          <h2 className="text-sm font-semibold text-navy">
            En attente du manager
          </h2>
        </div>
        <p className="mb-3 text-xs text-muted">
          Vous pouvez valider directement : les deux étapes seront cochées d’un coup.
        </p>
        {awaitingManager.length === 0 ? (
          <EmptyState title={cherche ? `Rien en attente côté manager pour « ${cherche} »` : 'Aucune prestation en attente côté manager'} />
        ) : (
          <ValidationTable missions={awaitingManager} showManager managers={managers} moi={user.id} />
        )}
      </section>
    </>
  )
}
