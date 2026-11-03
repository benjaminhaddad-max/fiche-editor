import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./net-auteur.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { netAuteur, detailPrecompte, PRECOMPTE_AFFICHE } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

const brut = (total_ht) => ({ total_ht, pay_basis: 'brut' })
const net = (total_ht) => ({ total_ht, pay_basis: 'net' })
const vide = (total_ht) => ({ total_ht, pay_basis: null })

test('le taux 2026 est de 16,03 %, pas 20 %', () => {
  assert.equal(PRECOMPTE_AFFICHE, '16,03 %')
})

test('1 000 € brut donnent 839,70 € net, comme la calculette de la SGDL', () => {
  assert.deepEqual(detailPrecompte(1000).map((l) => l.montant), [61.5, 90.39, 4.91, 3.5])
  assert.equal(netAuteur([brut(1000)]).net, 839.7)
})

test('une ligne déjà nette ne repasse pas au précompte : Agathe', () => {
  assert.equal(netAuteur([brut(317), net(54)]).net, 320.18)
})

test('une ligne nette ne perd rien : Marie', () => {
  assert.equal(netAuteur([net(89)]).net, 89)
})

test('le précompte porte sur le brut de la facture entière : Kevin', () => {
  assert.equal(netAuteur([brut(20), brut(160), brut(139.86), brut(190)]).net, 428.13)
})

test('une ligne sans base perd son précompte comme un brut : Paul', () => {
  assert.equal(netAuteur([vide(140), brut(33), brut(175)]).net, 292.21)
})

test('brut moins les retenues donne exactement le net', () => {
  for (const b of [211, 500.5, 1400, 267, 335.2, 509.86]) {
    const r = netAuteur([brut(b)])
    const retenu = r.precompte.reduce((t, l) => t + l.montant, 0)
    assert.equal(Math.round((b - retenu) * 100) / 100, r.net)
  }
})

test('sans ligne, rien à affirmer', () => {
  assert.equal(netAuteur([]).net, null)
})

// Le net estimé du formulaire de déclaration passe par le même calcul.
const estime = (b) => netAuteur([brut(b)]).net

test('net estimé : décimales et centime, comme au paiement', () => {
  assert.equal(estime(211), 177.17)
  assert.equal(estime(0.01), 0.01)
})

test('net estimé : un très gros brut ne dérive pas', () => {
  assert.equal(estime(1234567.89), 1036663.57)
})

test('net estimé : un brut nul donne zéro, pas une erreur', () => {
  assert.equal(estime(0), 0)
})
