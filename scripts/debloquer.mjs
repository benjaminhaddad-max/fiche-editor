#!/usr/bin/env node
/**
 * Rendre joignables les adresses que Brevo a mises sur sa liste noire.
 *
 *   node scripts/debloquer.mjs                état de chaque adresse marquée
 *   node scripts/debloquer.mjs --apply        les débloque chez Brevo
 *   ... --email a@b.fr,c@d.fr                 se limite à celles-ci
 *
 * Après un seul rebond, Brevo inscrit l'adresse sur sa liste et bloque tout
 * envoi suivant — même une fois la boîte réparée, et sans jamais réessayer.
 * Rien dans notre plateforme ne peut lever ce blocage : il faut le demander
 * à Brevo. On ne touche pas au constat en base ici ; c'est une livraison
 * réussie qui le lèvera, via scripts/adresses.mjs ou la tâche quotidienne.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const EMAILS = args.includes('--email') ? args[args.indexOf('--email') + 1].split(',') : null

const KEY = process.env.BREVO_API_KEY
if (!KEY) { console.error('\n✗ BREVO_API_KEY manquante.\n'); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Par défaut : tous les comptes que la plateforme sait injoignables.
let q = db.from('inv_users').select('email, full_name, email_unreachable_reason').eq('is_active', true)
q = EMAILS ? q.in('email', EMAILS) : q.not('email_unreachable_at', 'is', null)
const { data: gens, error } = await q.order('full_name')
if (error) { console.error('✗', error.message); process.exit(1) }
if (!gens?.length) { console.log('\nAucune adresse à débloquer.\n'); process.exit(0) }

console.log(`\n${APPLY ? 'Déblocage' : 'Aperçu'} — ${gens.length} adresse(s)\n`)

for (const g of gens) {
  const enc = encodeURIComponent(g.email)
  const ev = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?email=${enc}&limit=100`, {
    headers: { 'api-key': KEY },
  }).then((r) => r.json())
  const c = {}
  for (const e of ev.events ?? []) c[e.event] = (c[e.event] ?? 0) + 1
  const etat = `${c.blocked ?? 0} bloqué(s), ${c.delivered ?? 0} livré(s)`

  if (!APPLY) {
    console.log(`  ${g.full_name} <${g.email}> — ${etat}`)
    continue
  }

  const res = await fetch(`https://api.brevo.com/v3/smtp/blockedContacts/${enc}`, {
    method: 'DELETE',
    headers: { 'api-key': KEY },
  })
  // 204 : retirée. 404 : elle n'y était pas — le blocage vient d'ailleurs,
  // et il faut alors le lever depuis l'interface Brevo.
  const detail = res.status === 204 ? 'débloquée' : `${res.status} ${(await res.text()).slice(0, 120)}`
  console.log(`  ${g.full_name} <${g.email}> — ${etat} → ${detail}`)
}

console.log(
  APPLY
    ? '\nRenvoyez-leur ensuite leur accès, puis relancez scripts/adresses.mjs --apply\npour lever le constat une fois la livraison confirmée.\n'
    : '\nAperçu seul. Ajoutez --apply pour débloquer.\n'
)
