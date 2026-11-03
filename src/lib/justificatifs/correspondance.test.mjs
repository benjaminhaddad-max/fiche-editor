import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./correspondance.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { candidats, rapprochementSur, nomCoherent } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

const mvt = (id, date, montant, libelle, fournisseur = null) => ({ id, date, montant, libelle, fournisseur })
const recu = (montant, date, fournisseur, marque = null, devise = 'EUR') => ({ montant, date, fournisseur, marque, devise })

test('un seul mouvement au centime et au bon nom : dépôt sûr', () => {
  const r = recu(200, '2026-10-29', 'Google Cloud France SARL', 'Google Cloud')
  const l = candidats(r, [mvt(1, '2026-10-31', 200, 'Google CLOUD 8zTMJB'), mvt(2, '2026-10-31', 200.01, 'Google ADS2052726146')])
  assert.equal(rapprochementSur(r, l)?.id, 1)
})

test('deux paiements identiques dans la fenêtre : on laisse choisir', () => {
  const r = recu(20, '2026-10-10', 'Anthropic, PBC', 'Anthropic')
  const l = candidats(r, [mvt(1, '2026-10-09', 20, 'ANTHROPIC'), mvt(2, '2026-10-12', 20, 'ANTHROPIC')])
  assert.equal(l.length, 2)
  assert.equal(rapprochementSur(r, l), null)
})

test('hors des cinq jours : pas candidat', () => {
  const r = recu(20, '2026-10-01', 'Anthropic, PBC')
  assert.equal(candidats(r, [mvt(1, '2026-10-07', 20, 'ANTHROPIC')]).length, 0)
})

test('même montant mais autre nom : proposé, jamais déposé seul', () => {
  const r = recu(36.61, '2026-10-05', 'Railway Corporation', 'Railway')
  const l = candidats(r, [mvt(1, '2026-10-06', 36.61, 'FRANPRIX')])
  assert.equal(l.length, 1)
  assert.equal(rapprochementSur(r, l), null)
})

test('le nom commercial suffit : Anysphere payé sous « CURSOR »', () => {
  assert.ok(nomCoherent({ fournisseur: 'Anysphere, Inc.', marque: 'Cursor' }, { libelle: 'CURSOR, AI POWERED IDE', fournisseur: null }))
  assert.ok(nomCoherent({ fournisseur: 'Eleven Labs Inc.', marque: 'ElevenLabs' }, { libelle: 'ELEVENLABS.IO', fournisseur: null }))
  assert.ok(!nomCoherent({ fournisseur: 'Uber B.V.', marque: 'Uber Eats' }, { libelle: 'DELIVEROO', fournisseur: null }))
})

test('un reçu en dollars n’est jamais déposé seul', () => {
  const r = recu(100, '2026-10-10', 'OpenAI, LLC', 'OpenAI', 'USD')
  const l = candidats(r, [mvt(1, '2026-10-11', 86.4, 'OPENAI')])
  assert.equal(l.length, 1)
  assert.equal(rapprochementSur(r, l), null)
})

test('un reçu en dollars se désigne par la carte et l’heure', () => {
  // Le reçu Anthropic du 23/10/2026 : mail à 16 h 21 min 44 s, paiement vu en banque à 16 h 20 min 24 s.
  const r = { ...recu(120.06, '2026-10-23', 'Anthropic, PBC', 'Anthropic', 'USD'), carte: '7514', horodatage: '2026-10-23T16:21:44Z' }
  const l = candidats(r, [
    { ...mvt(1, '2026-10-24', 107.31, 'ANTHROPIC'), carte: '7514', creeLe: '2026-10-23T16:20:24Z' },
    { ...mvt(2, '2026-10-24', 108.06, 'ANTHROPIC'), carte: '7514', creeLe: '2026-10-23T13:41:04Z' },
    { ...mvt(3, '2026-10-23', 107.62, 'ANTHROPIC'), carte: '3374', creeLe: '2026-10-23T16:22:00Z' },
  ])
  assert.equal(l.length, 2, 'la carte 3374 est écartée')
  assert.equal(rapprochementSur(r, l)?.id, 1)
})

test('deux euros identiques le même jour : l’heure départage', () => {
  const r = { ...recu(21.6, '2026-10-27', 'Anthropic, PBC', 'Claude'), horodatage: '2026-10-27T09:00:30Z' }
  const l = candidats(r, [
    { ...mvt(1, '2026-10-27', 21.6, 'ANTHROPIC* CLAUDE SUB'), creeLe: '2026-10-27T08:59:58Z' },
    { ...mvt(2, '2026-10-27', 21.6, 'ANTHROPIC* CLAUDE SUB'), creeLe: '2026-10-27T15:10:00Z' },
  ])
  assert.equal(rapprochementSur(r, l)?.id, 1)
})
