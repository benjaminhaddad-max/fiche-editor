#!/usr/bin/env node
/**
 * Relances par email. A programmer une fois par jour (cron Vercel ou autre).
 *
 *   node --experimental-websocket scripts/relances.mjs           aperçu
 *   node --experimental-websocket scripts/relances.mjs --apply   envoie
 *
 * Deux cas :
 *   - facture émise mais jamais transmise depuis N jours
 *   - prestations validées, facturables, dormantes depuis N jours
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const DELAY_DAYS = Number(process.env.RELANCE_DELAY_DAYS ?? 5)
const MAX_REMINDERS = Number(process.env.RELANCE_MAX ?? 3)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://diploma-invoice.vercel.app'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const BREVO = process.env.BREVO_API_KEY
const cutoff = new Date(Date.now() - DELAY_DAYS * 864e5).toISOString()
const euro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  .format(Number(v)).replace(/ /g, ' ')

async function send(to, subject, html, meta) {
  if (!APPLY) return { status: 'skipped', error: 'aperçu' }
  if (!BREVO) return { status: 'skipped', error: 'BREVO_API_KEY absente' }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME ?? 'Facturation Diploma Santé',
        email: process.env.BREVO_SENDER_EMAIL ?? 'facturation@diploma-sante.fr',
      },
      to: [{ email: to.email, name: to.name }],
      subject, htmlContent: html,
    }),
  })
  const body = await res.text()
  const result = res.ok
    ? { status: 'sent', messageId: (() => { try { return JSON.parse(body).messageId } catch { return null } })() }
    : { status: 'error', error: `Brevo ${res.status} : ${body.slice(0, 200)}` }

  await db.from('inv_email_log').insert({
    to_email: to.email, to_name: to.name ?? null, template: meta.template,
    subject, entity_type: meta.entityType, entity_id: meta.entityId,
    provider_id: meta.providerId ?? null, brevo_message_id: result.messageId ?? null,
    status: result.status, error: result.error ?? null,
  })
  return result
}

const wrap = (title, body, cta) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f1f5f9;">
<table role="presentation" width="100%" style="background:#f1f5f9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;
 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:24px 28px 0;"><p style="margin:0;font-size:13px;font-weight:600;color:#4f46e5;">DIPLOMA INVOICE</p>
<h1 style="margin:8px 0 0;font-size:19px;color:#0f172a;">${title}</h1></td></tr>
<tr><td style="padding:16px 28px;font-size:14px;line-height:1.65;color:#334155;">${body}</td></tr>
<tr><td style="padding:0 28px 24px;"><a href="${cta.href}" style="display:inline-block;background:#4f46e5;
 color:#fff;text-decoration:none;font-size:14px;padding:11px 20px;border-radius:8px;">${cta.label}</a></td></tr>
</table></td></tr></table></body></html>`

// ---------- 1. factures émises jamais transmises ----------
console.log(`\nFactures émises depuis plus de ${DELAY_DAYS} jours et non transmises`)
const { data: invoices } = await db
  .from('inv_invoices')
  .select('id, number, total_ttc, issue_date, reminder_count, provider_id, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name))')
  .eq('status', 'issued')
  .lt('issued_at', cutoff)
  .lt('reminder_count', MAX_REMINDERS)

for (const inv of invoices ?? []) {
  const u = inv.provider?.user
  if (!u?.email) { console.log(`  ✗ ${inv.number} — pas d'email`); continue }
  const html = wrap('Votre facture est en attente d’envoi',
    `<p>Bonjour ${u.full_name},</p><p>Votre facture <strong>${inv.number}</strong> (${euro(inv.total_ttc)})
     n’a pas encore été transmise. Tant qu’elle ne l’est pas, elle ne peut pas être mise en paiement.</p>`,
    { label: 'Voir ma facture', href: `${APP_URL}/factures` })
  const r = await send({ email: u.email, name: u.full_name },
    `Relance — votre facture ${inv.number} n’a pas été transmise`, html,
    { template: 'invoice_reminder', entityType: 'invoice', entityId: inv.id, providerId: inv.provider_id })
  if (APPLY && r.status === 'sent') {
    await db.from('inv_invoices')
      .update({ reminder_count: inv.reminder_count + 1, last_reminder_at: new Date().toISOString() })
      .eq('id', inv.id)
  }
  console.log(`  ${r.status === 'sent' ? '✓' : '·'} ${inv.number.padEnd(18)} ${u.email} (relance ${inv.reminder_count + 1}/${MAX_REMINDERS}) ${r.error ?? ''}`)
}
if (!invoices?.length) console.log('  aucune')

// ---------- 2. prestations validées mais pas encore facturées ----------
console.log(`\nPrestations facturables dormantes depuis plus de ${DELAY_DAYS} jours`)
const { data: missions } = await db
  .from('inv_missions')
  .select('provider_id, total_ht')
  .eq('status', 'approved')
  .is('invoice_id', null)
  .lt('admin_approved_at', cutoff)

const byProvider = new Map()
for (const m of missions ?? []) {
  const cur = byProvider.get(m.provider_id) ?? { count: 0, total: 0 }
  byProvider.set(m.provider_id, { count: cur.count + 1, total: cur.total + Number(m.total_ht) })
}

for (const [providerId, agg] of byProvider) {
  const { data: p } = await db.from('inv_providers')
    .select('legal_name, user:inv_users!inv_providers_user_id_fkey(email, full_name)')
    .eq('id', providerId).maybeSingle()
  const u = p?.user
  if (!u?.email) { console.log(`  ✗ ${p?.legal_name} — pas d'email`); continue }
  const html = wrap('Vos prestations validées attendent une facture',
    `<p>Bonjour ${u.full_name},</p><p>${agg.count} prestation${agg.count > 1 ? 's' : ''} validée${agg.count > 1 ? 's' : ''}
     (<strong>${euro(agg.total)} HT</strong>) n’${agg.count > 1 ? 'ont' : 'a'} pas encore été facturée${agg.count > 1 ? 's' : ''}.</p>`,
    { label: 'Générer ma facture', href: `${APP_URL}/factures/nouvelle` })
  const r = await send({ email: u.email, name: u.full_name },
    'Vos prestations validées attendent une facture', html,
    { template: 'invoice_pending_reminder', entityType: 'provider', entityId: providerId, providerId })
  console.log(`  ${r.status === 'sent' ? '✓' : '·'} ${(p?.legal_name ?? '').padEnd(24)} ${agg.count} presta · ${euro(agg.total)} ${r.error ?? ''}`)
}
if (!byProvider.size) console.log('  aucune')

console.log(APPLY ? '\n✓ Relances traitées.\n' : '\n(aperçu — relancez avec --apply pour envoyer)\n')
