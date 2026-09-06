import { NextResponse } from 'next/server'
import { cycleForDate } from '@/lib/cycle'
import { notifyStatementReminder } from '@/lib/email/notify'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 300

/**
 * Tâche quotidienne du cycle de facturation. Trois moments, un seul point
 * d'entrée — c'est le calendrier qui décide, pas une configuration à part.
 *
 *   mercredi suivant le dernier samedi   envoi des bordereaux
 *   deux jours avant la date limite      relance des factures manquantes
 *   le jour de la date limite            dernière relance
 *
 * Chaque étape est idempotente : relancée deux fois le même jour, elle ne
 * renvoie rien en double.
 */
export async function GET(request: Request) {
  // Vercel signe ses appels de cron ; on refuse tout le reste.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const entete = request.headers.get('authorization')
    if (entete !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
    }
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)
  const cycle = cycleForDate(new Date())
  const db = createServiceClient()
  const fait: Record<string, unknown> = { date: aujourdhui, cycle: cycle.month }

  // ---------- 1. envoi des bordereaux ----------
  if (aujourdhui === cycle.statementDate) {
    const { data: missions } = await db
      .from('inv_missions')
      .select('id, provider_id, total_ht')
      .eq('status', 'approved')
      .is('invoice_id', null)
      .is('statement_id', null)
      .lte('start_date', cycle.statementDate)

    const parPresta = new Map<string, { ids: string[]; total: number }>()
    for (const m of missions ?? []) {
      const cur = parPresta.get(m.provider_id) ?? { ids: [], total: 0 }
      parPresta.set(m.provider_id, {
        ids: [...cur.ids, m.id],
        total: cur.total + Number(m.total_ht),
      })
    }

    let crees = 0
    for (const [providerId, { ids, total }] of parPresta) {
      const { data: statement, error } = await db
        .from('inv_statements')
        .upsert(
          {
            provider_id: providerId,
            cycle_month: cycle.month,
            period_start: cycle.periodStart,
            period_end: cycle.periodEnd,
            statement_date: cycle.statementDate,
            invoice_deadline: cycle.invoiceDeadline,
            payment_start: cycle.paymentStart,
            payment_end: cycle.paymentEnd,
            status: 'sent',
            total_ht: Math.round(total * 100) / 100,
            sent_at: new Date().toISOString(),
          },
          { onConflict: 'provider_id,cycle_month' }
        )
        .select('id')
        .single()

      if (error || !statement) continue
      await db.from('inv_missions').update({ statement_id: statement.id }).in('id', ids)
      crees++
    }
    fait.bordereaux = crees
  }

  // ---------- 2. relances ----------
  const relanceJ2 = new Date(`${cycle.invoiceDeadline}T12:00:00Z`)
  relanceJ2.setUTCDate(relanceJ2.getUTCDate() - 2)
  const jourRelance = relanceJ2.toISOString().slice(0, 10)

  if (aujourdhui === jourRelance || aujourdhui === cycle.invoiceDeadline) {
    const { data: enRetard } = await db
      .from('inv_statements')
      .select('id, reminded_at')
      .eq('status', 'accepted')
      .is('invoice_id', null)

    let relances = 0
    for (const s of enRetard ?? []) {
      // Une seule relance par jour et par bordereau.
      if (s.reminded_at?.slice(0, 10) === aujourdhui) continue
      if (await notifyStatementReminder(s.id)) relances++
    }
    fait.relances = relances
  }

  return NextResponse.json({ ok: true, ...fait })
}
