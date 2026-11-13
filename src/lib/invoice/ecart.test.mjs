import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./ecart.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { aUnEcart, aVerifier } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

const controle = (expected_ht, read_ht, matches) => ({ expected_ht, read_ht, matches })

test('Agathe : 307,60 lus pour 371,00 prévus, à vérifier', () => {
  assert.equal(aVerifier({ ai_check: controle(371, 307.6, false) }), true)
})

test('sans contrôle ou lecture impossible, pas d\'écart inventé', () => {
  assert.equal(aUnEcart({ ai_check: null }), false)
  assert.equal(aUnEcart({}), false)
  assert.equal(aUnEcart({ ai_check: controle(371, null, null) }), false)
})

test('un écart validé par un administrateur n\'est plus à vérifier', () => {
  const f = { ai_check: controle(371, 307.6, false), ecart_valide_at: '2026-11-13T10:00:00Z' }
  assert.equal(aUnEcart(f), true)
  assert.equal(aVerifier(f), false)
})

test('montants égaux au centime : rien à vérifier', () => {
  assert.equal(aVerifier({ ai_check: controle(371, 371, true) }), false)
})

test('un contrôle périmé (matches vrai mais montants différents) est rattrapé', () => {
  assert.equal(aVerifier({ ai_check: controle(371, 307.6, true) }), true)
})
