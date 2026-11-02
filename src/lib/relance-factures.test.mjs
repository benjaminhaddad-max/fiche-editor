import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./relance-factures.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { relancerFactures } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const LIGNES = [
  { id: 'd1', cycle_month: '2026-10', status: 'sent', invoice_id: null, provider: { brand: 'diploma' } },
  { id: 'd2', cycle_month: '2026-10', status: 'accepted', invoice_id: null, provider: { brand: 'diploma' } },
  { id: 'm1', cycle_month: '2026-10', status: 'sent', invoice_id: null, provider: { brand: 'medibox' } },
  { id: 'facturee', cycle_month: '2026-10', status: 'sent', invoice_id: 'f1', provider: { brand: 'diploma' } },
  { id: 'autre-mois', cycle_month: '2026-09', status: 'sent', invoice_id: null, provider: { brand: 'diploma' } },
]

const lire = (ligne, champ) => champ.split('.').reduce((v, c) => v?.[c], ligne)

/** Joue les filtres de la requête sur LIGNES, comme le ferait la base. */
function fausseBase() {
  const requete = {
    filtres: [],
    from: () => requete,
    select: () => requete,
    eq: (champ, valeur) => (requete.filtres.push((l) => lire(l, champ) === valeur), requete),
    in: (champ, valeurs) => (requete.filtres.push((l) => valeurs.includes(lire(l, champ))), requete),
    is: (champ, valeur) => (requete.filtres.push((l) => lire(l, champ) === valeur), requete),
    then: (ok) => ok({ data: LIGNES.filter((l) => requete.filtres.every((f) => f(l))) }),
  }
  return requete
}

test('chaque école ne relance que ses bordereaux', async () => {
  const envoyes = []
  for (const ecole of ['linova', 'diploma', 'medibox']) {
    await relancerFactures(fausseBase(), '2026-10', ecole, async (id) => (envoyes.push(id), true))
  }
  assert.deepEqual(envoyes.sort(), ['d1', 'd2', 'm1'])
})

test('une relance qui échoue ne compte pas', async () => {
  const r = await relancerFactures(fausseBase(), '2026-10', 'diploma', async (id) => id === 'd1')
  assert.deepEqual(r, { relances: 1 })
})
