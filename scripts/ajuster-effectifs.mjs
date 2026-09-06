#!/usr/bin/env node
/**
 * Réaligne les contrats de coaching sur les effectifs réels de Diploma Lab.
 *
 *   node --experimental-websocket scripts/ajuster-effectifs.mjs           aperçu
 *   node --experimental-websocket scripts/ajuster-effectifs.mjs --apply   applique
 *
 * L'article 6.1 du contrat prévoit l'ajustement : « toute évolution de cet
 * effectif en cours de semestre donne lieu à un ajustement de la
 * rémunération au prorata du nombre d'étudiants et de la durée effective
 * du suivi ».
 *
 * Les échéances DÉJÀ ouvertes ne sont jamais retouchées : elles ont été
 * annoncées aux coachs, certaines sont peut-être déjà facturées. L'écart est
 * reporté sur les échéances à venir — ce qui réalise au passage le prorata
 * temporel voulu par le contrat.
 *
 * Les contrats au forfait (sans barème) sont laissés de côté.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const LAB_DIR = process.env.LAB_DIR
  ?? '/Users/benjaminhaddad-diplomasante/Desktop/Plateformes Ben/EXOTEACHBIS-main'
const labEnv = {}
for (const l of readFileSync(`${LAB_DIR}/.env.local`, 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) labEnv[m[1]] = m[2].trim()
}
if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const APPLY = process.argv.includes('--apply')
const lab = createClient(labEnv.NEXT_PUBLIC_SUPABASE_URL, labEnv.SUPABASE_SERVICE_ROLE_KEY)
const inv = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const EXCLURE = /test|démo|demo|apple review/i
const estCompteInterne = (e) => /@diploma-sante\.fr$/i.test(e ?? '')
const euro = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
  .format(Number(v)).replace(/ /g, ' ')

// ---------- effectifs réels ----------
const { data: assigns, error } = await lab.from('coach_groupe_assignments')
  .select('groupe_id, groupe:groupes(name), coach:profiles(email)')
if (error) { console.error('Diploma Lab injoignable.'); process.exit(1) }

const reel = new Map()
for (const a of assigns) {
  if (EXCLURE.test(a.groupe?.name ?? '')) continue
  const { data: el } = await lab.from('profiles').select('email')
    .eq('groupe_id', a.groupe_id).eq('role', 'eleve').eq('brand', 'diploma')
  const n = (el ?? []).filter((e) => !estCompteInterne(e.email)).length
  if (!n) continue
  const k = a.coach?.email?.toLowerCase()
  reel.set(k, (reel.get(k) ?? 0) + n)
}

// ---------- contrats au prorata ----------
const { data: contrats } = await inv.from('inv_coaching_contracts')
  .select(`id, lab_coach_email, headcount, total_ht, rate_base_amount, rate_base_headcount,
           semesters, provider:inv_providers(legal_name),
           instalments:inv_contract_instalments(id, label, due_date, amount_ht, sort_order, mission_id)`)
  .not('rate_base_amount', 'is', null)
  .order('total_ht', { ascending: false })

console.log(`\n${APPLY ? 'Ajustement' : 'Aperçu'} — ${contrats.length} contrats au prorata\n`)

let modifies = 0, ecartTotal = 0
for (const c of contrats) {
  const n = reel.get(c.lab_coach_email?.toLowerCase())
  if (n === undefined) { console.log(`  ? ${c.provider?.legal_name} : introuvable dans Diploma Lab`); continue }
  if (n === c.headcount) continue

  const semestre = Math.round(Number(c.rate_base_amount) * n / c.rate_base_headcount * 100) / 100
  const nouveauTotal = Math.round(semestre * c.semesters * 100) / 100

  const ouvertes = c.instalments.filter((i) => i.mission_id)
  const aVenir = c.instalments.filter((i) => !i.mission_id).sort((a, b) => a.sort_order - b.sort_order)
  if (!aVenir.length) {
    console.log(`  ⚠ ${c.provider?.legal_name} : toutes les échéances sont ouvertes, ajustement impossible`)
    continue
  }

  const dejaEngage = ouvertes.reduce((s, i) => s + Number(i.amount_ht), 0)

  // Chaque semestre est traité pour lui-même : le semestre déjà entamé
  // absorbe l'écart sur ses échéances restantes, le suivant repart d'un
  // 30/40/30 propre. Étaler l'écart sur toute l'année produirait des
  // montants bancals jusqu'en mai sans raison.
  const REPARTITION = [0.3, 0.4, 0.3]
  const semestreDe = (i) => (i.sort_order <= 3 ? 1 : 2)
  const nouvelles = []

  for (const sem of [1, 2]) {
    const duSemestre = aVenir.filter((i) => semestreDe(i) === sem)
    if (!duSemestre.length) continue

    const ouvertesDuSemestre = ouvertes.filter((i) => semestreDe(i) === sem)
    const engage = ouvertesDuSemestre.reduce((s, i) => s + Number(i.amount_ht), 0)
    const aRepartir = Math.round((semestre - engage) * 100) / 100

    let cumul = 0
    duSemestre.forEach((i, idx) => {
      const dernier = idx === duSemestre.length - 1
      // Sans échéance déjà ouverte, on applique le barème d'origine ;
      // sinon on répartit le solde à parts proportionnelles.
      const poids = ouvertesDuSemestre.length === 0
        ? REPARTITION[(i.sort_order - 1) % 3]
        : REPARTITION[(i.sort_order - 1) % 3] /
          duSemestre.reduce((s, j) => s + REPARTITION[(j.sort_order - 1) % 3], 0)
      const montant = dernier
        ? Math.round((aRepartir - cumul) * 100) / 100
        : Math.round(aRepartir * poids * 100) / 100
      cumul += montant
      nouvelles.push({ ...i, nouveau: montant })
    })
  }

  const delta = nouveauTotal - Number(c.total_ht)
  ecartTotal += delta
  modifies++

  console.log(`  ${c.provider?.legal_name}`)
  console.log(`     effectif ${c.headcount} → ${n}   ·   année ${euro(c.total_ht)} → ${euro(nouveauTotal)}   (${delta >= 0 ? '+' : ''}${delta.toFixed(2)} €)`)
  console.log(`     ${ouvertes.length} échéance(s) déjà ouverte(s) inchangée(s) : ${euro(dejaEngage)}`)
  console.log(`     ${aVenir.length} à venir : ${nouvelles.map((x) => `${x.due_date.slice(5)} ${euro(x.amount_ht)}→${euro(x.nouveau)}`).join('  ')}`)

  if (!APPLY) continue

  const { error: e1 } = await inv.from('inv_coaching_contracts').update({
    headcount: n,
    total_ht: nouveauTotal,
    headcount_fixed_at: new Date().toISOString().slice(0, 10),
  }).eq('id', c.id)
  if (e1) { console.log(`     ✗ contrat : ${e1.message}`); continue }

  for (const x of nouvelles) {
    const { error: e2 } = await inv.from('inv_contract_instalments')
      .update({ amount_ht: x.nouveau }).eq('id', x.id)
    if (e2) console.log(`     ✗ échéance ${x.due_date} : ${e2.message}`)
  }
  console.log('     ✓ appliqué')
}

console.log(`\n  ${modifies} contrat(s) à ajuster · ${ecartTotal >= 0 ? '+' : ''}${ecartTotal.toFixed(2)} €/an`)
console.log(APPLY ? '\n✓ Ajustements enregistrés.\n' : '\n(aperçu — relancez avec --apply)\n')
