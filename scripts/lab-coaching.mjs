#!/usr/bin/env node
/**
 * Effectifs de coaching Diploma, lus dans Diploma Lab (ExoTeach).
 *
 * Le périmètre repose sur profiles.brand, PAS sur le nom de la classe :
 * mesuré sur les 59 classes coachées, le nom se trompe 28 fois (des classes
 * « Medibox Excellence » ne contiennent que des élèves Diploma), alors que
 * la marque de l'élève est cohérente — aucune classe ne mélange Diploma
 * avec une autre marque.
 *
 *   node --experimental-websocket scripts/lab-coaching.mjs [--json]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const LAB_DIR = process.env.LAB_DIR
  ?? '/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/EXOTEACHBIS-main'

// Variables lues dans des constantes locales, JAMAIS dans process.env :
// ce script est appelé depuis contrats-coaching.mjs, qui a déjà chargé les
// identifiants de Diploma Invoice. Passer par process.env ferait pointer
// la connexion sur la mauvaise base.
const labEnv = {}
for (const l of readFileSync(`${LAB_DIR}/.env.local`, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) labEnv[m[1]] = m[2].trim()
}
if (!labEnv.NEXT_PUBLIC_SUPABASE_URL || !labEnv.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`Identifiants Diploma Lab introuvables dans ${LAB_DIR}/.env.local`)
  process.exit(1)
}

const lab = createClient(labEnv.NEXT_PUBLIC_SUPABASE_URL, labEnv.SUPABASE_SERVICE_ROLE_KEY)
const BRAND = 'diploma'
const EXCLURE = /test|démo|demo|apple review/i

/**
 * Un élève portant une adresse de la société n'est pas un client : c'est un
 * compte de vérification créé par l'équipe. Il y en a un dans presque chaque
 * classe, et ils gonflaient tous les contrats d'une unité.
 *
 * On filtre sur le domaine plutôt que sur le mot « test » dans le nom :
 * ce dernier produit des faux positifs — « Agathe Demol », « Laure De Moura »
 * contiennent « demo ».
 */
const estCompteInterne = (email) => /@diploma-sante\.fr$/i.test(email ?? '')

/** Barèmes par offre, au prorata. */
const BAREMES = {
  'Prépa PASS':       { programme: 'pass_las_lsps',   base: 1000, effectif: 30 },
  'Prépa LAS':        { programme: 'pass_las_lsps',   base: 1000, effectif: 30 },
  'Prépa LSPS':       { programme: 'pass_las_lsps',   base: 1000, effectif: 30 },
  'PAES FR/EU':       { programme: 'paes',            base: 1000, effectif: 100 },
  'Terminale Santé':  { programme: 'terminale_sante', base:  750, effectif: 60 },
}

const { data: dossiers } = await lab.from('dossiers').select('id, parent_id, name')
const byId = new Map(dossiers.map((d) => [d.id, d]))
const racine = (id) => { let c = byId.get(id); while (c?.parent_id && byId.get(c.parent_id)) c = byId.get(c.parent_id); return c }

const { data: assigns } = await lab.from('coach_groupe_assignments')
  .select('coach_id, groupe_id, groupe:groupes(name, formation_dossier_id), coach:profiles(email, first_name, last_name)')

const parCoach = new Map()
let ignorees = 0
for (const a of assigns) {
  const nom = a.groupe?.name ?? ''
  if (EXCLURE.test(nom)) { ignorees++; continue }

  const { data: eleves } = await lab.from('profiles')
    .select('email')
    .eq('groupe_id', a.groupe_id).eq('role', 'eleve').eq('brand', BRAND)
  const count = (eleves ?? []).filter((e) => !estCompteInterne(e.email)).length
  if (!count) continue

  const offre = racine(a.groupe?.formation_dossier_id)?.name ?? '(inconnue)'
  const bareme = BAREMES[offre]
  const email = a.coach?.email?.toLowerCase()
  const key = `${email}|${bareme?.programme ?? offre}`
  const cur = parCoach.get(key) ?? {
    nom: `${a.coach?.first_name ?? ''} ${a.coach?.last_name ?? ''}`.trim(),
    email, offre, bareme, eleves: 0, classes: [],
  }
  parCoach.set(key, { ...cur, eleves: cur.eleves + count, classes: [...cur.classes, `${nom} (${count})`] })
}

const rows = [...parCoach.values()]
  .map((r) => ({ ...r, semestre: r.bareme ? Math.round(r.bareme.base * r.eleves / r.bareme.effectif * 100) / 100 : null }))
  .sort((a, b) => (b.semestre ?? 0) - (a.semestre ?? 0))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2)); process.exit(0)
}

console.log(`\nCoaching Diploma — ${ignorees} classe(s) test/démo ignorée(s)\n`)
const w = Math.max(...rows.map((r) => r.nom.length), 5)
const wo = Math.max(...rows.map((r) => r.offre.length), 6)
console.log(`  ${'COACH'.padEnd(w)}  ${'OFFRE'.padEnd(wo)}  ÉLÈVES    SEMESTRE  EMAIL`)
for (const r of rows) {
  console.log(`  ${r.nom.padEnd(w)}  ${r.offre.padEnd(wo)}  ${String(r.eleves).padStart(6)}  ${(r.semestre ?? 0).toFixed(2).padStart(9)} €  ${r.email}`)
  if (r.classes.length > 1) console.log(`  ${' '.repeat(w)}  ${' '.repeat(wo)}  └ ${r.classes.join(', ')}`)
}
const total = rows.reduce((s, r) => s + (r.semestre ?? 0), 0)
console.log(`\n  ${rows.length} contrat(s) · ${rows.reduce((s, r) => s + r.eleves, 0)} élèves Diploma`)
console.log(`  ${total.toFixed(2)} € par semestre  →  ${(total * 2).toFixed(2)} € sur l'année\n`)
