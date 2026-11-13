import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test.
const js = ts.transpileModule(readFileSync(new URL('./urssaf-da.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { eligibiliteDA, categoriesAValider, lireHistoriqueCsv, cleTrimestre, montant, dateIso, cumulParAuteur, declarationEnCsv } =
  await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

test('éligibilité : œuvres originales oui, cours / coach / tutorat à valider', () => {
  assert.equal(eligibiliteDA('Fiches de cours'), 'eligible')
  assert.equal(eligibiliteDA('QCM'), 'eligible')
  assert.equal(eligibiliteDA('Schémas'), 'eligible')
  assert.equal(eligibiliteDA('Actualisation Lille'), 'eligible')
  assert.equal(eligibiliteDA('Cours/ED Marseille'), 'a_valider')
  assert.equal(eligibiliteDA('Coach Hermione'), 'a_valider')
  assert.equal(eligibiliteDA('Tutorat Lille'), 'a_valider')
  assert.equal(eligibiliteDA(null), 'a_valider')
  assert.deepEqual(categoriesAValider(['Coach Lille', 'Actualisation Lille', 'Coach Lille', 'Cours/ED Bordeaux']), [
    'Coach Lille',
    'Cours/ED Bordeaux',
  ])
})

test('lecture des formats français', () => {
  assert.equal(montant('1 234,56 €'), 1234.56)
  assert.equal(montant('1.234,5'), 1234.5)
  assert.equal(montant('1,234.5'), 1234.5)
  assert.equal(montant(''), null)
  assert.ok(Number.isNaN(montant('abc')))
  assert.equal(dateIso('5/3/2025'), '2025-03-05')
  assert.equal(dateIso('2025-03-15'), '2025-03-15')
  assert.equal(dateIso(''), null)
  assert.equal(dateIso('mars'), undefined)
  assert.equal(cleTrimestre('T1 2025'), '2025-T1')
  assert.equal(cleTrimestre('2026-T3'), '2026-T3')
  assert.equal(cleTrimestre('Q2 2026'), '2026-T2')
  assert.equal(cleTrimestre('1T2025'), '2025-T1')
  assert.equal(cleTrimestre(''), null)
})

test('import : valeurs reprises telles quelles, rien de déduit', () => {
  const csv = '﻿Trimestre;Date de versement;Auteur;N° sécurité sociale;Brut;Précompte;Net versé;Contribution diffuseur\n' +
    'T1 2025;15/02/2025;Dupont Marie;1 80 01 75 056 012 89;1000,00;160,30;839,70;11,00\n' +
    ';20/05/2025;Martin Paul;;500;;;\n' +
    'Total;;;;1500;;;\n' +
    ';;Sans Date;;100;;;\n' +
    'T3 2025;mars;Durand;;100;;;\n' +
    'T3 2025;;Erreur;;cent;;;\n' +
    ';;;;;;;\n'
  const r = lireHistoriqueCsv(csv)
  assert.equal(r.lignes.length, 2)
  const [a, b] = r.lignes
  assert.deepEqual(
    { t: a.trimestre, d: a.date_versement, s: a.secu, brut: a.brut, p: a.precompte, net: a.net, c: a.contribution },
    { t: '2025-T1', d: '2025-02-15', s: '180017505601289', brut: 1000, p: 160.3, net: 839.7, c: 11 }
  )
  // Trimestre tiré de la date ; montants absents laissés vides, pas calculés.
  assert.equal(b.trimestre, '2025-T2')
  assert.equal(b.brut, 500)
  assert.equal(b.precompte, null)
  assert.equal(b.net, null)
  assert.equal(b.contribution, null)
  assert.equal(b.ligne_source['Auteur'], 'Martin Paul')
  assert.deepEqual(r.rejets.map((x) => x.ligne), [5, 6, 7])
})

test('import : séparateur virgule et colonne Nom', () => {
  const r = lireHistoriqueCsv('Nom,Date,Brut\n"Lefèvre, Anne",2026-04-02,"1 200,00"\n')
  assert.equal(r.lignes.length, 1)
  assert.equal(r.lignes[0].auteur, 'Lefèvre, Anne')
  assert.equal(r.lignes[0].trimestre, '2026-T2')
  assert.equal(r.lignes[0].brut, 1200)
})

test('import : sans colonne auteur, refus clair', () => {
  const r = lireHistoriqueCsv('Date;Brut\n2025-01-01;10\n')
  assert.equal(r.lignes.length, 0)
  assert.match(r.rejets[0].raison, /Auteur/)
})

test('cumul par auteur et trimestre, sources séparées', () => {
  const base = (o) => ({
    trimestre: '2026-T4', auteur: 'A', secu: '1', brut: 100, precompte: { CSG: 9 }, totalPrecompte: 16.03,
    net: 83.97, contribution: 1.1, source: 'invoice', provisoire: false, aValider: [], ...o,
  })
  const c = cumulParAuteur([
    base({}),
    base({ provisoire: true, aValider: ['Coach Lille'] }),
    base({ source: 'historique', precompte: {}, totalPrecompte: null, net: null }),
    base({ trimestre: '2026-T3' }),
  ])
  assert.equal(c.length, 3)
  const t4 = c.find((l) => l.trimestre === '2026-T4' && l.source === 'invoice')
  assert.equal(t4.brut, 200)
  assert.equal(t4.precompte.CSG, 18)
  assert.equal(t4.provisoire, true)
  assert.deepEqual(t4.aValider, ['Coach Lille'])
  const h = c.find((l) => l.source === 'historique')
  assert.equal(h.net, null)
  const csv = declarationEnCsv(c, ['CSG'], (t) => (t === '2026-T3' ? '15/10/2026' : null))
  assert.match(csv, /2026-T3;déclaré le 15\/10\/2026;A/)
  assert.match(csv, /Coach Lille : à valider par le comptable/)
})
