#!/usr/bin/env node
/**
 * Crée les contrats de coaching Diploma à partir de Diploma Lab.
 *
 *   node --experimental-websocket scripts/contrats-coaching.mjs           aperçu
 *   node --experimental-websocket scripts/contrats-coaching.mjs --apply   crée
 *
 * Pour chaque coach : compte ses élèves Diploma, applique le barème de son
 * offre, crée son compte prestataire s'il n'existe pas, puis le contrat et
 * son échéancier.
 *
 * Échéancier — même rythme pour tous, décalé selon le mois de démarrage :
 * trois échéances par semestre, espacées de deux mois, réparties 30/40/30.
 * PASS/LAS/LSPS démarre en août, Terminale Santé en septembre.
 *
 * L'effectif est figé au moment de la création (art. 6.1 du contrat) : le
 * script ne met jamais à jour un contrat existant, il l'ignore. Un effectif
 * qui change se traite par un avenant, pas par un recalcul silencieux.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const ANNEE = process.env.ANNEE_UNIVERSITAIRE ?? '2026-2027'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Mois de démarrage du premier semestre, par programme (0 = janvier). */
const DEMARRAGE = { pass_las_lsps: 7, paes: 7, terminale_sante: 8 }
const REPARTITION = [0.3, 0.4, 0.3]
const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

/** Dernier jour du mois, en date ISO. */
function finDeMois(annee, mois) {
  const d = new Date(Date.UTC(annee, mois + 1, 0))
  return d.toISOString().slice(0, 10)
}

/**
 * Trois échéances par semestre : mois de départ, +2, +4.
 * Les arrondis vont sur la dernière pour que la somme tombe au centime.
 */
function echeances(programme, montantSemestre, anneeDebut, semestre) {
  const depart = DEMARRAGE[programme] ?? 7
  const base = depart + (semestre - 1) * 5
  const out = []
  let cumul = 0
  for (let i = 0; i < 3; i++) {
    const m = base + i * 2
    const annee = anneeDebut + Math.floor(m / 12)
    const mois = m % 12
    const montant = i === 2
      ? Math.round((montantSemestre - cumul) * 100) / 100
      : Math.round(montantSemestre * REPARTITION[i] * 100) / 100
    cumul += montant
    out.push({
      label: `Semestre ${semestre} — échéance fin ${MOIS[mois]} ${annee}`,
      due_date: finDeMois(annee, mois),
      amount_ht: montant,
      sort_order: (semestre - 1) * 3 + i + 1,
    })
  }
  return out
}

function motDePasse(nom) {
  const p = nom.trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '')
  return `Diploma-${p}-${randomBytes(2).readUInt16BE(0) % 9000 + 1000}`
}

// ---------- lecture de Diploma Lab ----------
const raw = execFileSync('node', ['--experimental-websocket', 'scripts/lab-coaching.mjs', '--json'], {
  encoding: 'utf8', maxBuffer: 8 << 20,
})
const coachs = JSON.parse(raw).filter((c) => c.bareme && c.email)

const { data: authUsers } = await db.auth.admin.listUsers({ perPage: 1000 })
const { data: rates } = await db.from('inv_coaching_rates').select('*').eq('academic_year', ANNEE)
const { data: categories } = await db.from('inv_categories').select('id, name')
const categorieCoaching = categories.find((c) => /admin|coaching/i.test(c.name))?.id ?? null
const { data: admin } = await db.from('inv_users').select('id').eq('role', 'admin').limit(1).single()

const lignes = []
for (const c of coachs) {
  const rate = rates.find((r) => r.program === c.bareme.programme)
  if (!rate) { console.error(`  ✗ pas de barème ${ANNEE} pour ${c.bareme.programme}`); continue }

  const semestre = Math.round(Number(rate.base_amount) * c.eleves / rate.base_headcount * 100) / 100
  const total = Math.round(semestre * 2 * 100) / 100
  const plan = [...echeances(c.bareme.programme, semestre, 2026, 1), ...echeances(c.bareme.programme, semestre, 2026, 2)]

  const ligne = { ...c, programme: c.bareme.programme, semestre, total, plan, mdp: null, etat: 'à créer' }

  if (!APPLY) { ligne.mdp = motDePasse(c.nom); lignes.push(ligne); continue }

  // -- compte
  let authUser = authUsers.users.find((u) => u.email === c.email)
  let mdp = null
  if (!authUser) {
    mdp = motDePasse(c.nom)
    const { data, error } = await db.auth.admin.createUser({ email: c.email, password: mdp, email_confirm: true })
    if (error) { console.error(`  ✗ ${c.email} : ${error.message}`); continue }
    authUser = data.user
  }
  ligne.mdp = mdp ?? '(compte existant)'

  let { data: appUser } = await db.from('inv_users').select('id').eq('auth_id', authUser.id).maybeSingle()
  if (!appUser) {
    const { data, error } = await db.from('inv_users')
      .insert({ auth_id: authUser.id, email: c.email, full_name: c.nom, role: 'prestataire' })
      .select('id').single()
    if (error) { console.error(`  ✗ ${c.email} : ${error.message}`); continue }
    appUser = data
  }

  let { data: provider } = await db.from('inv_providers').select('id').eq('user_id', appUser.id).maybeSingle()
  if (!provider) {
    const { data, error } = await db.from('inv_providers')
      .insert({ user_id: appUser.id, legal_name: c.nom, default_manager_id: admin.id })
      .select('id').single()
    if (error) { console.error(`  ✗ ${c.email} : fiche — ${error.message}`); continue }
    provider = data
  }

  // -- contrat (jamais mis à jour : l'effectif est figé)
  const { data: dejaLa } = await db.from('inv_coaching_contracts')
    .select('id').eq('provider_id', provider.id).eq('academic_year', ANNEE)
    .eq('program', c.bareme.programme).maybeSingle()
  if (dejaLa) { ligne.etat = 'contrat déjà présent'; lignes.push(ligne); continue }

  const { data: contrat, error: cErr } = await db.from('inv_coaching_contracts').insert({
    provider_id: provider.id, manager_id: admin.id, category_id: categorieCoaching,
    program: c.bareme.programme, academic_year: ANNEE,
    classes_label: c.classes.join(', '), headcount: c.eleves,
    headcount_fixed_at: new Date().toISOString().slice(0, 10),
    rate_base_amount: rate.base_amount, rate_base_headcount: rate.base_headcount,
    semesters: 2, total_ht: total, status: 'active',
    lab_coach_email: c.email,
  }).select('id').single()
  if (cErr) { console.error(`  ✗ ${c.email} : contrat — ${cErr.message}`); continue }

  const { error: iErr } = await db.from('inv_contract_instalments')
    .insert(plan.map((p) => ({ ...p, contract_id: contrat.id })))
  if (iErr) console.error(`  ⚠ ${c.email} : échéances — ${iErr.message}`)

  ligne.etat = 'créé'
  lignes.push(ligne)
}

// ---------- rapport ----------
console.log(`\n${APPLY ? 'Contrats créés' : 'Aperçu'} — année ${ANNEE}\n`)
for (const l of lignes) {
  console.log(`  ${l.nom}  —  ${l.offre}  —  ${l.eleves} élèves  —  ${l.semestre.toFixed(2)} €/semestre, ${l.total.toFixed(2)} €/an   [${l.etat}]`)
  console.log(`     ${l.email}${l.mdp ? `   mot de passe : ${l.mdp}` : ''}`)
  console.log(`     ${l.plan.map((p) => `${p.due_date} ${p.amount_ht.toFixed(2)} €`).join('  ·  ')}`)
}
const somme = lignes.reduce((s, l) => s + l.total, 0)
console.log(`\n  ${lignes.length} contrats · ${somme.toFixed(2)} € sur l'année`)
console.log(APPLY ? '' : '\n(aperçu — relancez avec --apply pour créer)\n')
