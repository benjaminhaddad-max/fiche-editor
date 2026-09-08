#!/usr/bin/env node
/**
 * Envoie une invitation à tous les comptes actifs qui ne se sont jamais
 * connectés (ou à ceux qu'on lui désigne).
 *
 *   node --experimental-websocket scripts/inviter.mjs                aperçu
 *   node --experimental-websocket scripts/inviter.mjs --apply        envoie
 *   ... --role prestataire|manager                                   restreint
 *   ... --email a@b.fr,c@d.fr                                        cible
 *
 * Reprend exactement le circuit de l'application : jeton maison valable
 * 30 jours, texte adapté au rôle, journalisation dans inv_email_log.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ROLE = args.includes('--role') ? args[args.indexOf('--role') + 1] : null
const EMAILS = args.includes('--email') ? args[args.indexOf('--email') + 1].split(',') : null
// Un renvoi porte un objet daté : à objet identique, les messageries
// regroupent tout dans un fil et c'est le message le plus ancien — donc le
// lien mort — que la personne rouvre.
const RENVOI = args.includes('--renvoi')
const JOURS = Number(process.env.INVITATION_DAYS ?? 30)
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'

// Garde-fou : un .env local mal réglé a déjà envoyé 26 invitations pointant
// sur localhost. Une adresse non publique ne doit jamais partir par mail.
if (!/^https:\/\//.test(APP) || /localhost|127\.0\.0\.1|\.local/.test(APP)) {
  console.error(`\n✗ NEXT_PUBLIC_APP_URL vaut « ${APP} » — inutilisable dans un email.`)
  console.error('  Corrigez .env.local avant d\'envoyer quoi que ce soit.\n')
  process.exit(1)
}
const SOCIETE = process.env.NEXT_PUBLIC_COMPANY_NAME ?? 'Diploma Santé'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const hash = (t) => createHash('sha256').update(t).digest('hex')

const enveloppe = (titre, corps, lien) => `<!doctype html><html lang="fr"><body style="margin:0;background:#f7f4ee;">
<table role="presentation" width="100%" style="background:#f7f4ee;padding:32px 12px;"><tr><td align="center">
<table role="presentation" style="max-width:560px;background:#fff;border-radius:12px;border:1px solid #e5ddc8;
 font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<tr><td style="padding:24px 28px 0;"><p style="margin:0;font-size:13px;font-weight:600;color:#0e1e35;letter-spacing:.3px;">DIPLOMA INVOICE</p>
<h1 style="margin:8px 0 0;font-size:19px;line-height:1.35;color:#0e1e35;">${titre}</h1></td></tr>
<tr><td style="padding:16px 28px 4px;font-size:14px;line-height:1.65;color:#3b4c63;">${corps}</td></tr>
<tr><td style="padding:12px 28px 24px;"><a href="${lien}" style="display:inline-block;background:#0e1e35;
 color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px;">${RENVOI ? 'Ouvrir mon espace' : 'Créer mon accès'}</a></td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e5ddc8;font-size:12px;color:#a89e8a;">
${SOCIETE} — message automatique, merci de ne pas y répondre directement.</td></tr>
</table></td></tr></table></body></html>`

const SUJET = RENVOI
  ? `Votre nouveau lien Diploma Invoice — ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date())}`
  : 'Créez votre accès à Diploma Invoice'

const AVERTISSEMENT = RENVOI
  ? `<p style="margin:0 0 12px;padding:10px 12px;background:#fdf7e6;border:1px solid #e5ddc8;
       border-radius:8px;font-size:13px;color:#6b5b2a;"><strong>Utilisez ce message-ci.</strong>
       Les liens des emails précédents ne fonctionnent plus.</p>`
  : ''

function corpsPour(role, nom) {
  const fin = `<p style="margin:0;color:#7d8c9e;font-size:13px;">Ce lien est personnel, ne fonctionne
     qu'une fois, et reste valable ${JOURS} jours.</p>`
  if (role === 'prestataire') {
    return {
      titre: RENVOI ? 'Voici votre nouveau lien d’accès' : 'Votre espace de facturation est prêt',
      corps: `<p style="margin:0 0 12px;">Bonjour ${nom},</p>${AVERTISSEMENT}
        <p style="margin:0 0 12px;">${SOCIETE} met à votre disposition un espace pour suivre vos
           prestations et transmettre vos factures.</p>
        <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.
           Vous compléterez ensuite vos informations de facturation — raison sociale, SIRET, adresse
           et IBAN — nécessaires pour être réglé.</p>${fin}`,
    }
  }
  const admin = role === 'admin'
  return {
    titre: RENVOI
      ? 'Voici votre nouveau lien d’accès'
      : admin ? 'Votre espace d’administration est prêt' : 'Votre espace de validation est prêt',
    corps: `<p style="margin:0 0 12px;">Bonjour ${nom},</p>${AVERTISSEMENT}
      <p style="margin:0 0 12px;">${SOCIETE} centralise désormais les prestations des intervenants
         et leur facturation sur une seule plateforme.</p>
      <p style="margin:0 0 12px;">${
        admin
          ? 'Vous y validez les prestations, suivez les factures reçues et pilotez les contrats.'
          : 'Vous y retrouvez les prestations des intervenants que vous avez sollicités, pour les valider ou les refuser avant facturation.'
      }</p>
      <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.</p>${fin}`,
  }
}

let q = db.from('inv_users').select('id, email, full_name, role').eq('is_active', true).order('role').order('full_name')
if (ROLE) q = q.eq('role', ROLE)
if (EMAILS) q = q.in('email', EMAILS)
// --bloques : uniquement celles dont le lien vivant n'a jamais été ouvert.
const { data: users, error } = await q
if (error) { console.error('✗', error.message); process.exit(1) }

console.log(`\n${APPLY ? 'Envoi' : 'Aperçu'} — ${users.length} destinataire(s), liens valables ${JOURS} jours\n`)

let ok = 0
for (const u of users) {
  if (!APPLY) { console.log(`  · ${u.role.padEnd(12)} ${u.email}`); continue }

  // Les invitations précédentes de cette personne sont annulées : un seul
  // lien vivant à la fois, sinon on ne sait plus lequel est le bon.
  await db.from('inv_invitations').update({ used_at: new Date().toISOString() })
    .eq('user_id', u.id).is('used_at', null)

  const token = randomBytes(32).toString('base64url')
  const { error: insErr } = await db.from('inv_invitations').insert({
    user_id: u.id, token_hash: hash(token),
    expires_at: new Date(Date.now() + JOURS * 864e5).toISOString(),
  })
  if (insErr) { console.log(`  ✗ ${u.email} : ${insErr.message}`); continue }

  const { titre, corps } = corpsPour(u.role, u.full_name)
  const html = enveloppe(titre, corps, `${APP}/bienvenue?invitation=${token}`)

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME, email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: u.email, name: u.full_name }],
      subject: SUJET,
      htmlContent: html,
    }),
  })
  const body = await r.text()
  const statut = r.ok ? 'sent' : 'error'
  let messageId = null
  try { messageId = JSON.parse(body).messageId ?? null } catch {}
  await db.from('inv_email_log').insert({
    brevo_message_id: messageId,
    to_email: u.email, to_name: u.full_name,
    template: u.role === 'prestataire' ? 'invitation' : 'invitation_staff',
    subject: SUJET, entity_type: 'user', entity_id: u.id,
    status: statut, error: r.ok ? null : body.slice(0, 200),
  })

  if (r.ok) ok++
  console.log(`  ${r.ok ? '✓' : '✗'} ${u.role.padEnd(12)} ${u.email}${r.ok ? '' : ' — ' + body.slice(0, 120)}`)
  await new Promise((res) => setTimeout(res, 400))   // on ménage le débit Brevo
}

console.log(APPLY
  ? `\n✓ ${ok}/${users.length} invitations envoyées, valables jusqu'au ${new Date(Date.now() + JOURS * 864e5).toISOString().slice(0, 10)}.\n`
  : '\n(aperçu — relancez avec --apply)\n')
