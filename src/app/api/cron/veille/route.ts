import { NextResponse } from 'next/server'
import { servedBrandIds } from '@/lib/brand'
import { activeBrandId, sousMarque } from '@/lib/brand/actif'
import { cycleForDate, todayParis } from '@/lib/cycle'
import { alerterVeilleVerification, HEURE_VEILLE, heureParis } from '@/lib/veille-verification'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 120

/**
 * Tâche horaire. Le dernier jour de vérification, à 20 h à Paris (4 h avant
 * minuit, quand la vérification se ferme), elle écrit à Ben ce que chaque
 * manager n'a pas validé, et à chaque manager sa liste. La tâche du matin
 * passe trop tôt : à 8 h, il reste seize heures, et personne ne relit un
 * mail du matin le soir.
 *
 * Une fois par mois et par école (inv_cycle_events). Pour essayer à la main :
 * ?date=2026-11-30&heure=20 (avec le secret).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  const url = new URL(request.url)
  const today = url.searchParams.get('date') ?? todayParis()
  const heure = Number(url.searchParams.get('heure') ?? heureParis())
  const cycle = cycleForDate(today)

  // De 20 h à 23 h : une heure manquée par la plateforme se rattrape à la suivante.
  if (today !== cycle.reviewEnd || heure < HEURE_VEILLE) {
    return NextResponse.json({ ok: true, rien: `pas l'heure (${today} ${heure} h, clôture le ${cycle.reviewEnd})` })
  }

  const db = createServiceClient()
  const marques: Record<string, unknown> = {}
  for (const id of servedBrandIds()) {
    marques[id] = await sousMarque(id, async () => {
      const cle = `${await activeBrandId()}:veille_verification`
      // Réservée avant l'envoi : deux appels simultanés n'écrivent pas deux fois.
      const { error } = await db.from('inv_cycle_events').insert({ cycle_month: cycle.month, event: cle })
      if (error) return { deja: true }
      const resultat = await alerterVeilleVerification(db, cycle)
      await db.from('inv_cycle_events').update({ detail: resultat }).eq('cycle_month', cycle.month).eq('event', cle)
      return resultat
    }).catch((err) => ({ erreur: err instanceof Error ? err.message : String(err) }))
  }
  return NextResponse.json({ ok: true, date: today, heure, marques })
}
