#!/usr/bin/env node
/**
 * Compte coach de démonstration, avec un cas de chaque situation pour
 * parcourir les deux côtés de la plateforme.
 *
 *   node --experimental-websocket scripts/coach-test.mjs
 *   node --experimental-websocket scripts/coach-test.mjs --cleanup
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
// Adresse réelle : elle doit recevoir les vrais emails (invitation,
// validation, bordereau) pour que le parcours soit testable de bout en bout.
const EMAIL = process.env.COACH_TEST_EMAIL ?? 'benhaddad76+test@gmail.com'
const MDP = 'CoachTest2026'   // remplacé par celui que la personne choisira via l'invitation
const now = () => new Date().toISOString()

const authUser = async () => {
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === EMAIL)
}

if (process.argv.includes('--cleanup')) {
  const { data: u } = await db.from('inv_users').select('id').eq('email', EMAIL).maybeSingle()
  if (u) {
    const { data: p } = await db.from('inv_providers').select('id').eq('user_id', u.id).maybeSingle()
    if (p) {
      const { data: contrats } = await db.from('inv_coaching_contracts').select('id').eq('provider_id', p.id)
      for (const c of contrats ?? []) await db.from('inv_coaching_contracts').delete().eq('id', c.id)
      const { data: fs } = await db.from('inv_invoices').select('id, pdf_path').eq('provider_id', p.id)
      for (const f of fs ?? []) {
        if (f.pdf_path) await db.storage.from('invoices').remove([f.pdf_path])
        await db.from('inv_invoices').delete().eq('id', f.id)
      }
      await db.from('inv_missions').delete().eq('provider_id', p.id)
      await db.from('inv_providers').delete().eq('id', p.id)
    }
    await db.from('inv_audit_log').delete().eq('actor_id', u.id)
    await db.from('inv_users').delete().eq('id', u.id)
  }
  const a = await authUser()
  if (a) await db.auth.admin.deleteUser(a.id)
  console.log('✓ compte de test supprimé')
  process.exit(0)
}

// ---------- compte ----------
let a = await authUser()
if (!a) {
  const { data, error } = await db.auth.admin.createUser({ email: EMAIL, password: MDP, email_confirm: true })
  if (error) throw new Error(error.message)
  a = data.user
} else {
  await db.auth.admin.updateUserById(a.id, { password: MDP })
}

const { data: u } = await db.from('inv_users')
  .upsert({ auth_id: a.id, email: EMAIL, full_name: 'Coach Test', role: 'prestataire' }, { onConflict: 'auth_id' })
  .select('id').single()

const { data: manager } = await db.from('inv_users').select('id').eq('role', 'manager').limit(1).single()

// Profil déjà complet : on veut tester la facturation, pas l'onboarding.
const { data: p } = await db.from('inv_providers').upsert({
  user_id: u.id, legal_name: 'Coach Test', legal_form: 'Auto-entrepreneur',
  siret: '12345678900019', address_line1: '1 rue de la Démo', postal_code: '75012',
  city: 'Paris', iban: 'FR7630006000011234567890189', bic: 'AGRIFRPP',
  vat_regime: 'franchise', vat_rate: 0, invoice_prefix: 'TEST',
  default_manager_id: manager.id, onboarding_complete: true,
}, { onConflict: 'user_id' }).select('id').single()

const { data: cats } = await db.from('inv_categories').select('id, name').order('sort_order')
const cat = (needle) => cats.find((c) => c.name.includes(needle))?.id ?? cats[0].id

await db.from('inv_missions').delete().eq('provider_id', p.id)

// ---------- un cas de chaque situation ----------
const cas = [
  {
    detail: 'Coaching pédagogique PASS / LAS / LSPS — 2026-2027 — semestre 1 — échéance fin août 2026 — 30 étudiants suivis',
    category_id: cat('Admin'), start_date: '2026-08-31', end_date: '2026-08-31',
    pricing_type: 'forfait_mission', quantity: 1, unit_amount_ht: 300, total_ht: 300,
    status: 'manager_approved', origin: 'contract',
    submitted_at: now(), manager_approved_at: now(), manager_approved_by: manager.id,
  },
  {
    detail: 'Surveillance concours blanc n°1 — campus Ledru-Rollin',
    category_id: cat('Référent'), start_date: '2026-08-22', end_date: '2026-08-22',
    pricing_type: 'forfait_mission', quantity: 1, unit_amount_ht: 310, total_ht: 310,
    status: 'manager_approved', origin: 'manager',
    submitted_at: now(), manager_approved_at: now(), manager_approved_by: manager.id,
  },
  {
    detail: 'Oubli : 3 h de permanence méthodo le samedi 15 août',
    category_id: cat('Professeur'), start_date: '2026-08-15', end_date: '2026-08-15',
    pricing_type: 'forfait_horaire', quantity: 3, unit_amount_ht: 45, total_ht: 135,
    status: 'submitted', origin: 'provider', submitted_at: now(),
  },
  {
    detail: 'Impression de 200 fascicules UE3',
    category_id: cat('Impression'), start_date: '2026-08-10', end_date: null,
    pricing_type: 'forfait_mission', quantity: 1, unit_amount_ht: 950, total_ht: 950,
    status: 'rejected', origin: 'provider', submitted_at: now(),
    rejected_at: now(), rejected_by: manager.id,
    rejection_reason: 'Le devis validé était de 620 € HT, merci de corriger.',
  },
]

const { error } = await db.from('inv_missions').insert(cas.map((c) => ({ ...c, provider_id: p.id, manager_id: manager.id })))
if (error) throw new Error(error.message)

console.log(`\n✓ Compte de test prêt\n`)
console.log(`  ${EMAIL}   mot de passe : ${MDP}\n`)
console.log(`  ${cas.filter((c) => c.status === 'manager_approved').reduce((s, c) => s + c.total_ht, 0)} € en attente de VOTRE validation (coaching + surveillance)`)
console.log(`  135 € ajoutés par le prestataire, en attente de validation`)
console.log(`  1 prestation refusée avec son motif`)
console.log(`\n  Validez depuis « Prestations à valider » : un email partira automatiquement.\n`)
