#!/usr/bin/env node
/**
 * Les contrats de coaching PAES et Terminale Santé négociés par Shirel.
 *
 *   node --experimental-websocket scripts/coachs-paes-terminale.mjs           aperçu
 *   node --experimental-websocket scripts/coachs-paes-terminale.mjs --apply   applique
 *
 * Reprend le prévisionnel 2026/2027 : une ligne par coach, deux échéances —
 * fin janvier et fin juin 2027. Les échéances deviennent des prestations à
 * leur date, donc rien n'est à ressaisir au moment de payer.
 *
 * Un coach sans email est laissé de côté : on ne crée pas un compte sans
 * adresse, la personne ne pourrait jamais y entrer.
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
const JANVIER = '2027-01-31'
const JUIN = '2027-06-30'

const COACHS = [
  // PAES — base 60 étudiants, prorata au-delà
  { nom: 'Marie-Lou Traens', email: '', programme: 'paes', classes: 'Classes 1 et 2', lieu: 'Présentiel', effectif: 60, janvier: 500, juin: 1000, note: 'Base 60 étudiants, prorata au-delà. Montant ajusté si l’effectif dépasse 60.' },
  { nom: 'Laura Gheorghita', email: '', programme: 'paes', classes: 'Classes 3, 4 et 5', lieu: 'Présentiel', effectif: 90, janvier: 750, juin: 1500, note: 'Base 60 étudiants, prorata au-delà. Estimation au prorata de 90 étudiants.' },
  { nom: 'Merwane Bouharaouï-Rother', email: 'merwane.bouharaoui@gmail.com', programme: 'paes', classes: 'Classe en ligne', lieu: 'À distance', effectif: null, janvier: 500, juin: 1000, note: 'Forfait fixe, sans prorata.' },

  // Terminale Santé — forfait fixe
  { nom: 'Ayna Boulemsamer Le Cunff', email: 'aynabroucuny4@gmail.com', programme: 'terminale_sante', classes: 'Classes 1 et 2', lieu: 'Quai de la Rapée', effectif: 60, janvier: 1000, juin: 1000, note: 'Forfait fixe. Rémunération dérogatoire.' },
  { nom: 'Mélina Oukil', email: '', programme: 'terminale_sante', classes: 'Classes 3 et 4', lieu: 'Quai de la Rapée', effectif: 60, janvier: 500, juin: 1000, note: 'Forfait fixe.' },
  { nom: 'Assya Kaoukab', email: '', programme: 'terminale_sante', classes: 'Classes 5 et 6', lieu: 'Lauriston', effectif: 60, janvier: 500, juin: 1000, note: 'Forfait fixe.' },
  { nom: 'Pratchi Ariana Aryal', email: '', programme: 'terminale_sante', classes: 'Classes 7 et 8', lieu: 'Ledru-Rollin', effectif: 60, janvier: 500, juin: 1000, note: 'Forfait fixe. Mission à compter d’octobre 2026.', debut: '2026-10-01' },
  { nom: 'Yasmine Lina Benhida', email: '', programme: 'terminale_sante', classes: 'Classe à distance (binôme)', lieu: 'À distance', effectif: null, janvier: 500, juin: 1000, note: 'Forfait fixe. Binôme avec Laura Issa.' },
  { nom: 'Laura Issa', email: '', programme: 'terminale_sante', classes: 'Classe à distance (binôme)', lieu: 'À distance', effectif: null, janvier: 500, juin: 1000, note: 'Forfait fixe. Binôme avec Yasmine Lina Benhida.' },
  // Isa Lys (classes 9 et 10) : mission à compter de janvier 2027, rémunération
  // non arrêtée — rien à enregistrer tant que le montant n'est pas fixé.
]

const LIBELLE = { paes: 'PAES', terminale_sante: 'Terminale Santé' }

const { data: shirel } = await db.from('inv_users').select('id').eq('email', 'shirel.benchetrit@diploma-sante.fr').single()
const { data: categorie } = await db.from('inv_categories').select('id').eq('pole', 'coaching').eq('is_active', true).order('sort_order').limit(1).single()

let crees = 0
const enAttente = []
for (const c of COACHS) {
  const total = c.janvier + c.juin
  if (!c.email) { enAttente.push(`${c.nom} — ${total} € — email manquant`); continue }

  const { data: user } = await db.from('inv_users').select('id').ilike('email', c.email).maybeSingle()
  if (!user) { enAttente.push(`${c.nom} — ${total} € — aucun compte pour ${c.email}`); continue }
  const { data: fiche } = await db.from('inv_providers').select('id').eq('user_id', user.id).maybeSingle()
  if (!fiche) { enAttente.push(`${c.nom} — fiche prestataire introuvable`); continue }

  const titre = `Coaching ${LIBELLE[c.programme]} — ${c.classes}`
  const { data: deja } = await db
    .from('inv_coaching_contracts')
    .select('id')
    .eq('provider_id', fiche.id).eq('title', titre).eq('academic_year', ANNEE).maybeSingle()
  if (deja) { console.log(`= ${c.nom} — déjà enregistré`); continue }

  console.log(`+ ${c.nom.padEnd(28)} ${LIBELLE[c.programme].padEnd(16)} ${String(total).padStart(5)} €  (${c.janvier} + ${c.juin})`)
  if (!APPLY) { crees++; continue }

  const { data: contrat, error } = await db.from('inv_coaching_contracts').insert({
    provider_id: fiche.id,
    manager_id: shirel.id,
    category_id: categorie.id,
    contract_type: 'coaching',
    title: titre,
    program: c.programme,
    classes_label: c.classes,
    academic_year: ANNEE,
    headcount: c.effectif,
    start_date: c.debut ?? '2026-09-01',
    end_date: '2027-06-30',
    rate_type: 'forfait',
    total_ht: total,
    conditions: `${c.lieu}. ${c.note} Versé en deux fois : fin janvier et fin juin 2027.`,
    status: 'active',
  }).select('id').single()
  if (error) { enAttente.push(`${c.nom} : ${error.message}`); continue }

  const { error: e2 } = await db.from('inv_contract_instalments').insert([
    { contract_id: contrat.id, label: 'Premier semestre', due_date: JANVIER, amount_ht: c.janvier, sort_order: 1 },
    { contract_id: contrat.id, label: 'Second semestre', due_date: JUIN, amount_ht: c.juin, sort_order: 2 },
  ])
  if (e2) { enAttente.push(`${c.nom} : échéancier — ${e2.message}`); continue }
  crees++
}

console.log(`\n${crees} contrat(s) ${APPLY ? 'enregistrés' : 'à enregistrer'}`)
if (enAttente.length) console.log('En attente :\n  ' + enAttente.join('\n  '))
