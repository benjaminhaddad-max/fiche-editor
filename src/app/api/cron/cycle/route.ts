import { NextResponse } from 'next/server'
import { envoyerBordereaux } from '@/lib/bordereaux'
import { ouvrirEcheances } from '@/lib/echeances'
import { ouvrirForfaitsMensuels } from '@/lib/contracts/mensuel'
import { rafraichirPaiements } from '@/lib/invoice/pennylane'
import { cycleForDate, previousCycle, todayParis, type BillingCycle } from '@/lib/cycle'
import { deliver, notifyStatementReminder } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { addDays, round2 } from '@/lib/format'
import { relancerDeclarations } from '@/lib/relances'
import { createServiceClient } from '@/lib/supabase/service'
import { isSalaried, type Employment } from '@/lib/types'
import { sendSms } from '@/lib/email/sms'

export const maxDuration = 300

type Db = ReturnType<typeof createServiceClient>

/**
 * Tâche quotidienne du cycle (8 h à Paris). Le calendrier décide :
 *
 *   le 1er            calendrier du nouveau mois à tous
 *                     bordereau global du mois écoulé
 *   L−5               rappel aux prestataires : clôture des déclarations à L−3
 *                     demande des éléments de paie aux salariés
 *   L−1               relance des salariés qui n'ont rien renseigné
 *   L−2               début de la vérification : rappel aux managers
 *   le 2              relance des factures manquantes (email + SMS)
 *   dernier jour      forfaits mensuels des contrats → prestations
 *   chaque jour       état de paiement relu dans Pennylane
 *                     échéances de contrat arrivées à terme → prestations
 *                     rappel au manager des bons de mission arrivés à échéance
 *
 * Chaque étape n'est jouée qu'une fois par mois (inv_cycle_events).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }

  const url = new URL(request.url)
  // Pour rejouer une journée précise à la main : ?date=2026-10-01 (avec le secret).
  const today = url.searchParams.get('date') ?? todayParis()
  const courant = cycleForDate(today)
  const precedent = previousCycle(courant)
  const db = createServiceClient()
  const fait: Record<string, unknown> = { date: today }

  // Ce qui a été payé dans Pennylane doit cesser d'apparaître comme dû ici.
  const paiements = await rafraichirPaiements()
  fait.paiements = { verifiees: paiements.verifiees, payees: paiements.payees.length, erreurs: paiements.erreurs.length }

  // Avant les bordereaux : une échéance du dernier jour du mois doit y figurer.
  fait.echeances = await ouvrirEcheances(today)
  fait.forfaits = await ouvrirForfaitsMensuels(today)

  if (today === courant.periodStart) {
    fait.calendrier = await uneFois(db, courant.month, 'calendrier', () => envoyerCalendrier(db, courant))
  }
  if (today === precedent.statementDate) {
    fait.bordereaux = await uneFois(db, precedent.month, 'bordereaux', () => envoyerBordereaux(precedent))
  }
  // Trois jours avant la clôture : chacun reçoit sa date. Les prestataires
  // celle des déclarations, les managers celle où les factures doivent être
  // reçues — ce ne sont pas les mêmes échéances.
  if (today === addDays(courant.declarationDeadline, -3)) {
    fait.rappelDeclaration = await uneFois(db, courant.month, 'rappel_declaration', () =>
      relancerDeclarations(courant, null)
    )
  }
  if (today === addDays(courant.declarationDeadline, -2)) {
    fait.elementsPaie = await uneFois(db, courant.month, 'elements_paie', () => demanderElements(db, courant, false))
  }
  if (today === addDays(courant.declarationDeadline, -1)) {
    fait.relanceElements = await uneFois(db, courant.month, 'relance_elements', () => demanderElements(db, courant, true))
  }
  if (today === courant.reviewStart) {
    fait.rappelVerification = await uneFois(db, courant.month, 'rappel_verification', () => rappelerVerification(db, courant))
  }
  if (today === precedent.invoiceDeadline) {
    fait.relances = await uneFois(db, precedent.month, 'relance_factures', () => relancerFactures(db, precedent))
  }
  fait.bonsEchus = await rappelerBonsEchus(db, today)

  return NextResponse.json({ ok: true, ...fait })
}

async function uneFois(db: Db, mois: string, etape: string, faire: () => Promise<unknown>) {
  const { data: deja } = await db
    .from('inv_cycle_events')
    .select('created_at')
    .eq('cycle_month', mois)
    .eq('event', etape)
    .maybeSingle()
  if (deja) return { deja: deja.created_at }
  // On réserve l'étape AVANT de la jouer : deux appels simultanés ne doivent
  // pas envoyer deux fois les mêmes emails.
  const { error } = await db.from('inv_cycle_events').insert({ cycle_month: mois, event: etape })
  if (error) return { deja: 'en cours' }
  const resultat = await faire()
  await db
    .from('inv_cycle_events')
    .update({ detail: resultat ?? {} })
    .eq('cycle_month', mois)
    .eq('event', etape)
  return resultat
}

async function destinataires(db: Db) {
  const { data } = await db
    .from('inv_users')
    .select('id, email, full_name, role, provider:inv_providers!inv_providers_user_id_fkey(employment_type)')
    .eq('is_active', true)
  return (data ?? []) as unknown as {
    id: string
    email: string
    full_name: string
    role: string
    provider: { employment_type: Employment }[] | { employment_type: Employment } | null
  }[]
}

const statut = (p: { employment_type: Employment }[] | { employment_type: Employment } | null) =>
  (Array.isArray(p) ? p[0] : p)?.employment_type

async function envoyerCalendrier(db: Db, cycle: BillingCycle) {
  let n = 0
  for (const u of await destinataires(db)) {
    if (u.role === 'admin') continue
    const pub = u.role === 'manager' ? 'manager' : isSalaried(statut(u.provider)) ? 'salarie' : 'prestataire'
    await deliver({
      to: { email: u.email, name: u.full_name },
      ...templates.monthCalendar({ name: u.full_name, public: pub, cycle }),
      template: 'month_calendar',
      entityType: 'user',
      entityId: u.id,
    })
    n++
  }
  return { envoyes: n }
}

async function rappelerVerification(db: Db, cycle: BillingCycle) {
  const { data } = await db
    .from('inv_missions')
    .select('manager_id, total_ht')
    .eq('status', 'submitted')
    .lte('start_date', cycle.periodEnd)
  const parManager = new Map<string, { n: number; total: number }>()
  for (const m of data ?? []) {
    const c = parManager.get(m.manager_id) ?? { n: 0, total: 0 }
    parManager.set(m.manager_id, { n: c.n + 1, total: c.total + Number(m.total_ht) })
  }
  let n = 0
  for (const u of await destinataires(db)) {
    if (u.role === 'prestataire') continue
    const c = parManager.get(u.id)
    if (!c) continue
    await deliver({
      to: { email: u.email, name: u.full_name },
      ...templates.reviewReminder({ name: u.full_name, count: c.n, total: round2(c.total), reviewEnd: cycle.reviewEnd, label: cycle.label }),
      template: 'review_reminder',
      entityType: 'user',
      entityId: u.id,
    })
    n++
  }
  return { envoyes: n }
}

async function relancerFactures(db: Db, cycle: BillingCycle) {
  const { data } = await db
    .from('inv_statements')
    .select('id')
    .eq('cycle_month', cycle.month)
    .in('status', ['sent', 'contested', 'accepted'])
    .is('invoice_id', null)
  let n = 0
  for (const s of data ?? []) if (await notifyStatementReminder(s.id)) n++
  return { relances: n }
}

/**
 * Demande à chaque salarié ses éléments du mois — heures supplémentaires,
 * congés, transport, mutuelle. En relance, seuls ceux qui n'ont rien
 * renseigné sont sollicités, et le SMS s'ajoute à l'email.
 */
async function demanderElements(db: Db, cycle: BillingCycle, relance: boolean) {
  const { data: fiches } = await db
    .from('inv_providers')
    .select('id, phone, employment_type, user:inv_users!inv_providers_user_id_fkey(email, full_name, is_active)')
    .neq('employment_type', 'independant')
  const { data: saisies } = await db
    .from('inv_payroll_inputs')
    .select('provider_id, submitted_at')
    .eq('period', cycle.month)
  const repondu = new Set((saisies ?? []).filter((s) => s.submitted_at).map((s) => s.provider_id as string))

  let n = 0
  for (const f of (fiches ?? []) as unknown as {
    id: string
    phone: string | null
    user: { email: string; full_name: string; is_active: boolean } | null
  }[]) {
    if (!f.user?.is_active) continue
    if (relance && repondu.has(f.id)) continue
    await deliver({
      to: { email: f.user.email, name: f.user.full_name },
      ...templates.payrollInputsRequest({
        name: f.user.full_name,
        label: cycle.label,
        deadline: cycle.declarationDeadline,
        relance,
      }),
      template: relance ? 'payroll_inputs_reminder' : 'payroll_inputs_request',
      entityType: 'provider',
      entityId: f.id,
      providerId: f.id,
    })
    if (relance) {
      await sendSms(
        f.phone,
        `Diploma Santé : il manque vos éléments de paie de ${cycle.label} (heures sup., congés, transport, mutuelle). ${
          process.env.NEXT_PUBLIC_APP_URL ?? ''
        }/elements-paie`
      )
      await db
        .from('inv_payroll_inputs')
        .upsert({ provider_id: f.id, period: cycle.month, reminded_at: new Date().toISOString() }, { onConflict: 'provider_id,period' })
    }
    n++
  }
  return { envoyes: n }
}

async function rappelerBonsEchus(db: Db, today: string) {
  const { data } = await db
    .from('inv_mission_orders')
    .select(
      `id, title, end_date,
       provider:inv_providers(legal_name),
       manager:inv_users!inv_mission_orders_manager_id_fkey(email, full_name)`
    )
    .eq('status', 'accepted')
    .lte('end_date', today)
    .is('reminded_at', null)
  let n = 0
  for (const o of (data ?? []) as unknown as {
    id: string
    title: string
    end_date: string
    provider: { legal_name: string } | null
    manager: { email: string; full_name: string } | null
  }[]) {
    if (!o.manager) continue
    await deliver({
      to: { email: o.manager.email, name: o.manager.full_name },
      ...templates.orderDue({
        managerName: o.manager.full_name,
        providerName: o.provider?.legal_name ?? 'le prestataire',
        title: o.title,
        end: o.end_date,
        id: o.id,
      }),
      template: 'order_due',
      entityType: 'order',
      entityId: o.id,
    })
    await db.from('inv_mission_orders').update({ reminded_at: new Date().toISOString() }).eq('id', o.id)
    n++
  }
  return n
}
