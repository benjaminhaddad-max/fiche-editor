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

test('une ligne sans base perd ses 20 % comme un brut : Paul', () => {
  assert.deepEqual(netAuteur([vide(140), brut(33), brut(175)]), { net: 278.4, sansBase: 0 })
})

test('sans ligne, rien à affirmer', () => {
  assert.deepEqual(netAuteur([]), { net: null, sansBase: 0 })
})

// Le net estimé du formulaire de déclaration passe par le même calcul.
const estime = (b) => netAuteur([brut(b)]).net

test('net estimé : décimales et centime, comme au paiement', () => {
  assert.equal(estime(211), 168.8)
  assert.equal(estime(139.86), 111.89)
  assert.equal(estime(0.01), 0.01)
})

test('net estimé : un très gros brut ne dérive pas', () => {
  assert.equal(estime(1234567.89), 987654.31)
})

test('net estimé : un brut nul donne zéro, pas une erreur', () => {
  assert.equal(estime(0), 0)
})
