#!/usr/bin/env node
/**
 * Parcours complet, joue avec de VRAIES sessions utilisateur (clé anon) pour
 * que la RLS soit réellement exercée, pas contournée :
 *
 *   prestataire déclare → donneur d'ordre valide → admin valide
 *   → prestataire génère sa facture → contrôle des montants
 *
 * Les comptes de test sont supprimés à la fin.
 *
 * Usage : node scripts/e2e.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(URL, SERVICE)

const STAMP = process.env.E2E_STAMP ?? 'e2e'
const PASSWORD = 'Test-' + STAMP + '-2026!'
const accounts = [
  { key: 'manager', email: `${STAMP}.manager@diploma-invoice.test`, name: 'Léa Donneuse', role: 'manager' },
  { key: 'presta', email: `${STAMP}.presta@diploma-invoice.test`, name: 'Marie Durand', role: 'prestataire' },
]

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
  return ok
}
function die(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

// ---------- préparation des comptes ----------
console.log('\nComptes de test')
const created = {}
for (const acc of accounts) {
  const { data, error } = await admin.auth.admin.createUser({
    email: acc.email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) die(`création ${acc.email} : ${error.message}`)

  const { data: row, error: rowError } = await admin
    .from('inv_users')
    .insert({ auth_id: data.user.id, email: acc.email, full_name: acc.name, role: acc.role })
    .select('id')
    .single()
  if (rowError) die(`profil ${acc.email} : ${rowError.message}`)

  created[acc.key] = { ...acc, authId: data.user.id, userId: row.id }
  console.log(`  ✓ ${acc.role.padEnd(12)} ${acc.email}`)
}

const { data: provider, error: provError } = await admin
  .from('inv_providers')
  .insert({
    user_id: created.presta.userId,
    legal_name: 'Marie Durand',
    legal_form: 'Auto-entrepreneur',
    siret: '81234567800019',
    address_line1: '12 rue des Lilas',
    postal_code: '69003',
    city: 'Lyon',
    iban: 'FR7630006000011234567890189',
    vat_regime: 'franchise',
    vat_rate: 0,
    invoice_prefix: 'MD',
  })
  .select('id')
  .single()
if (provError) die(`fiche prestataire : ${provError.message}`)
created.presta.providerId = provider.id
console.log(`  ✓ fiche de facturation`)

async function session(acc) {
  const client = createClient(URL, ANON)
  const { error } = await client.auth.signInWithPassword({
    email: acc.email,
    password: PASSWORD,
  })
  if (error) die(`connexion ${acc.email} : ${error.message}`)
  return client
}

const asPresta = await session(created.presta)
const asManager = await session(created.manager)

// ---------- 1. le prestataire déclare ----------
console.log('\n1. Déclaration par le prestataire')
const { data: categories } = await asPresta
  .from('inv_categories')
  .select('id, name')
  .order('sort_order')
check('catégories visibles', (categories?.length ?? 0) > 0, `${categories?.length} proposées`)

const cat = categories.find((c) => c.name.includes('Professeur')) ?? categories[0]
const { data: mission, error: missionError } = await asPresta
  .from('inv_missions')
  .insert({
    provider_id: created.presta.providerId,
    manager_id: created.manager.userId,
    category_id: cat.id,
    detail: '4 séances de TD Anatomie — groupe PASS B',
    start_date: '2026-08-03',
    end_date: '2026-08-14',
    pricing_type: 'forfait_horaire',
    quantity: 16,
    unit_amount_ht: 45,
    total_ht: 720,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  })
  .select('id, status')
  .single()
check('prestation créée et soumise', !missionError && mission?.status === 'submitted', missionError?.message)
if (!mission) die('impossible de continuer sans prestation')

// ---------- 2. verrou : le prestataire ne peut plus modifier ----------
console.log('\n2. Verrous RLS')
const { data: tamper } = await asPresta
  .from('inv_missions')
  .update({ total_ht: 99999 })
  .eq('id', mission.id)
  .select('id')
check(
  'prestation soumise non modifiable par le prestataire',
  (tamper?.length ?? 0) === 0
)

const { data: selfApprove } = await asPresta
  .from('inv_missions')
  .update({ status: 'approved' })
  .eq('id', mission.id)
  .select('id')
check('le prestataire ne peut pas s’auto-valider', (selfApprove?.length ?? 0) === 0)

// ---------- 3. validation donneur d'ordre ----------
console.log('\n3. Validation par le donneur d’ordre')
const { data: mgrApproved, error: mgrError } = await asManager
  .from('inv_missions')
  .update({
    status: 'manager_approved',
    manager_approved_at: new Date().toISOString(),
    manager_approved_by: created.manager.userId,
  })
  .eq('id', mission.id)
  .select('status')
check('passée en "en attente admin"', mgrApproved?.[0]?.status === 'manager_approved', mgrError?.message)

const { data: mgrFinal } = await asManager
  .from('inv_missions')
  .update({ status: 'approved' })
  .eq('id', mission.id)
  .select('id')
check('le donneur d’ordre ne peut pas valider seul', (mgrFinal?.length ?? 0) === 0)

// ---------- 4. validation admin ----------
console.log('\n4. Validation administrative')
const { error: adminError } = await admin
  .from('inv_missions')
  .update({
    status: 'approved',
    admin_approved_at: new Date().toISOString(),
    admin_approved_by: null,
  })
  .eq('id', mission.id)
check('prestation validée, facturable', !adminError, adminError?.message)

// ---------- 5. génération de la facture ----------
console.log('\n5. Génération de la facture')
const { data: invoiceId, error: rpcError } = await asPresta.rpc('inv_create_invoice', {
  p_provider_id: created.presta.providerId,
  p_mission_ids: [mission.id],
})
check('facture créée', !rpcError && Boolean(invoiceId), rpcError?.message)

if (invoiceId) {
  const { data: invoice } = await asPresta
    .from('inv_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  check('numérotation', invoice?.number === 'MD-2026-0001', invoice?.number)
  check('total HT', Number(invoice?.subtotal_ht) === 720, `${invoice?.subtotal_ht} €`)
  check('TVA en franchise', Number(invoice?.vat_amount) === 0)
  check('net à payer', Number(invoice?.total_ttc) === 720, `${invoice?.total_ttc} €`)
  check('période déduite des missions', invoice?.period_start === '2026-08-03' && invoice?.period_end === '2026-08-14')
  check('snapshot émetteur figé', invoice?.issuer_snapshot?.siret === '81234567800019')
  check(
    'catégorie Pennylane sur la ligne',
    Boolean((await asPresta.from('inv_invoice_lines').select('pennylane_category_id').eq('invoice_id', invoiceId).single()).data?.pennylane_category_id)
  )

  const { data: after } = await asPresta
    .from('inv_missions')
    .select('status, invoice_id')
    .eq('id', mission.id)
    .single()
  check('prestation marquée facturée', after?.status === 'invoiced' && after?.invoice_id === invoiceId)

  // Double facturation de la meme prestation : doit echouer.
  const { error: dupError } = await asPresta.rpc('inv_create_invoice', {
    p_provider_id: created.presta.providerId,
    p_mission_ids: [mission.id],
  })
  check('impossible de refacturer la même prestation', Boolean(dupError))
}

// ---------- 6. cloisonnement entre prestataires ----------
console.log('\n6. Cloisonnement')
const { data: otherInvoices } = await asManager.from('inv_invoices').select('id')
check('le donneur d’ordre ne voit aucune facture', (otherInvoices?.length ?? 0) === 0)

// ---------- nettoyage ----------
console.log('\nNettoyage')
if (invoiceId) await admin.from('inv_invoices').delete().eq('id', invoiceId)
await admin.from('inv_missions').delete().eq('id', mission.id)
await admin.from('inv_providers').delete().eq('id', created.presta.providerId)
for (const key of Object.keys(created)) {
  await admin.from('inv_users').delete().eq('id', created[key].userId)
  await admin.auth.admin.deleteUser(created[key].authId)
}
console.log('  ✓ comptes de test supprimés')

console.log(
  failures === 0
    ? '\n✓ Parcours complet validé.\n'
    : `\n✗ ${failures} contrôle(s) en échec.\n`
)
process.exit(failures === 0 ? 0 : 1)
