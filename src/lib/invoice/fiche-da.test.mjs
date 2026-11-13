import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. fiche-da importe net-auteur : on transpile les deux.
const js = (f) =>
  ts.transpileModule(readFileSync(new URL(f, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
const url = (t) => `data:text/javascript;base64,${Buffer.from(t).toString('base64')}`
const net = url(js('./net-auteur.ts'))
const { manquesFicheDA, statutCalcule, alertesFicheDA } = await import(
  url(js('./fiche-da.ts').replace(/from ['"]\.\/net-auteur['"]/, `from '${net}'`))
)

const complete = {
  social_security_number: '180017505601289',
  address_line1: '1 rue A',
  postal_code: '75001',
  city: 'Paris',
  country: 'France',
  tax_residence_country: 'France',
  iban: 'FR76...',
}

test('fiche complète en modèle 2', () => {
  assert.deepEqual(manquesFicheDA(complete, []), [])
  assert.equal(statutCalcule(complete, []), 'complete')
})

test('non-résident : attestation de résidence exigée, statut à valider une fois complet', () => {
  const f = { ...complete, country: 'Pays-Bas', tax_residence_country: 'Pays-Bas' }
  assert.ok(manquesFicheDA(f, []).includes('attestation de résidence fiscale'))
  assert.equal(statutCalcule(f, [{ kind: 'residence_fiscale', expires_at: null }]), 'a_valider')
})

test('modèle 4 : A1 et copie exigés', () => {
  const f = { ...complete, tax_residence_country: 'Pays-Bas', da_model: '4' }
  const m = manquesFicheDA(f, [{ kind: 'residence_fiscale', expires_at: null }])
  assert.ok(m.includes('numéro et date de début du A1'))
  assert.ok(m.includes('copie du formulaire A1'))
})

test('alertes : échéance proche, expiré, adresse étrangère sans résidence', () => {
  const j = '2026-11-13'
  const a = alertesFicheDA(complete, [{ kind: 'a1', expires_at: '2026-12-01' }, { kind: 'residence_fiscale', expires_at: '2026-10-01' }], j)
  assert.ok(a.some((x) => x.niveau === 'orange' && /A1 expire/.test(x.texte)))
  assert.ok(a.some((x) => x.niveau === 'rouge' && /résidence/.test(x.texte)))
  const b = alertesFicheDA({ ...complete, tax_residence_country: null, country: 'Pays-Bas' }, [], j)
  assert.ok(b.some((x) => /sans résidence fiscale/.test(x.texte)))
  const c = alertesFicheDA({ ...complete, tax_residence_country: 'Pays-Bas', da_model: '4', a1_number: 'X', a1_start: '2024-01-01', a1_end: '2025-01-01' }, [], j)
  assert.ok(c.some((x) => /modèle 3/.test(x.texte)))
})
