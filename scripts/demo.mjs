#!/usr/bin/env node
/**
 * Jeu de démonstration : un manager, un prestataire et quelques
 * prestations dans des états différents, pour voir les écrans remplis.
 *
 *   node --experimental-websocket scripts/demo.mjs           crée
 *   node --experimental-websocket scripts/demo.mjs --cleanup supprime
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const DOMAIN = 'demo.diploma-invoice.test'
const PASSWORD = 'Demo-Diploma-2026!'
const PEOPLE = [
  { email: `admin@${DOMAIN}`, name: 'Admin Démo', role: 'admin' },
  { email: `manager@${DOMAIN}`, name: 'Léa Martin', role: 'manager' },
  { email: `presta@${DOMAIN}`, name: 'Marie Durand', role: 'prestataire' },
]

async function findAuthUser(email) {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  return data?.users.find((u) => u.email === email)
}

if (process.argv.includes('--cleanup')) {
  for (const p of PEOPLE) {
    const { data: row } = await db.from('inv_users').select('id').eq('email', p.email).maybeSingle()
    if (row) {
      const { data: prov } = await db.from('inv_providers').select('id').eq('user_id', row.id).maybeSingle()
      if (prov) {
        const { data: invs } = await db.from('inv_invoices').select('id').eq('provider_id', prov.id)
        for (const i of invs ?? []) await db.from('inv_invoices').delete().eq('id', i.id)
        await db.from('inv_missions').delete().eq('provider_id', prov.id)
        await db.from('inv_providers').delete().eq('id', prov.id)
      }
      await db.from('inv_missions').delete().eq('manager_id', row.id)
      await db.from('inv_audit_log').delete().eq('actor_id', row.id)
      await db.from('inv_users').delete().eq('id', row.id)
    }
    const authUser = await findAuthUser(p.email)
    if (authUser) await db.auth.admin.deleteUser(authUser.id)
    console.log(`  supprimé ${p.email}`)
  }
  console.log('\n✓ Jeu de démonstration retiré.\n')
  process.exit(0)
}

const ids = {}
for (const p of PEOPLE) {
  let authUser = await findAuthUser(p.email)
  if (!authUser) {
    const { data, error } = await db.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`${p.email} : ${error.message}`)
    authUser = data.user
  }
  const { data: row, error } = await db
    .from('inv_users')
    .upsert(
      { auth_id: authUser.id, email: p.email, full_name: p.name, role: p.role },
      { onConflict: 'auth_id' }
    )
    .select('id')
    .single()
  if (error) throw new Error(`${p.email} : ${error.message}`)
  ids[p.role] = row.id
  console.log(`  ✓ ${p.role.padEnd(12)} ${p.email}`)
}

const { data: provider } = await db
  .from('inv_providers')
  .upsert(
    {
      user_id: ids.prestataire,
      legal_name: 'Marie Durand',
      legal_form: 'Auto-entrepreneur',
      siret: '81234567800019',
      address_line1: '12 rue des Lilas',
      postal_code: '69003',
      city: 'Lyon',
      phone: '06 12 34 56 78',
      iban: 'FR7630006000011234567890189',
      bic: 'AGRIFRPP',
      vat_regime: 'franchise',
      vat_rate: 0,
      invoice_prefix: 'MD',
      default_manager_id: ids.manager,
      onboarding_complete: true,
    },
    { onConflict: 'user_id' }
  )
  .select('id')
  .single()

const { data: cats } = await db.from('inv_categories').select('id, name').order('sort_order')
const byName = (needle) => cats.find((c) => c.name.includes(needle))?.id ?? cats[0].id
const now = new Date().toISOString()

await db.from('inv_missions').delete().eq('provider_id', provider.id)
await db.from('inv_missions').insert([
  {
    provider_id: provider.id, manager_id: ids.manager, category_id: byName('Professeur'),
    detail: '4 séances de TD Anatomie — groupe PASS B, campus Lyon',
    start_date: '2026-08-03', end_date: '2026-08-14',
    pricing_type: 'forfait_horaire', quantity: 16, unit_amount_ht: 45, total_ht: 720,
    status: 'submitted', submitted_at: now,
  },
  {
    provider_id: provider.id, manager_id: ids.manager, category_id: byName('Référent'),
    detail: 'Surveillance concours blanc n°3',
    start_date: '2026-08-22', end_date: '2026-08-22',
    pricing_type: 'forfait_mission', quantity: 1, unit_amount_ht: 310, total_ht: 310,
    status: 'manager_approved', submitted_at: now, manager_approved_at: now,
    manager_approved_by: ids.manager,
  },
  {
    provider_id: provider.id, manager_id: ids.manager, category_id: byName('Admin'),
    detail: 'Coaching individuel — 6 étudiants redoublants',
    start_date: '2026-07-06', end_date: '2026-07-31',
    pricing_type: 'forfait_horaire', quantity: 12, unit_amount_ht: 40, total_ht: 480,
    status: 'approved', submitted_at: now, manager_approved_at: now,
    manager_approved_by: ids.manager, admin_approved_at: now, admin_approved_by: ids.admin,
  },
  {
    provider_id: provider.id, manager_id: ids.manager, category_id: byName('Impression'),
    detail: 'Impression des fascicules UE3 (mauvais tarif appliqué)',
    start_date: '2026-07-15', end_date: null,
    pricing_type: 'forfait_mission', quantity: 1, unit_amount_ht: 950, total_ht: 950,
    status: 'rejected', submitted_at: now, rejected_at: now, rejected_by: ids.manager,
    rejection_reason: 'Le devis validé était de 620 € HT, merci de corriger le montant.',
  },
])

console.log(`\n✓ Démo prête — mot de passe commun : ${PASSWORD}`)
console.log(`  admin@${DOMAIN} / manager@${DOMAIN} / presta@${DOMAIN}\n`)
