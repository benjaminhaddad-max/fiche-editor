#!/usr/bin/env node
/**
 * Qui est bloqué, et sur quoi.
 *
 *   npm run blocages
 *
 * Répond en une commande aux trois questions qui reviennent : est-ce que la
 * personne a un lien utilisable, est-ce qu'elle est entrée, est-ce qu'elle a
 * pu enregistrer ses informations. Les échecs d'enregistrement sont lus dans
 * le journal : depuis le 9 septembre 2026, une tentative qui échoue y laisse
 * une trace, on n'a plus à attendre un message WhatsApp pour l'apprendre.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const [{ data: users }, { data: { users: auth } }, { data: provs }, { data: invits }, { data: echecs }] =
  await Promise.all([
    db.from('inv_users').select('id, email, full_name, role').eq('is_active', true),
    db.auth.admin.listUsers({ perPage: 500 }),
    db.from('inv_providers').select('user_id, created_at, updated_at, onboarding_complete'),
    db.from('inv_invitations').select('user_id, used_at, expires_at, exchanges, created_at')
      .order('created_at', { ascending: false }),
    db.from('inv_audit_log').select('entity_id, action, payload, created_at')
      .like('action', 'profile_save_%').order('created_at', { ascending: false }),
  ])

const A = new Map(auth.map((u) => [u.email, u]))
const P = new Map(provs.map((p) => [p.user_id, p]))
const I = new Map(); for (const i of invits) if (!I.has(i.user_id)) I.set(i.user_id, i)

const now = new Date()
const bloques = []

for (const u of users.sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name))) {
  const a = A.get(u.email)
  const i = I.get(u.id)
  const p = P.get(u.id)

  const lien = !i ? 'aucun lien'
    : i.used_at ? null
    : new Date(i.expires_at) < now ? 'lien expiré'
    : i.exchanges === 0 ? 'lien jamais ouvert'
    : null

  // Une connexion n'actualise last_sign_in_at que par mot de passe : une
  // session reprise ne la bouge pas. Elle dit « jamais entré », pas
  // « inactif depuis ».
  const jamaisEntre = !a?.last_sign_in_at
  const profilVide = u.role === 'prestataire' && p && p.updated_at === p.created_at

  const motifs = []
  if (lien) motifs.push(lien)
  if (jamaisEntre) motifs.push('jamais connecté')
  if (profilVide) motifs.push('informations jamais enregistrées')
  if (motifs.length) bloques.push({ u, motifs, a })
}

console.log(`\n${bloques.length} personne(s) bloquée(s) sur ${users.length}\n`)
for (const b of bloques) {
  console.log(`  ${b.u.role.padEnd(11)} ${b.u.full_name.padEnd(24)} ${b.u.email}`)
  console.log(`  ${''.padEnd(11)} → ${b.motifs.join(', ')}`)
  console.log(`  ${''.padEnd(11)}   dernière connexion par mot de passe : ${b.a?.last_sign_in_at?.slice(0, 16) ?? 'jamais'}`)
}

if (echecs.length) {
  console.log(`\n${echecs.length} échec(s) d'enregistrement de profil enregistré(s) :`)
  for (const e of echecs.slice(0, 20)) {
    console.log(`  ${e.created_at.slice(0, 16)}  ${e.action}  ${JSON.stringify(e.payload).slice(0, 160)}`)
  }
} else {
  console.log('\nAucun échec d’enregistrement de profil dans le journal.')
}
console.log()
