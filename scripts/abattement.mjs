#!/usr/bin/env node
/**
 * Régler l'abattement de contrat de quelqu'un, et recalculer ses lignes.
 *
 *   node --experimental-websocket scripts/abattement.mjs --nom "Danial" \
 *        --taux 20 --sauf coaching             aperçu
 *   ... --apply                                 applique
 *
 * L'abattement retire au salarié le pourcentage de charges que porte son
 * contrat. Un accord peut en exempter un métier précis — le coaching pour
 * Danial — sans exempter le reste.
 *
 * Les prestations déjà facturées ne bougent pas : on ne réécrit pas une
 * facture émise. Celles qui attendent encore sont recalculées, montant
 * convenu inchangé, montant versé corrigé.
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
const NOM = lire('--nom')
const TAUX = Number(lire('--taux') ?? NaN)
const SAUF = (lire('--sauf') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const APPLY = args.includes('--apply')

if (!NOM || Number.isNaN(TAUX)) {
  console.error('\n✗ Usage : --nom "Danial" --taux 20 [--sauf coaching] [--apply]\n')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: fiche } = await db
  .from('inv_providers')
  .select('id, legal_name, employment_type, pay_abatement, abatement_exempt_poles')
  .ilike('legal_name', `%${NOM}%`)
  .maybeSingle()
if (!fiche) { console.error(`\n✗ Aucune fiche pour « ${NOM} »\n`); process.exit(1) }

console.log(`\n${fiche.legal_name} — ${fiche.employment_type}`)
console.log(`  abattement  ${fiche.pay_abatement} %  →  ${TAUX} %`)
console.log(`  exempté     ${(fiche.abatement_exempt_poles ?? []).join(', ') || '(rien)'}  →  ${SAUF.join(', ') || '(rien)'}\n`)

// Les lignes encore ouvertes : ni facturées, ni parties en paie.
const { data: lignes } = await db
  .from('inv_missions')
  .select('id, detail, start_date, status, quantity, unit_amount_ht, abatement_rate, total_ht, category:inv_categories(name, pole)')
  .eq('provider_id', fiche.id)
  .is('invoice_id', null)
  .is('payroll_batch_id', null)
  .order('start_date')

const arrondi = (x) => Math.round(x * 100) / 100
let ecart = 0
const aChanger = []
for (const m of lignes ?? []) {
  const pole = m.category?.pole
  const voulu = SAUF.includes(pole) ? 0 : TAUX
  const brut = Number(m.quantity) * Number(m.unit_amount_ht)
  const verse = arrondi(brut * (1 - voulu / 100))
  const avant = Number(m.total_ht)
  const bouge = Number(m.abatement_rate ?? 0) !== voulu || Math.abs(verse - avant) > 0.004
  const marque = bouge ? '→' : ' '
  console.log(
    `  ${marque} ${m.start_date}  ${String(pole ?? '?').padEnd(14)} ` +
    `${String(m.abatement_rate).padStart(3)}% → ${String(voulu).padStart(3)}%   ` +
    `${avant.toFixed(2).padStart(9)} → ${verse.toFixed(2).padStart(9)}   ${m.detail.slice(0, 42)}`
  )
  if (bouge) { aChanger.push({ id: m.id, voulu, verse }); ecart += verse - avant }
}

console.log(`\n  ${aChanger.length} ligne(s) à recalculer — écart ${ecart >= 0 ? '+' : ''}${arrondi(ecart).toFixed(2)} €`)

if (!APPLY) { console.log('\nAperçu seul. Ajoutez --apply pour appliquer.\n'); process.exit(0) }

await db.from('inv_providers')
  .update({ pay_abatement: TAUX, abatement_exempt_poles: SAUF })
  .eq('id', fiche.id)
for (const l of aChanger) {
  await db.from('inv_missions').update({ abatement_rate: l.voulu, total_ht: l.verse }).eq('id', l.id)
}
console.log('\n✓ Règle enregistrée et lignes recalculées.\n')
