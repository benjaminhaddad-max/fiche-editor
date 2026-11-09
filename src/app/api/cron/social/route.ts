import { NextResponse } from 'next/server'
import { servedBrandIds } from '@/lib/brand'
import { activeBrandId, sousMarque } from '@/lib/brand/actif'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'
import { etapes, maintenantParis, moisPrecedentDe, repere, type Etape } from '@/lib/social/calendrier'
import { tableauDuMois } from '@/lib/social/donnees'
import { lireParametres } from '@/lib/social/parametres'
import { demanderElements } from '@/lib/social/relances'
import { aRepondu } from '@/lib/social/saisie'
import { GROUPE_LABEL, type GroupeSocial } from '@/lib/social/types'

export const maxDuration = 300

type Db = ReturnType<typeof createServiceClient>

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Le calendrier de l'Espace Social, joué chaque heure.
 *
 * Les heures viennent des réglages (Espace Social → Paramètres) : demande
 * le 25 au matin, relance le soir, dernière relance le 26 à midi, clôture
 * le 26 à minuit pour les fixes et alternants ; relance deux jours avant la
 * fin du mois et clôture le 1er à midi pour les vacataires. À la clôture,
 * l'équipe paie reçoit l'état du mois.
 *
 * L'envoi à Net Paye n'est pas joué ici : il part sur clic de Shirel,
 * après sa validation (décision par défaut du lot 1).
 *
 * Chaque étape, une fois par mois et par école (inv_cycle_events). Une
 * heure manquée se rattrape dans la journée, jamais le lendemain.
 * Pour essayer : ?date=2026-11-25&heure=8 (avec le secret).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  const url = new URL(request.url)
  const ici = maintenantParis()
  const date = url.searchParams.get('date') ?? ici.date
  const heure = Number(url.searchParams.get('heure') ?? ici.heure)
  const maintenant = repere(date, heure)

  const db = createServiceClient()
  const marques: Record<string, unknown> = {}
  for (const id of servedBrandIds()) {
    marques[id] = await sousMarque(id, () => jouer(db, date, maintenant)).catch((err) => ({
      erreur: err instanceof Error ? err.message : String(err),
    }))
  }
  return NextResponse.json({ ok: true, date, heure, marques })
}

async function jouer(db: Db, date: string, maintenant: string): Promise<Record<string, unknown>> {
  const { calendrier, equipe } = await lireParametres()
  const fait: Record<string, unknown> = {}
  const mois = date.slice(0, 7)

  // Fixes : le mois en cours. Vacataires : la relance porte sur le mois en
  // cours, la clôture sur le mois écoulé (elle tombe le 1er du suivant).
  const aJouer: [GroupeSocial, string, Etape][] = [
    ...etapes('fixes', mois, calendrier).map((e) => ['fixes', mois, e] as [GroupeSocial, string, Etape]),
    ...etapes('vacataires', mois, calendrier).filter((e) => e.cle === 'relance').map((e) => ['vacataires', mois, e] as [GroupeSocial, string, Etape]),
    ...etapes('vacataires', moisPrecedentDe(mois), calendrier)
      .filter((e) => e.cle === 'cloture')
      .map((e) => ['vacataires', moisPrecedentDe(mois), e] as [GroupeSocial, string, Etape]),
    // Une clôture des vacataires avancée au vendredi tombe dans le mois même.
    ...etapes('vacataires', mois, calendrier)
      .filter((e) => e.cle === 'cloture' && e.date.slice(0, 7) === mois)
      .map((e) => ['vacataires', mois, e] as [GroupeSocial, string, Etape]),
  ]

  for (const [groupe, period, e] of aJouer) {
    if (!e.automatique) continue
    // L'heure est venue, et c'est encore le jour prévu. « Minuit » (24 h)
    // se joue à 0 h le lendemain : la saisie reste ouverte jusque-là.
    const [jour, h] = e.heure >= 24 ? [lendemain(e.date), 0] : [e.date, e.heure]
    if (jour !== date || maintenant < repere(jour, h)) continue
    const cle = `${await activeBrandId()}:social_${groupe}_${e.cle}`
    const { error } = await db.from('inv_cycle_events').insert({ cycle_month: period, event: cle })
    if (error) continue // déjà joué (ou en cours)
    let resultat: unknown
    if (e.cle === 'cloture') resultat = await alerterCloture(groupe, period, equipe)
    else resultat = await demanderElements(groupe, period, e.cle !== 'ouverture')
    await db.from('inv_cycle_events').update({ detail: resultat ?? {} }).eq('cycle_month', period).eq('event', cle)
    fait[`${groupe}:${period}:${e.cle}`] = resultat
  }
  return fait
}

function lendemain(d: string): string {
  return new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

/** À la clôture, l'équipe paie reçoit l'état du mois. */
async function alerterCloture(groupe: GroupeSocial, period: string, equipe: string[]) {
  const lignes = await tableauDuMois(period, groupe)
  if (!lignes.length) return { rien: 'aucun salarié' }
  const aValider = lignes.filter((l) => l.saisie.status === 'a_valider')
  const sansReponse = lignes.filter((l) => !aRepondu(l.saisie)).map((l) => l.salarie.nom)
  for (const email of equipe) {
    await deliver({
      to: { email },
      ...(await templates()).socialCloture({
        label: libelleMois(period),
        groupe: GROUPE_LABEL[groupe],
        aValider: aValider.length,
        sansReponse,
        anomalies: aValider.filter((l) => l.anomalies.length).length,
      }),
      template: 'social_cloture',
    })
  }
  return { aValider: aValider.length, sansReponse: sansReponse.length, prevenus: equipe.length }
}
