#!/usr/bin/env node
/**
 * Enregistre les contrats de prestation des enregistreurs de cours.
 *
 *   node --experimental-websocket scripts/enregistreurs.mjs           aperçu
 *   node --experimental-websocket scripts/enregistreurs.mjs --apply   applique
 *
 * Reprend la synthèse 2026-2027 : coordonnées, fac de rattachement et
 * barème. Relancé, il ne crée rien en double.
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

const RESUME = {
  standard: '2 h 25 € · 4 h 35 € · 6 h 50 € · 8 à 10 h 65 €',
  majore: '2 h 30 € · 4 h 40 € · 6 h 55 € · 8 à 10 h 70 €',
  horaire15: '15 € de l’heure',
  demi_journee70: '70 € la demi-journée',
}
const UNITAIRE = { standard: 25, majore: 30, horaire15: 15, demi_journee70: 70 }

const GENS = [
  ['Sahra Touazi', 'sahra.touazi@gmail.com', '06 46 01 83 78', 'UPEC L2 / L1', 'standard', null],
  ['Ayna Boulemsamer Le Cunff', 'aynabroucuny4@gmail.com', '07 62 38 55 32', 'UPS', 'horaire15', 'Prise en charge du pass Navigo'],
  ['Ella Benais', 'ella.bns@yahoo.com', '06 70 35 54 12', 'UPEC L2', 'standard', null],
  ['Katia Zabout', 'katia.zabout.1@gmail.com', '06 29 51 15 00', 'UPEC', 'standard', null],
  ['Niriso Andriananantany', 'nirisoganavalona@gmail.com', '+33 6 17 21 73 44', 'UVSQ', 'majore', null],
  ['Nolann Chabot Guyot', 'chabotnolann@gmail.com', '07 81 76 88 24', 'UPEC L2', 'standard', null],
  ['Ouriel Allouche', 'ourielallouche26@gmail.com', '06 63 37 26 49', 'UPS', 'majore', null],
  ['Sérine Rouadhi', 'hannarouadhi.s@gmail.com', '07 83 63 81 81', 'UPS', 'demi_journee70', 'Prise en charge du pass Navigo'],
  ['Marwan Simeon', 'marwan.simeon@hotmail.com', '07 68 73 23 95', 'UPEC L2', 'standard', null],
  ['Solal Machting', 'solal.machting@gmail.com', '07 68 55 53 92', 'UVSQ', 'majore', null],
  ['Yasmine Bouhamsou', 'yasmine.bouhamsou@icloud.com', '06 62 94 65 04', 'UPS', 'majore', null],
  ['Merwane Bouharaouï-Rother', 'merwane.bouharaoui@gmail.com', '06 24 89 76 45', 'USPN', 'standard', null],
  ['Eden Assaraf', 'eden.assaraf.25.01@gmail.com', '07 82 82 26 28', 'USPN', 'standard', null],
  ['Ibrahima M. Baye', 'mbaye.ibrahima.94.7@gmail.com', '06 03 87 31 15', 'USPN', 'standard', null],
  ['Ines Zarrouk', 'ines.zarrouk15@gmail.com', '06 03 93 46 17', 'UPS', 'standard', null],
  ['Zakaria El Marzougui', 'zelmarzougui6@gmail.com', '07 55 23 06 53', 'UVSQ', 'majore', null],
]

const { data: eloise } = await db.from('inv_users').select('id, full_name').ilike('email', 'eloise.alix@diploma-sante.fr').maybeSingle()
const { data: categorie } = await db.from('inv_categories').select('id').eq('pole', 'enregistrement').maybeSingle()
if (!eloise || !categorie) { console.error('✗ manager ou catégorie introuvable'); process.exit(1) }

console.log(`\n${APPLY ? 'Enregistrement' : 'Aperçu'} — ${GENS.length} enregistreurs, suivis par ${eloise.full_name}\n`)
let comptes = 0, contrats = 0

for (const [nom, email, tel, fac, cle, remarque] of GENS) {
  if (!APPLY) {
    console.log(`  · ${nom.padEnd(28)} ${fac.padEnd(12)} ${RESUME[cle]}`)
    continue
  }

  let { data: u } = await db.from('inv_users').select('id').ilike('email', email).maybeSingle()
  if (!u) {
    const { data: auth, error } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (error) { console.log(`  ✗ ${nom} : ${error.message}`); continue }
    const r = await db.from('inv_users').insert({ auth_id: auth.user.id, email, full_name: nom, role: 'prestataire', phone: tel }).select('id').single()
    if (r.error) { console.log(`  ✗ ${nom} : ${r.error.message}`); continue }
    u = r.data
    comptes++
  }

  let { data: p } = await db.from('inv_providers').select('id').eq('user_id', u.id).maybeSingle()
  if (!p) {
    const r = await db.from('inv_providers').insert({
      user_id: u.id, legal_name: nom, phone: tel, invoice_prefix: 'FACT',
      default_manager_id: eloise.id, employment_type: 'independant',
      notes: [`Enregistrement de cours — ${fac}.`, remarque].filter(Boolean).join(' '),
    }).select('id').single()
    if (r.error) { console.log(`  ✗ ${nom} : ${r.error.message}`); continue }
    p = r.data
  }

  const { data: existant } = await db.from('inv_coaching_contracts')
    .select('id').eq('provider_id', p.id).eq('contract_type', 'enregistrement').maybeSingle()
  if (existant) { console.log(`  = ${nom} : contrat déjà enregistré`); continue }

  const conditions = [
    `Enregistrement des cours — ${fac}.`,
    `Barème : ${RESUME[cle]}.`,
    'Hors prime de fiabilité et hors missions de renfort ou de remplacement.',
    remarque,
  ].filter(Boolean).join('\n')

  const { error } = await db.from('inv_coaching_contracts').insert({
    provider_id: p.id, manager_id: eloise.id, category_id: categorie.id,
    contract_type: 'enregistrement', profile: `enregistrement_${cle}`,
    title: `Enregistrement de cours — ${fac}`,
    academic_year: '2026-2027',
    start_date: '2026-09-01', end_date: '2027-08-31',
    rate_type: cle === 'horaire15' ? 'horaire' : 'mission',
    rate_amount: UNITAIRE[cle], total_ht: 0,
    conditions, status: 'active',
  })
  if (error) { console.log(`  ✗ ${nom} : ${error.message}`); continue }
  contrats++
  console.log(`  ✓ ${nom.padEnd(28)} ${fac.padEnd(12)} ${RESUME[cle]}`)
}

console.log(APPLY ? `\n✓ ${comptes} compte(s) créé(s), ${contrats} contrat(s) enregistré(s).\n` : '\n(aperçu — relancez avec --apply)\n')
