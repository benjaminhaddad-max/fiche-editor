#!/usr/bin/env node
/**
 * Installe Diploma Invoice sur le projet Supabase :
 *   1. joue les 4 fichiers SQL (schema, RLS, seed, fonction facture)
 *   2. cree le compte administrateur
 *
 * Necessite dans .env.local :
 *   SUPABASE_ACCESS_TOKEN   (token personnel Supabase, pour le DDL)
 *   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 *
 * Usage : node scripts/setup.mjs "email@admin.fr" "Nom Prénom" "MotDePasse"
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ---------- chargement de .env.local ----------
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const PROJECT_REF = SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]

const [, , adminEmail, adminName, adminPassword] = process.argv

function fail(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

if (!SUPABASE_URL || !SERVICE_KEY) fail('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local')
if (!PROJECT_REF) fail(`Impossible de déduire la référence du projet depuis ${SUPABASE_URL}`)
if (!ACCESS_TOKEN) {
  fail(
    'SUPABASE_ACCESS_TOKEN manquant.\n' +
      '  → https://supabase.com/dashboard/account/tokens → "Generate new token"\n' +
      '  → puis ajoutez la ligne SUPABASE_ACCESS_TOKEN=sbp_... dans .env.local'
  )
}
if (!adminEmail || !adminName || !adminPassword) {
  fail('Usage : node scripts/setup.mjs "email@admin.fr" "Nom Prénom" "MotDePasse"')
}

// ---------- 1. DDL via l'API Management ----------
async function runSql(label, file) {
  const query = readFileSync(file, 'utf8')
  process.stdout.write(`  ${label.padEnd(34)}`)

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    console.log('✗')
    fail(`${file} :\n${await res.text()}`)
  }
  console.log('✓')
}

console.log(`\nProjet Supabase : ${PROJECT_REF}\n`)
console.log('SQL')
await runSql('01 schéma', 'supabase/01_schema.sql')
await runSql('02 RLS et numérotation', 'supabase/02_rls.sql')
await runSql('03 catégories et bucket PDF', 'supabase/03_seed.sql')
await runSql('04 création de facture', 'supabase/04_invoice_function.sql')

// ---------- 2. Compte administrateur ----------
console.log('\nAdministrateur')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// L'utilisateur Auth existe peut-etre deja (re-execution du script).
let authId
const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email: adminEmail,
  password: adminPassword,
  email_confirm: true,
})

if (created?.user) {
  authId = created.user.id
  console.log(`  compte Auth créé                  ✓`)
} else if (createError?.message?.match(/already|registered|exists/i)) {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  authId = list?.users.find((u) => u.email === adminEmail)?.id
  if (!authId) fail(`Compte ${adminEmail} déjà présent mais introuvable.`)
  console.log(`  compte Auth existant réutilisé    ✓`)
} else {
  fail(`Création du compte Auth : ${createError?.message}`)
}

const { error: upsertError } = await supabase
  .from('inv_users')
  .upsert(
    { auth_id: authId, email: adminEmail, full_name: adminName, role: 'admin' },
    { onConflict: 'auth_id' }
  )

if (upsertError) fail(`Profil administrateur : ${upsertError.message}`)
console.log(`  profil admin                      ✓`)

// ---------- 3. Verification ----------
const { count } = await supabase
  .from('inv_categories')
  .select('id', { count: 'exact', head: true })

console.log(`\n✓ Installation terminée — ${count} catégories de missions en place.`)
console.log(`  Connectez-vous avec ${adminEmail}\n`)
