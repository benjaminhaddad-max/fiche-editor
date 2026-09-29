#!/usr/bin/env node
/**
 * Prévenir ceux qui n'ont rien déclaré alors que le mois est en vérification.
 *
 *   node --experimental-websocket scripts/relance-tardive.mjs                 aperçu
 *   node --experimental-websocket scripts/relance-tardive.mjs --apply         envoie
 *   ... --email a@b.fr,c@d.fr                                                 cible
 *   ... --mois 2026-09                                                        autre mois
 *
 * Pendant les trois derniers jours du mois, l'écran de déclaration disait
 * « vous ne pouvez plus y ajouter de prestation, demandez à votre manager ».
 * C'était faux — la case « déclaration tardive » ouvre encore la porte —
 * mais c'est là que les gens renonçaient. Ce message le leur dit.
 *
 * On n'écrit qu'aux comptes actifs, avec fiche complète, qui n'ont aucune
 * prestation sur le mois : relancer quelqu'un qui a déjà tout saisi, c'est
 * lui apprendre à ne plus lire nos messages.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const lire = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const APPLY = args.includes('--apply')
const EMAILS = lire('--email')?.split(',').map((x) => x.trim()).filter(Boolean) ?? null
const MOIS = lire('--mois') ?? new Date().toISOString().slice(0, 7)
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'

if (!/^https:\/\//.test(APP) || /localhost|127\.0\.0\.1|\.local/.test(APP)) {
  console.error(`\n✗ NEXT_PUBLIC_APP_URL vaut « ${APP} » — inutilisable dans un email.\n`)
  process.exit(1)
}

const MARQUE = process.env.NEXT_PUBLIC_BRAND === 'linova' ? 'linova' : 'diploma'
const ECOLES = {
  diploma: { produit: 'Diploma Invoice', societe: 'Diploma Santé' },
  linova: { produit: 'Linova Invoice', societe: 'Linova Formation' },
}
const PRODUIT = ECOLES[MARQUE].produit
const SOCIETE = process.env.NEXT_PUBLIC_COMPANY_NAME ?? ECOLES[MARQUE].societe

const [an, mo] = MOIS.split('-').map(Number)
const dernier = new Date(Date.UTC(an, mo, 0))
const debut = `${MOIS}-01`
const fin = dernier.toISOString().slice(0, 10)
const LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(Date.UTC(an, mo - 1, 15)))
const LONG = (iso) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`))

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const enveloppe = (titre, corps) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f4ee;">
<table role="presentation" width="100%" style="background:#f7f4ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5ddc8;
 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:24px 28px 0;"><p style="margin:0;font-size:13px;font-weight:600;color:#0e1e35;letter-spacing:.3px;">${PRODUIT.toUpperCase()}</p>
<h1 style="margin:8px 0 0;font-size:19px;line-height:1.35;color:#0e1e35;">${titre}</h1></td></tr>
<tr><td style="padding:16px 28px 4px;font-size:14px;line-height:1.65;color:#3b4c63;">${corps}</td></tr>
<tr><td style="padding:12px 28px 24px;"><a href="${APP}/missions/new" style="display:inline-block;background:#0e1e35;
 color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px;">Déclarer mes prestations</a></td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e5ddc8;font-size:12px;color:#a89e8a;">
${SOCIETE} — message automatique, merci de ne pas y répondre directement.</td></tr>
</table></td></tr></table></body></html>`

const SUJET = `Vos prestations de ${LABEL} : c’est encore possible jusqu’au ${LONG(fin)}`
const corpsPour = (nom) =>
  `<p style="margin:0 0 12px;">Bonjour ${nom},</p>
   <p style="margin:0 0 12px;">Si vous avez essayé de déclarer vos prestations de ${LABEL} ces
      derniers jours, l’écran vous a répondu que le mois était fermé et qu’il fallait passer par
      votre manager. <strong>C’était inexact</strong>, et nous l’avons corrigé.</p>
   <p style="margin:0 0 12px;">Vous pouvez les saisir vous-même <strong>jusqu’au ${LONG(fin)}</strong>.
      Sous la date de chaque ligne, cochez simplement « Déclaration tardive : le mois est en
      vérification ».</p>
   <p style="margin:0;">Désolé pour le détour.</p>`

// ---- Qui n'a rien déclaré sur le mois.
const { data: fiches } = await db
  .from('inv_providers')
  .select('id, legal_name, onboarding_complete, user:inv_users!inv_providers_user_id_fkey(id, email, full_name, is_active, email_unreachable_at)')
  .eq('brand', MARQUE)
// « Rien déclaré » se juge sur trois choses, pas une : la date du travail,
// le mois rattrapé, et la date de saisie. Mhaude avait tout saisi en
// septembre pour du travail de juillet — sur le seul critère de la date du
// travail, on l'aurait relancée pour un mois qu'elle avait déjà fait.
const { data: ms } = await db
  .from('inv_missions')
  .select('provider_id, start_date, regul_period, created_at')
const declare = new Set(
  (ms ?? [])
    .filter(
      (m) =>
        (m.start_date >= debut && m.start_date <= fin) ||
        m.regul_period === MOIS ||
        String(m.created_at).slice(0, 7) === MOIS
    )
    .map((m) => m.provider_id)
)

let cibles = (fiches ?? []).filter(
  (f) => f.user?.is_active && f.onboarding_complete && !f.user.email_unreachable_at && !declare.has(f.id)
)
if (EMAILS) cibles = cibles.filter((f) => EMAILS.includes(f.user.email))

console.log(`\n${APPLY ? 'Envoi' : 'Aperçu'} — ${LABEL}, ${cibles.length} destinataire(s)\n`)

let ok = 0
for (const f of cibles) {
  const u = f.user
  if (!APPLY) { console.log(`  · ${u.full_name.padEnd(28)} ${u.email}`); continue }

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME, email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: u.email, name: u.full_name }],
      subject: SUJET,
      htmlContent: enveloppe(`Déclarer ${LABEL}, c’est encore possible`, corpsPour(u.full_name)),
    }),
  })
  const body = await r.text()
  let messageId = null
  try { messageId = JSON.parse(body).messageId ?? null } catch {}
  await db.from('inv_email_log').insert({
    brevo_message_id: messageId,
    to_email: u.email, to_name: u.full_name,
    template: 'declaration_late', subject: SUJET,
    entity_type: 'user', entity_id: u.id,
    status: r.ok ? 'sent' : 'error', error: r.ok ? null : body.slice(0, 200),
  })
  if (r.ok) ok++
  console.log(`  ${r.ok ? '✓' : '✗'} ${u.full_name.padEnd(28)} ${u.email}${r.ok ? '' : ' — ' + body.slice(0, 120)}`)
  await new Promise((res) => setTimeout(res, 400))
}

console.log(APPLY ? `\n✓ ${ok}/${cibles.length} message(s) envoyé(s).\n` : '\n(aperçu — relancez avec --apply)\n')
