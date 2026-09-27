#!/usr/bin/env node
/**
 * À qui nos messages n'arrivent-ils pas ?
 *
 *   node --experimental-websocket scripts/adresses.mjs           aperçu
 *   node --experimental-websocket scripts/adresses.mjs --apply    marque les comptes
 *
 * Brevo répond « accepté » à un envoi, puis le bloque à sa propre porte si
 * l'adresse a déjà rebondi une fois : le message ne part jamais et notre
 * journal garde « envoyé ». On demande donc à Brevo ce que sont devenus les
 * envois, et on marque les adresses qui n'ont jamais rien reçu.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const KEY = process.env.BREVO_API_KEY
if (!KEY) { console.error('\n✗ BREVO_API_KEY manquante.\n'); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function raison(brut, bloques) {
  const t = (brut ?? '').replace(/\s+/g, ' ')
  if (/5\.1\.1|NoSuchUser|does not exist|unknown recipient|no such/i.test(t)) return 'boîte inexistante'
  if (/mailbox full|quota|over.?quota/i.test(t)) return 'boîte pleine'
  if (/spam|blacklist|reputation|policy/i.test(t)) return 'refusée comme indésirable'
  if (/unsubscrib|désinscri/i.test(t)) return 'désinscrit de nos envois'
  return t ? t.slice(0, 160) : `bloquée par Brevo (${bloques} envoi${bloques > 1 ? 's' : ''}) sans livraison`
}

const { data: users } = await db
  .from('inv_users')
  .select('id, email, full_name, role, email_unreachable_at')
  .eq('is_active', true)
  .order('full_name')

const casses = []
const retablies = []
for (const u of users ?? []) {
  const r = await fetch(
    `https://api.brevo.com/v3/smtp/statistics/events?email=${encodeURIComponent(u.email)}&limit=100`,
    { headers: { 'api-key': KEY } }
  )
  if (!r.ok) { console.error(`  ? ${u.email} — Brevo ${r.status}`); continue }
  const ev = (await r.json()).events ?? []
  const livres = ev.filter((e) => e.event === 'delivered').length
  const bloques = ev.filter((e) => e.event === 'blocked').length
  const rebond = ev.find((e) => e.event === 'hardBounces' || e.event === 'softBounces')

  if (bloques > 0 && livres === 0) {
    const pourquoi = raison(rebond?.reason, bloques)
    casses.push({ ...u, bloques, pourquoi })
    if (APPLY) {
      await db.from('inv_users')
        .update({ email_unreachable_at: new Date().toISOString(), email_unreachable_reason: pourquoi })
        .eq('id', u.id)
    }
  } else if (u.email_unreachable_at) {
    retablies.push(u.email)
    if (APPLY) {
      await db.from('inv_users')
        .update({ email_unreachable_at: null, email_unreachable_reason: null })
        .eq('id', u.id)
    }
  }
}

console.log(`\n${users.length} comptes actifs vérifiés auprès de Brevo.\n`)
if (!casses.length) console.log('  Tout le monde reçoit nos messages.')
for (const c of casses.sort((a, b) => b.bloques - a.bloques)) {
  console.log(`  ✗ ${c.full_name} <${c.email}> — ${c.pourquoi}`)
  console.log(`      ${c.bloques} message(s) bloqué(s), aucun livré — ${c.role}`)
}
for (const e of retablies) console.log(`  ✓ ${e} — reçoit à nouveau, constat levé`)
console.log(APPLY ? '\nComptes marqués.\n' : '\nAperçu seul. Ajoutez --apply pour marquer les comptes.\n')
