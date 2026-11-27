import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./lissage-calcul.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { repartir, moisConsecutifs } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('repartir : la somme des parts égale le total', () => {
  for (const [t, n] of [[1000, 5], [1234.57, 4], [0.03, 5], [999.99, 3]]) {
    const p = repartir(t, n)
    assert.equal(p.length, n)
    assert.equal(Math.round(p.reduce((a, b) => a + b, 0) * 100), Math.round(t * 100))
  }
})
test('repartir : la dernière part absorbe l’arrondi', () => {
  assert.deepEqual(repartir(100, 3), [33.33, 33.33, 33.34])
})
test('moisConsecutifs passe l’année', () => {
  assert.deepEqual(moisConsecutifs('2026-11', 4), ['2026-11', '2026-12', '2027-01', '2027-02'])
})
