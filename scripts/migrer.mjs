#!/usr/bin/env node
/**
 * Joue un ou plusieurs fichiers SQL sur le projet Supabase.
 *
 *   node scripts/migrer.mjs supabase/17a_enums.sql supabase/17b_cahier_des_charges.sql
 *
 * Chaque fichier part en une requête : un fichier qui échoue arrête tout.
 */
import { readFileSync, existsSync } from 'node:fs'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!ref || !token) {
  console.error('\n✗ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_ACCESS_TOKEN manquant.\n')
  process.exit(1)
}

for (const fichier of process.argv.slice(2)) {
  process.stdout.write(`  ${fichier.padEnd(44)}`)
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: readFileSync(fichier, 'utf8') }),
  })
  if (!res.ok) {
    console.log('✗')
    console.error(await res.text())
    process.exit(1)
  }
  console.log('✓')
}
