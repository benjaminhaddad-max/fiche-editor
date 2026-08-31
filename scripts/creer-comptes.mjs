#!/usr/bin/env node
/**
 * Création de comptes en lot depuis un fichier texte.
 *
 *   Managers      : Nom Prénom ; email
 *   Prestataires  : Nom Prénom ; email ; Raison sociale [; Manager par défaut]
 *
 *   node --experimental-websocket scripts/creer-comptes.mjs <fichier> <role> [--apply]
 *
 * Sans --apply, rien n'est écrit : on affiche seulement ce qui serait créé.
 * Le script est réexécutable : un compte déjà présent est ignoré, pas dupliqué.
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const [, , file, role, ...rest] = process.argv
const APPLY = rest.includes('--apply')

if (!file || !['manager', 'prestataire', 'admin'].includes(role)) {
  console.error('Usage : node scripts/creer-comptes.mjs <fichier> <manager|prestataire|admin> [--apply]')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Mot de passe provisoire lisible, dictable au téléphone sans ambiguïté. */
function tempPassword(fullName) {
  const first = fullName.trim().split(/\s+/)[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '')
  const digits = String(randomBytes(2).readUInt16BE(0) % 9000 + 1000)
  return `Diploma-${first}-${digits}`
}

const lines = readFileSync(file, 'utf8')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 })
const { data: managers } = await db.from('inv_users').select('id, full_name').eq('role', 'manager')

const results = []
for (const line of lines) {
  const [name, email, legalName, managerName] = line.split(/\s*[;:]\s*/).map((x) => x?.trim())
  if (!name || !email) { console.error(`  ✗ ligne illisible : ${line}`); continue }

  const cleanName = name.replace(/\s+/g, ' ')
  const cleanEmail = email.toLowerCase()

  if (existing.users.some((u) => u.email === cleanEmail)) {
    results.push({ name: cleanName, email: cleanEmail, password: '(compte déjà existant)', skipped: true })
    continue
  }

  const password = tempPassword(cleanName)
  if (!APPLY) { results.push({ name: cleanName, email: cleanEmail, password }); continue }

  const { data: created, error } = await db.auth.admin.createUser({
    email: cleanEmail, password, email_confirm: true,
  })
  if (error) { console.error(`  ✗ ${cleanEmail} : ${error.message}`); continue }

  const { data: row, error: rowErr } = await db.from('inv_users')
    .insert({ auth_id: created.user.id, email: cleanEmail, full_name: cleanName, role })
    .select('id').single()
  if (rowErr) {
    await db.auth.admin.deleteUser(created.user.id)
    console.error(`  ✗ ${cleanEmail} : ${rowErr.message}`)
    continue
  }

  if (role === 'prestataire') {
    const manager = managerName
      ? managers?.find((m) => m.full_name.toLowerCase().includes(managerName.toLowerCase()))
      : null
    const { error: pErr } = await db.from('inv_providers').insert({
      user_id: row.id,
      legal_name: legalName || cleanName,
      default_manager_id: manager?.id ?? null,
    })
    if (pErr) console.error(`  ⚠ ${cleanEmail} : fiche de facturation — ${pErr.message}`)
  }

  results.push({ name: cleanName, email: cleanEmail, password })
}

console.log(`\n${APPLY ? 'Comptes créés' : 'Aperçu'} — rôle « ${role} »\n`)
const w = Math.max(...results.map((r) => r.name.length), 4)
const e = Math.max(...results.map((r) => r.email.length), 5)
console.log(`  ${'NOM'.padEnd(w)}  ${'EMAIL'.padEnd(e)}  MOT DE PASSE PROVISOIRE`)
console.log(`  ${'-'.repeat(w)}  ${'-'.repeat(e)}  -----------------------`)
for (const r of results) console.log(`  ${r.name.padEnd(w)}  ${r.email.padEnd(e)}  ${r.password}`)
console.log(APPLY
  ? '\n✓ Transmettez ces mots de passe. Chacun le change dans « Mon compte ».\n'
  : '\n(aperçu — relancez avec --apply pour créer)\n')
