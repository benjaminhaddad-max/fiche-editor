#!/usr/bin/env node
/**
 * Les professeurs payés à la prestation.
 *
 *   node --experimental-websocket scripts/professeurs.mjs           aperçu
 *   node --experimental-websocket scripts/professeurs.mjs --apply   applique
 *
 * Coordonnées reprises de Diploma Lab, où ils ont déjà un compte professeur.
 * Pas de contrat au forfait : ils déclarent ce qu'ils ont fait, ligne par
 * ligne, avec la formation et le manager concernés — c'est là que se décide
 * qui vérifie. On ne leur fixe donc pas de manager par défaut.
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

const PROFESSEURS = [
  { nom: 'Isaac Riahi', email: 'isaac.riahi@diploma-sante.fr', tel: '+33 6 81 91 18 93' },
  { nom: 'Jeremie Yaffi', email: 'jeremie.yaffi@diploma-sante.fr', tel: '+33 6 18 05 76 43' },
  { nom: 'Meryeme Benramdane', email: 'meryeme.benramdane@linova-education.fr', tel: '+33 6 41 27 17 47' },
  { nom: 'Mohamed Keskas', email: 'mohamed.keskas@diploma-sante.fr', tel: '+33 6 01 96 40 66' },
  { nom: 'Hamady Diaw', email: 'hamady.diaw@diploma-sante.fr', tel: '+33 6 15 87 27 78' },
  { nom: 'Vincent Israel-Jost', email: 'visraeljost@gmail.com', tel: '+33 6 87 57 70 35' },
  { nom: 'Léa Van Den Kerchove', email: 'lvdk.osteo@gmail.com', tel: null },
  { nom: 'Romain Hadjerci', email: 'romain.hadjerci@diploma-sante.fr', tel: '+33 6 34 12 23 90' },
  { nom: 'Gabriel Boccara', email: 'gabriel.boccara@diploma-sante.fr', tel: '+33 6 60 39 70 89' },
  { nom: 'Hanna Charbit', email: 'hanna.charbit@diploma-sante.fr', tel: '+33 6 27 56 63 37' },
  { nom: 'Dounia Yazidi', email: 'dounia.yazidi@diploma-sante.fr', tel: '+33 6 25 03 87 87' },
  { nom: 'Maxime Solignat', email: 'maxime.solignat@diploma-sante.fr', tel: '+33 6 60 34 16 24' },
]

let comptes = 0, existants = 0
const soucis = []

for (const p of PROFESSEURS) {
  const email = p.email.toLowerCase()
  let { data: user } = await db.from('inv_users').select('id, role, is_active').ilike('email', email).maybeSingle()

  if (user && user.role !== 'prestataire') { soucis.push(`${p.nom} : ${email} appartient déjà à l’équipe`); continue }
  if (user) { existants++; console.log(`= ${p.nom.padEnd(24)} déjà sur la plateforme`); }

  if (!user) {
    console.log(`+ ${p.nom.padEnd(24)} ${email}`)
    comptes++
    if (!APPLY) continue
    const { data: auth, error } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (error) { soucis.push(`${p.nom} : ${error.message}`); continue }
    const r = await db.from('inv_users')
      .insert({ auth_id: auth.user.id, email, full_name: p.nom, role: 'prestataire', phone: p.tel })
      .select('id').single()
    if (r.error) { soucis.push(`${p.nom} : ${r.error.message}`); continue }
    user = r.data
  }

  const { data: fiche } = await db.from('inv_providers').select('id').eq('user_id', user.id).maybeSingle()
  if (fiche || !APPLY) continue
  const r = await db.from('inv_providers').insert({
    user_id: user.id,
    legal_name: p.nom,
    phone: p.tel,
    invoice_prefix: 'FACT',
    employment_type: 'independant',
    notes: 'Professeur à la prestation. Déclare ses heures et ses travaux ligne par ligne.',
  }).select('id').single()
  if (r.error) soucis.push(`${p.nom} : ${r.error.message}`)
}

console.log(`\n${comptes} compte(s) ${APPLY ? 'créés' : 'à créer'}, ${existants} déjà présent(s)`)
if (soucis.length) console.log('À regarder :\n  ' + soucis.join('\n  '))
