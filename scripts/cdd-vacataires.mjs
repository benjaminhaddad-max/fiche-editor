#!/usr/bin/env node
/**
 * Les coachs passés en CDD vacataire.
 *
 *   node --experimental-websocket scripts/cdd-vacataires.mjs           aperçu
 *   node --experimental-websocket scripts/cdd-vacataires.mjs --apply   applique
 *
 * Le montant convenu avec leur manager est celui qu'on aurait versé à un
 * auto-entrepreneur. En contrat, les charges sont plus lourdes : ce qui
 * leur revient est diminué de 20 %. Danial fait exception — son contrat
 * fixe déjà des montants nets, il n'y a rien à retirer.
 *
 * Coordonnées reprises de Diploma Lab, où ils ont un compte coach.
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

const GENS = [
  {
    nom: 'Danial Almgadmee',
    email: 'almgadmee.danial@gmail.com',
    abattement: 0,
    notes:
      'CDD vacataire du 01/09/2026 au 30/06/2027, CCN 2691. Coaching : 2 666,66 € net par semestre. ' +
      'Enregistrement 70 € bruts la demi-journée, secrétariat 50 €, surveillance 12 € la vacation. ' +
      'Pas d’abattement : son contrat fixe déjà des montants nets.',
  },
  {
    nom: 'Mhaude Yapo',
    email: 'genuismhaude@gmail.com',
    abattement: 20,
    notes:
      'Passée en CDD vacataire. Le montant convenu avec son manager est celui d’un auto-entrepreneur ; ' +
      'ce qui lui revient est diminué de 20 % au titre des charges du contrat.',
  },
  {
    nom: 'Alexandra Przybylowicz',
    email: 'przybylowiczalexandra@gmail.com',
    abattement: 20,
    notes:
      'Passée en CDD vacataire. Le montant convenu avec son manager est celui d’un auto-entrepreneur ; ' +
      'ce qui lui revient est diminué de 20 % au titre des charges du contrat.',
  },
]

let faits = 0
const soucis = []

for (const p of GENS) {
  const email = p.email.toLowerCase()
  let { data: user } = await db.from('inv_users').select('id, role').ilike('email', email).maybeSingle()
  if (user && user.role !== 'prestataire') { soucis.push(`${p.nom} : ${email} appartient à l’équipe`); continue }

  console.log(`${user ? '=' : '+'} ${p.nom.padEnd(24)} ${email.padEnd(34)} abattement ${p.abattement} %`)
  if (!APPLY) { faits++; continue }

  if (!user) {
    const { data: auth, error } = await db.auth.admin.createUser({ email, email_confirm: true })
    if (error) { soucis.push(`${p.nom} : ${error.message}`); continue }
    const r = await db.from('inv_users')
      .insert({ auth_id: auth.user.id, email, full_name: p.nom, role: 'prestataire' })
      .select('id').single()
    if (r.error) { soucis.push(`${p.nom} : ${r.error.message}`); continue }
    user = r.data
  }

  const { data: fiche } = await db.from('inv_providers').select('id').eq('user_id', user.id).maybeSingle()
  const champs = {
    legal_name: p.nom,
    employment_type: 'vacataire',
    pay_abatement: p.abattement,
    invoice_prefix: 'FACT',
    notes: p.notes,
  }
  const r = fiche
    ? await db.from('inv_providers').update(champs).eq('id', fiche.id)
    : await db.from('inv_providers').insert({ user_id: user.id, ...champs })
  if (r.error) { soucis.push(`${p.nom} : ${r.error.message}`); continue }
  faits++
}

console.log(`\n${faits} fiche(s) ${APPLY ? 'enregistrées' : 'à enregistrer'}`)
if (soucis.length) console.log('À regarder :\n  ' + soucis.join('\n  '))
