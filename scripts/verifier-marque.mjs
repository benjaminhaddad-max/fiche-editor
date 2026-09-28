#!/usr/bin/env node
/**
 * Aucune requête ne doit lire l'autre école.
 *
 *   node scripts/verifier-marque.mjs
 *
 * Six tables portent une marque. Toute lecture qui ne la borne pas rend les
 * lignes des deux écoles — et elle le fait en silence, sans erreur, sans
 * rien à l'écran qui le signale. C'est exactement le genre de défaut qu'on
 * ne découvre que le jour où un directeur voit les prestataires du voisin.
 *
 * Ce contrôle relit le code et refuse toute requête qui n'est bornée ni par
 * la marque, ni par une clé venue d'une requête déjà bornée. Il tourne au
 * même titre que le lint : une requête ajoutée demain sans borne fait
 * échouer la vérification plutôt que de fuir.
 *
 * Les écritures ne sont pas contrôlées ici : trois déclencheurs en base
 * (voir supabase/32_facture_marque.sql) reportent la marque du prestataire
 * sur ses prestations, factures et contrats quelle que soit la voie.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TABLES = [
  'inv_users', 'inv_providers', 'inv_missions',
  'inv_invoices', 'inv_coaching_contracts', 'inv_categories',
]

const MARQUE = /\.eq\('brand'|\.in\('brand'/
/** Une clé qui ne peut venir que d'une requête déjà bornée. */
const CLE = /\.eq\('(id|user_id|provider_id|auth_id|contract_id|invoice_id|statement_id|signature_token|payroll_batch_id|declaration_id)'|\.in\('(id|statement_id|provider_id|invoice_id)'|\.match\(/
const ECRITURE = /^\s*\.(insert|upsert)\(/m

/**
 * La chaîne d'appels qui suit `.from(...)`, jusqu'à son terme.
 *
 * Découper sur un saut de ligne ne marche pas : un `.update({ … })` occupe
 * dix lignes, et le `.eq('id', …)` qui borne la requête vient après. On suit
 * donc la profondeur des parenthèses, et on s'arrête quand la chaîne cesse.
 */
function chaine(txt, depart) {
  let d = 0
  let i = depart
  for (; i < txt.length; i++) {
    const c = txt[i]
    if ('([{'.includes(c)) d++
    else if (')]}'.includes(c)) {
      d--
      if (d < 0) break
    } else if (d === 0 && c === '\n') {
      // Fin de ligne hors parenthèses : la chaîne continue seulement si la
      // ligne suivante reprend par un point.
      const suite = txt.slice(i + 1)
      const prochain = suite.search(/\S/)
      if (prochain < 0 || suite[prochain] !== '.') break
    }
  }
  return txt.slice(depart, i)
}

function fichiers(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...fichiers(p))
    else if (/\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const fautifs = []
for (const f of fichiers('src')) {
  const txt = readFileSync(f, 'utf8')
  const re = new RegExp(`\\.from\\('(${TABLES.join('|')})'\\)`, 'g')
  let m
  while ((m = re.exec(txt))) {
    const ligne = txt.slice(0, m.index).split('\n').length
    const bloc = chaine(txt, m.index + m[0].length)
    if (ECRITURE.test(bloc) || MARQUE.test(bloc) || CLE.test(bloc)) continue
    fautifs.push(`${f}:${ligne}  ${m[1]}`)
  }
}

if (fautifs.length) {
  console.error(`\n✗ ${fautifs.length} requête(s) sans borne d'école :\n`)
  for (const x of fautifs.sort()) console.error('   ' + x)
  console.error(
    '\n  Ajoutez .eq(\'brand\', getBrandId()) — ou .in(\'brand\', brandScope())\n' +
    '  pour les catégories, qui peuvent être communes aux deux écoles.\n'
  )
  process.exit(1)
}
console.log('\n✓ Toutes les lectures sont bornées à leur école.\n')
