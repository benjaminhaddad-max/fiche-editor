import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./echeancier.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { profilEcheancier, versementCeMois, moisDeVersement } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('les étiquettes saisies à la main sont reconnues', () => {
  for (const tags of [['tuteur'], ['Tutrice'], ['Coach Medibox'], ['Coach', 'Tuteur'], ['coach']]) {
    assert.equal(profilEcheancier(tags), 'tuteur_coach', tags.join(','))
  }
  for (const tags of [['prof'], [], null, ['test'], ['prof', 'tuteur']]) {
    assert.equal(profilEcheancier(tags), 'mensuel', String(tags))
  }
})

test('un tuteur Medibox n’est pas payé en novembre, un prof si', () => {
  assert.equal(versementCeMois('2026-11', ['tuteur'], 'medibox'), false)
  assert.equal(versementCeMois('2026-11', ['prof'], 'medibox'), true)
  assert.equal(versementCeMois('2026-10', ['coach'], 'medibox'), true)
  assert.equal(versementCeMois('2026-12', ['coach'], 'medibox'), true)
})

test('les autres écoles restent mensuelles', () => {
  assert.equal(versementCeMois('2026-11', ['tuteur'], 'diploma'), true)
  assert.equal(versementCeMois('2026-11', ['tuteur'], null), true)
})

test('le travail de novembre d’un coach part en décembre', () => {
  assert.equal(moisDeVersement('2026-11', ['Coach Medibox'], 'medibox'), '2026-12')
  assert.equal(moisDeVersement('2026-11', ['prof'], 'medibox'), '2026-11')
  assert.equal(moisDeVersement('2026-09', ['tuteur'], 'medibox'), '2026-09')
})
