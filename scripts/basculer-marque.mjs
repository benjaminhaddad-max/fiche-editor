#!/usr/bin/env node
/**
 * Rattacher quelqu'un à une autre école.
 *
 *   node --experimental-websocket scripts/basculer-marque.mjs --email a@b.fr --vers linova
 *   ... --role admin        change aussi son rôle
 *   ... --apply             applique (sans ce drapeau : aperçu seul)
 *
 * Attention : un compte ne peut se connecter qu'au déploiement de sa
 * marque. Basculer quelqu'un le coupe donc immédiatement de l'ancien site.
 * À ne faire qu'une fois le nouveau site en ligne, sans quoi la personne se
 * retrouve sans rien — c'est le cas de Meryeme, qui utilise aujourd'hui
 * Diploma Invoice.
 *
 * Sa fiche de facturation suit le compte : une fiche restée sur l'ancienne
 * marque serait invisible des deux côtés.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const lire = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : null)
const EMAIL = lire('--email')
const VERS = lire('--vers')
const ROLE = lire('--role')
const APPLY = args.includes('--apply')

if (!EMAIL || !['diploma', 'linova', 'all'].includes(VERS)) {
  console.error('\n✗ Usage : --email a@b.fr --vers diploma|linova|all [--role admin] [--apply]\n')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: u } = await db
  .from('inv_users')
  .select('id, email, full_name, role, brand, is_active')
  .eq('email', EMAIL)
  .maybeSingle()
if (!u) { console.error(`\n✗ Aucun compte pour ${EMAIL}\n`); process.exit(1) }

const { data: fiche } = await db
  .from('inv_providers')
  .select('id, legal_name, brand')
  .eq('user_id', u.id)
  .maybeSingle()

// Ce qu'on laisse derrière : les lignes déjà écrites gardent leur marque,
// sans quoi on déplacerait des prestations d'une école à l'autre.
const compte = async (table, colonne) =>
  (await db.from(table).select('id', { count: 'exact', head: true }).eq(colonne, fiche?.id ?? '-')).count ?? 0
const missions = fiche ? await compte('inv_missions', 'provider_id') : 0
const factures = fiche ? await compte('inv_invoices', 'provider_id') : 0

console.log(`\n${u.full_name} <${u.email}>`)
console.log(`  rôle    ${u.role}${ROLE && ROLE !== u.role ? ` → ${ROLE}` : ''}`)
console.log(`  marque  ${u.brand} → ${VERS}`)
console.log(`  fiche   ${fiche ? `${fiche.legal_name} (${fiche.brand} → ${VERS})` : 'aucune'}`)
console.log(`  passé   ${missions} prestation(s), ${factures} facture(s) — elles gardent leur marque`)
if (u.brand !== VERS) {
  console.log(`\n  ⚠ Elle perdra l'accès au site « ${u.brand} » dès la bascule.`)
}

if (!APPLY) { console.log('\nAperçu seul. Ajoutez --apply pour appliquer.\n'); process.exit(0) }

const maj = { brand: VERS, ...(ROLE ? { role: ROLE } : {}) }
const { error } = await db.from('inv_users').update(maj).eq('id', u.id)
if (error) { console.error('✗', error.message); process.exit(1) }
if (fiche) await db.from('inv_providers').update({ brand: VERS }).eq('id', fiche.id)

console.log('\n✓ Bascule faite.\n')
