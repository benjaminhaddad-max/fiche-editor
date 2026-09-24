#!/usr/bin/env node
/**
 * Les contrats de coaching des trois coachs passés en CDD vacataire.
 *
 *   node --experimental-websocket scripts/coachs-cdd.mjs           aperçu
 *   node --experimental-websocket scripts/coachs-cdd.mjs --apply   applique
 *
 * Même règle que les autres coachs PASS/LAS : 1 000 € par semestre pour
 * 30 élèves, au prorata de l'effectif réel, versé en trois fois par
 * semestre (30 %, 40 %, 30 %). Les effectifs sont relevés dans Diploma Lab,
 * classes et promotions confondues, élèves désactivés exclus.
 *
 * Le montant écrit est celui qu'on aurait versé à un auto-entrepreneur :
 * l'abattement du contrat s'applique au moment où l'échéance devient une
 * prestation, pas ici.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}
const APPLY = process.argv.includes('--apply')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ANNEE = '2026-2027'
const BASE = 1000
const BASE_EFFECTIF = 30
const r2 = (n) => Math.round(n * 100) / 100

const COACHS = [
  { nom: 'Danial Almgadmee', effectif: 42, classes: 'Classe partagée LAS / LSPS (36), Medibox Excellence (6)' },
  { nom: 'Mhaude Yapo', effectif: 37, classes: 'Classe 3 (30), Medibox Excellence (7)' },
  { nom: 'Alexandra Przybylowicz', effectif: 31, classes: 'Classe 3 (29), Medibox Excellence (2)' },
]

// Trois échéances par semestre, dans les mêmes proportions que les contrats
// existants : fin août, fin octobre, fin décembre, puis janvier, mars, mai.
const ECHEANCES = [
  { part: 0.3, date: '2026-08-31', label: 'Semestre 1 — échéance fin août 2026' },
  { part: 0.4, date: '2026-10-31', label: 'Semestre 1 — échéance fin octobre 2026' },
  { part: 0.3, date: '2026-12-31', label: 'Semestre 1 — échéance fin décembre 2026' },
  { part: 0.3, date: '2027-01-31', label: 'Semestre 2 — échéance fin janvier 2027' },
  { part: 0.4, date: '2027-03-31', label: 'Semestre 2 — échéance fin mars 2027' },
  { part: 0.3, date: '2027-05-31', label: 'Semestre 2 — échéance fin mai 2027' },
]

const { data: benjamin } = await db.from('inv_users').select('id').eq('role', 'admin').limit(1).single()
const { data: categorie } = await db
  .from('inv_categories').select('id').eq('pole', 'coaching').eq('is_active', true).order('sort_order').limit(1).single()

let crees = 0
const soucis = []

for (const c of COACHS) {
  const { data: fiche } = await db.from('inv_providers').select('id, pay_abatement').eq('legal_name', c.nom).maybeSingle()
  if (!fiche) { soucis.push(`${c.nom} : fiche introuvable`); continue }

  const { data: deja } = await db.from('inv_coaching_contracts')
    .select('id').eq('provider_id', fiche.id).eq('contract_type', 'coaching').eq('academic_year', ANNEE).maybeSingle()
  if (deja) { console.log(`= ${c.nom} — contrat déjà enregistré`); continue }

  const semestre = r2((BASE * c.effectif) / BASE_EFFECTIF)
  const total = r2(semestre * 2)
  const verse = r2(total * (1 - Number(fiche.pay_abatement ?? 0) / 100))
  console.log(
    `+ ${c.nom.padEnd(24)} ${String(c.effectif).padStart(3)} élèves → ${String(semestre).padStart(8)} €/semestre · ${String(total).padStart(8)} € l’année` +
    (fiche.pay_abatement > 0 ? `  (versé ${verse} € après abattement de ${fiche.pay_abatement} %)` : '')
  )
  if (!APPLY) { crees++; continue }

  const { data: contrat, error } = await db.from('inv_coaching_contracts').insert({
    provider_id: fiche.id,
    manager_id: benjamin.id,
    category_id: categorie.id,
    contract_type: 'coaching',
    program: 'pass_las_lsps',
    classes_label: c.classes,
    academic_year: ANNEE,
    headcount: c.effectif,
    rate_base_amount: BASE,
    rate_base_headcount: BASE_EFFECTIF,
    start_date: '2026-09-01',
    end_date: '2027-06-30',
    rate_type: 'forfait',
    total_ht: total,
    conditions:
      `${BASE} € par semestre pour ${BASE_EFFECTIF} étudiants, au prorata de ${c.effectif} suivis. ` +
      `Montant convenu, avant l’abattement lié au passage en contrat.`,
    status: 'active',
  }).select('id').single()
  if (error) { soucis.push(`${c.nom} : ${error.message}`); continue }

  const lignes = ECHEANCES.map((e, i) => ({
    contract_id: contrat.id,
    label: e.label,
    due_date: e.date,
    amount_ht: r2(semestre * e.part),
    sort_order: i + 1,
  }))
  const { error: e2 } = await db.from('inv_contract_instalments').insert(lignes)
  if (e2) { soucis.push(`${c.nom} : échéancier — ${e2.message}`); continue }
  crees++
}

console.log(`\n${crees} contrat(s) ${APPLY ? 'enregistrés' : 'à enregistrer'}`)
if (soucis.length) console.log('À regarder :\n  ' + soucis.join('\n  '))
