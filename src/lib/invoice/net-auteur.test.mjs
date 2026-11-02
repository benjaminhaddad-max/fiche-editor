import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./net-auteur.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { netAuteur } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const brut = (total_ht) => ({ total_ht, pay_basis: 'brut' })
const net = (total_ht) => ({ total_ht, pay_basis: 'net' })
const vide = (total_ht) => ({ total_ht, pay_basis: null })

test('brut et net ne s’additionnent pas tels quels : Agathe', () => {
  assert.deepEqual(netAuteur([brut(317), net(54)]), { net: 307.6, sansBase: 0 })
})

test('une ligne nette ne perd rien : Marie', () => {
  assert.deepEqual(netAuteur([net(89)]), { net: 89, sansBase: 0 })
})

test('l’arrondi tombe au centime : Kevin', () => {
  assert.equal(netAuteur([brut(20), brut(160), brut(139.86), brut(190)]).net, 407.89)
})

test('une ligne sans base ne donne aucun net : Faustine', () => {
  assert.deepEqual(netAuteur([vide(140), brut(33), brut(175)]), { net: null, sansBase: 140 })
})

test('sans ligne, rien à affirmer', () => {
  assert.deepEqual(netAuteur([]), { net: null, sansBase: 0 })
})
