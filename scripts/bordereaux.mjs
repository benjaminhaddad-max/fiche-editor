#!/usr/bin/env node
/**
 * Bordereaux mensuels de facturation.
 *
 *   node --experimental-websocket scripts/bordereaux.mjs                aperçu du mois courant
 *   node --experimental-websocket scripts/bordereaux.mjs --apply        crée et envoie
 *   node --experimental-websocket scripts/bordereaux.mjs --cloture      clôt les bordereaux échus
 *   ... --mois 2026-09                                                  cible un mois précis
 *
 * Un bordereau reprend tout ce qui est dû au prestataire à la date d'envoi :
 * les missions du mois, mais aussi une échéance de coaching plus ancienne
 * jamais facturée. C'est ce qui évite qu'un oubli reste coincé un mois de
 * plus.
 *
 * Sans réponse à la date limite, le bordereau est réputé accepté : c'est le
 * fonctionnement annoncé aux prestataires, et ça évite de bloquer un
 * paiement parce que quelqu'un n'a pas cliqué.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { billingCycle } from './lib/cycle.mjs'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const CLOTURE = args.includes('--cloture')
const moisArg = args[args.indexOf('--mois') + 1]
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
const BREVO = process.env.BREVO_API_KEY

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const euro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  .format(Number(v)).replace(/ /g, ' ')
const jour = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })

async function envoyer(to, subject, html, meta) {
  if (!APPLY) return { status: 'skipped' }
  if (!BREVO) return { status: 'skipped', error: 'BREVO_API_KEY absente' }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME ?? 'Facturation Diploma Santé',
        email: process.env.BREVO_SENDER_EMAIL ?? 'facturation@diploma-sante.fr',
      },
      to: [{ email: to.email, name: to.name }], subject, htmlContent: html,
    }),
  })
  const body = await res.text()
  const out = res.ok
    ? { status: 'sent', id: (() => { try { return JSON.parse(body).messageId } catch { return null } })() }
    : { status: 'error', error: `Brevo ${res.status} : ${body.slice(0, 160)}` }
  await db.from('inv_email_log').insert({
    to_email: to.email, to_name: to.name ?? null, template: meta.template, subject,
    entity_type: meta.entityType, entity_id: meta.entityId, provider_id: meta.providerId ?? null,
    brevo_message_id: out.id ?? null, status: out.status, error: out.error ?? null,
  })
  return out
}

const gabarit = (titre, corps, cta) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f4ee;">
<table role="presentation" width="100%" style="background:#f7f4ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5ddc8;
 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:24px 28px 0;"><p style="margin:0;font-size:13px;font-weight:600;color:#a8892e;">DIPLOMA INVOICE</p>
<h1 style="margin:8px 0 0;font-size:19px;color:#0e1e35;">${titre}</h1></td></tr>
<tr><td style="padding:16px 28px;font-size:14px;line-height:1.65;color:#3b4c63;">${corps}</td></tr>
<tr><td style="padding:0 28px 24px;"><a href="${cta.href}" style="display:inline-block;background:#0e1e35;
 color:#fff;text-decoration:none;font-size:14px;padding:11px 20px;border-radius:8px;">${cta.label}</a></td></tr>
</table></td></tr></table></body></html>`

// ============================================================
// CLÔTURE : les bordereaux dont la date limite est passée
// ============================================================
if (CLOTURE) {
  const aujourdhui = process.env.DATE_REFERENCE ?? new Date().toISOString().slice(0, 10)
  const { data: echus } = await db.from('inv_statements')
    .select('id, cycle_month, total_ht, invoice_deadline, provider:inv_providers(legal_name)')
    .eq('status', 'sent').lt('invoice_deadline', aujourdhui)

  console.log(`\nBordereaux dont la date limite est dépassée au ${jour(aujourdhui)} : ${echus.length}\n`)
  for (const s of echus) {
    console.log(`  ${APPLY ? '✓' : '·'} ${s.cycle_month}  ${euro(s.total_ht).padStart(11)}  ${s.provider?.legal_name}`)
    if (!APPLY) continue
    await db.from('inv_statements')
      .update({ status: 'accepted', accepted_at: new Date().toISOString(), auto_accepted: true })
      .eq('id', s.id)
  }
  console.log(APPLY ? '\n✓ Bordereaux acceptés faute de contestation.\n' : '\n(aperçu — relancez avec --apply)\n')
  process.exit(0)
}

// ============================================================
// GÉNÉRATION
// ============================================================
const [an, mo] = (moisArg ?? new Date().toISOString().slice(0, 7)).split('-').map(Number)
const cycle = billingCycle(an, mo - 1)

console.log(`\nBordereau ${cycle.month}`)
console.log(`  saisie jusqu'au ${jour(cycle.periodEnd)} · envoi ${jour(cycle.statementDate)} · facture avant ${jour(cycle.invoiceDeadline)} · paiement ${jour(cycle.paymentStart)} → ${jour(cycle.paymentEnd)}\n`)

// Tout ce qui est dû à la date d'envoi, y compris les reliquats plus anciens.
const { data: missions, error } = await db.from('inv_missions')
  .select('id, provider_id, detail, start_date, total_ht, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name))')
  .eq('status', 'approved').is('invoice_id', null).is('statement_id', null)
  .lte('start_date', cycle.statementDate)
  .order('start_date')

if (error) { console.error('✗', error.message); process.exit(1) }

const parPresta = new Map()
for (const m of missions) {
  const cur = parPresta.get(m.provider_id) ?? { provider: m.provider, missions: [] }
  cur.missions.push(m)
  parPresta.set(m.provider_id, cur)
}

let crees = 0
for (const [providerId, { provider, missions: lignes }] of parPresta) {
  const total = Math.round(lignes.reduce((s, m) => s + Number(m.total_ht), 0) * 100) / 100
  const nom = provider?.legal_name ?? '—'
  const user = provider?.user

  console.log(`  ${APPLY ? '✓' : '·'} ${nom.padEnd(24)} ${String(lignes.length).padStart(2)} ligne(s)  ${euro(total).padStart(11)}  ${user?.email ?? 'PAS D’EMAIL'}`)
  for (const l of lignes) console.log(`       ${jour(l.start_date)}  ${euro(l.total_ht).padStart(10)}  ${l.detail.slice(0, 62)}`)

  if (!APPLY) continue

  const { data: statement, error: sErr } = await db.from('inv_statements').upsert({
    provider_id: providerId, cycle_month: cycle.month,
    period_start: cycle.periodStart, period_end: cycle.periodEnd,
    statement_date: cycle.statementDate, invoice_deadline: cycle.invoiceDeadline,
    payment_start: cycle.paymentStart, payment_end: cycle.paymentEnd,
    status: 'sent', total_ht: total, sent_at: new Date().toISOString(),
  }, { onConflict: 'provider_id,cycle_month' }).select('id').single()
  if (sErr) { console.error(`     ✗ ${sErr.message}`); continue }

  await db.from('inv_missions').update({ statement_id: statement.id })
    .in('id', lignes.map((l) => l.id))

  if (user?.email) {
    const corps = `<p style="margin:0 0 12px;">Bonjour ${user.full_name},</p>
      <p style="margin:0 0 12px;">Voici le récapitulatif de vos prestations validées, pour un total de
        <strong>${euro(total)} HT</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0 0 14px;">
        ${lignes.map((l) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5ddc8;color:#475569;">${l.detail}</td>
          <td style="padding:6px 0;border-bottom:1px solid #e5ddc8;text-align:right;white-space:nowrap;"><strong>${euro(l.total_ht)}</strong></td></tr>`).join('')}
      </table>
      <p style="margin:0 0 12px;">Vérifiez ces lignes. Si l'une d'elles ne correspond pas, contestez-la depuis
        votre espace. <strong>Sans réponse de votre part au ${jour(cycle.invoiceDeadline)}, le bordereau
        est considéré comme accepté.</strong></p>
      <p style="margin:0;">Votre facture doit nous parvenir au plus tard le
        <strong>${jour(cycle.invoiceDeadline)}</strong>. Les paiements sont effectués du
        ${jour(cycle.paymentStart)} au ${jour(cycle.paymentEnd)}.</p>`
    const r = await envoyer({ email: user.email, name: user.full_name },
      `Votre bordereau de facturation — ${euro(total)}`, gabarit('Votre bordereau est disponible', corps,
      { label: 'Voir mon bordereau', href: `${APP_URL}/bordereaux/${statement.id}` }),
      { template: 'statement_sent', entityType: 'statement', entityId: statement.id, providerId })
    if (r.status !== 'sent') console.log(`     ⚠ email : ${r.error ?? r.status}`)
  }
  crees++
}

if (!parPresta.size) console.log('  aucune prestation en attente de bordereau')
const somme = [...parPresta.values()].reduce((s, p) => s + p.missions.reduce((t, m) => t + Number(m.total_ht), 0), 0)
console.log(`\n  ${parPresta.size} bordereau(x) · ${euro(somme)}`)
console.log(APPLY ? `\n✓ ${crees} envoyé(s).\n` : '\n(aperçu — relancez avec --apply)\n')
