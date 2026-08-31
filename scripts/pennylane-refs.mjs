#!/usr/bin/env node
/**
 * Raccorde les références Pennylane :
 *   - id_pennylane manquant sur une catégorie de mission  → cherché par libellé
 *   - pennylane_supplier_id manquant sur un prestataire   → cherché par nom
 *
 *   node --experimental-websocket scripts/pennylane-refs.mjs           aperçu
 *   node --experimental-websocket scripts/pennylane-refs.mjs --apply   applique
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const BASE = process.env.PENNYLANE_API_URL ?? 'https://app.pennylane.com/api/external/v2'
const TOKEN = process.env.PENNYLANE_API_TOKEN
if (!TOKEN) { console.error('PENNYLANE_API_TOKEN manquant.'); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Pagine un endpoint Pennylane jusqu'au bout. */
async function fetchAll(path) {
  const out = []
  let cursor = null
  for (let page = 0; page < 50; page++) {
    const url = `${BASE}${path}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
    const body = await res.json()
    out.push(...(body.items ?? []))
    if (!body.has_more || !body.next_cursor) break
    cursor = body.next_cursor
  }
  return out
}

/** Comparaison tolérante : casse, accents, ponctuation et espaces ignorés. */
const norm = (s) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// ---------- catégories ----------
console.log('\nCatégories de missions')
const plCategories = await fetchAll('/categories')
const { data: localCategories } = await db
  .from('inv_categories')
  .select('id, name, pennylane_label, pennylane_category_id')
  .order('sort_order')

for (const c of localCategories ?? []) {
  if (c.pennylane_category_id) {
    const known = plCategories.find((p) => p.id === Number(c.pennylane_category_id))
    console.log(`  ✓ ${c.name.padEnd(52)} ${c.pennylane_category_id} ${known ? `« ${known.label.trim()} »` : '⚠ introuvable dans Pennylane'}`)
    continue
  }
  const target = norm(c.pennylane_label || c.name)
  const match = plCategories.find((p) => norm(p.label) === target)
  if (match) {
    console.log(`  → ${c.name.padEnd(52)} ${match.id} « ${match.label.trim()} »`)
    if (APPLY) await db.from('inv_categories').update({ pennylane_category_id: match.id }).eq('id', c.id)
  } else {
    console.log(`  ✗ ${c.name.padEnd(52)} aucune catégorie Pennylane correspondante`)
  }
}

// ---------- fournisseurs ----------
console.log('\nPrestataires')
const plSuppliers = await fetchAll('/suppliers')
const { data: providers } = await db
  .from('inv_providers')
  .select('id, legal_name, siret, pennylane_supplier_id')
  .order('legal_name')

for (const p of providers ?? []) {
  if (p.pennylane_supplier_id) {
    console.log(`  ✓ ${p.legal_name.padEnd(34)} ${p.pennylane_supplier_id}`)
    continue
  }
  // Le SIRET est plus fiable que le nom : on le tente en premier.
  const siren = p.siret?.slice(0, 9)
  const match =
    (siren && plSuppliers.find((s) => s.reg_no?.replace(/\D/g, '').startsWith(siren))) ||
    plSuppliers.find((s) => norm(s.name) === norm(p.legal_name))

  if (match) {
    console.log(`  → ${p.legal_name.padEnd(34)} ${match.id} « ${match.name} »`)
    if (APPLY) await db.from('inv_providers').update({ pennylane_supplier_id: match.id }).eq('id', p.id)
  } else {
    console.log(`  ✗ ${p.legal_name.padEnd(34)} aucun fournisseur Pennylane correspondant`)
  }
}

console.log(
  APPLY
    ? '\n✓ Références enregistrées.\n'
    : `\n(aperçu — ${plCategories.length} catégories et ${plSuppliers.length} fournisseurs lus)`
      + '\nRelancez avec --apply pour enregistrer.\n'
)
