#!/usr/bin/env node
/**
 * Ouvre à la facturation les échéances de coaching arrivées à terme.
 *
 *   node --experimental-websocket scripts/echeances.mjs           aperçu
 *   node --experimental-websocket scripts/echeances.mjs --apply   ouvre
 *
 * Chaque échéance échue devient une prestation déjà validée : elle découle
 * d'un contrat signé, il n'y a rien à valider à nouveau. Le coach n'a plus
 * qu'à la facturer.
 *
 * Une échéance jamais facturée reste ouverte indéfiniment : si celle d'août
 * n'a pas été facturée, elle s'ajoute simplement à celle d'octobre. C'est
 * ce qui garantit qu'un coach oublié finit toujours par être payé.
 *
 * À programmer une fois par jour, comme les relances.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const AUJOURD_HUI = process.env.DATE_REFERENCE ?? new Date().toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const PROGRAMME = { pass_las_lsps: 'PASS / LAS / LSPS', paes: 'PAES', terminale_sante: 'Terminale Santé' }
const euro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  .format(Number(v)).replace(/ /g, ' ')

const { data: dues, error } = await db
  .from('inv_contract_instalments')
  .select(`id, label, due_date, amount_ht,
           contract:inv_coaching_contracts(
             id, provider_id, manager_id, category_id, classes_label, program, academic_year, status, headcount,
             provider:inv_providers(legal_name))`)
  .lte('due_date', AUJOURD_HUI)
  .is('mission_id', null)
  .order('due_date')

if (error) { console.error('✗', error.message); process.exit(1) }

const ouvrables = dues.filter((d) => d.contract?.status === 'active')
console.log(`\nÉchéances arrivées à terme au ${AUJOURD_HUI} : ${ouvrables.length}\n`)

let ouvertes = 0
for (const e of ouvrables) {
  const c = e.contract
  const nom = c.provider?.legal_name ?? '—'

  if (!APPLY) {
    console.log(`  · ${e.due_date}  ${euro(e.amount_ht).padStart(11)}  ${nom.padEnd(24)} ${e.label}`)
    continue
  }

  const { data: mission, error: mErr } = await db.from('inv_missions').insert({
    provider_id: c.provider_id,
    manager_id: c.manager_id,
    category_id: c.category_id,
    // Ce libellé part tel quel sur la facture PDF puis dans Pennylane :
    // il ne doit contenir ni nom de classe interne, ni autre marque.
    detail: `Coaching pédagogique ${PROGRAMME[c.program] ?? c.program} — ${c.academic_year}`
      + ` — ${e.label.toLowerCase()} — ${c.headcount} étudiants suivis`,
    start_date: e.due_date,
    end_date: e.due_date,
    pricing_type: 'forfait_mission',
    quantity: 1,
    unit_amount_ht: e.amount_ht,
    total_ht: e.amount_ht,
    // Le contrat signé tient lieu d'accord du manager, mais la validation
    // finale reste à l'administration : c'est elle qui décide quand une
    // échéance devient facturable, et son accord déclenche l'email au
    // prestataire.
    status: 'manager_approved',
    origin: 'contract',
    submitted_at: new Date().toISOString(),
    manager_approved_at: new Date().toISOString(),
    manager_approved_by: c.manager_id,
  }).select('id').single()

  if (mErr) { console.error(`  ✗ ${nom} — ${e.label} : ${mErr.message}`); continue }

  const { error: lErr } = await db.from('inv_contract_instalments')
    .update({ mission_id: mission.id }).eq('id', e.id)
  if (lErr) { console.error(`  ⚠ lien échéance : ${lErr.message}`); continue }

  ouvertes++
  console.log(`  ✓ ${e.due_date}  ${euro(e.amount_ht).padStart(11)}  ${nom.padEnd(24)} ${e.label}`)
}

const total = ouvrables.reduce((s, e) => s + Number(e.amount_ht), 0)
console.log(`\n  ${APPLY ? `${ouvertes} échéance(s) ouverte(s)` : `${ouvrables.length} à ouvrir`} · ${euro(total)}`)
console.log(APPLY ? '\n✓ Les coachs peuvent facturer.\n' : '\n(aperçu — relancez avec --apply)\n')
