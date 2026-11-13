import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./net-auteur.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { netAuteur, detailPrecompte, PRECOMPTE_AFFICHE, brutPourNet, modeleEffectif, tauxAffiche } = await import(
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

test('un net fixé est remonté au brut : Agathe (317 brut + 54 net)', () => {
  const r = netAuteur([brut(317), net(54)])
  // 317 brut -> 266,18 net ; 54 net fixé -> 64,31 brut ; le net total est 320,18
  assert.equal(r.net, 320.18)
  assert.equal(r.brutDeduit, 64.31)
  assert.equal(r.brutTotal, 381.31)
})

test('un net fixé garde son net : Marie (89 net)', () => {
  const r = netAuteur([net(89)])
  assert.equal(r.net, 89)
  assert.equal(r.brutTotal, 105.99)
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

const somme = (r) => Math.round(r.precompte.reduce((t, l) => t + l.montant, 0) * 100) / 100

test('modèle 2 : 952,72 brut donnent 800,00 net, retenues 58,59 + 86,12 + 4,68 + 3,33', () => {
  const r = netAuteur([brut(952.72)], 2)
  assert.deepEqual(r.precompte.map((l) => l.montant), [58.59, 86.12, 4.68, 3.33])
  assert.equal(somme(r), 152.72)
  assert.equal(r.net, 800)
})

test('modèle 2 : 1 400 net fixé donnent 1 667,27 brut', () => {
  const r = netAuteur([net(1400)], 2)
  assert.equal(r.brutTotal, 1667.27)
  assert.equal(r.net, 1400)
  assert.equal(somme(r), 267.27)
})

test('modèle 3 : 6,5 % sans CSG ni CRDS, 1 400 net donnent 1 497,33 brut', () => {
  assert.equal(tauxAffiche(3), '6,5 %')
  const r = netAuteur([net(1400)], 3)
  assert.equal(r.brutTotal, 1497.33)
  assert.equal(somme(r), 97.33)
  assert.equal(r.net, 1400)
  assert.deepEqual(r.precompte.map((l) => l.libelle), ['Vieillesse plafonnée', 'Formation professionnelle'])
})

test('modèle 3 : 1 400 brut donnent 1 309,00 net', () => {
  assert.equal(netAuteur([brut(1400)], 3).net, 1309)
})

test('modèle 4 : le brut est égal au net, sans retenue', () => {
  const r = netAuteur([brut(1400)], 4)
  assert.equal(r.net, 1400)
  assert.deepEqual(r.precompte, [])
  const n = netAuteur([net(1400)], 4)
  assert.equal(n.brutTotal, 1400)
  assert.equal(n.net, 1400)
})

test('la contribution du diffuseur reste due en modèle 4 : 1,1 %', () => {
  assert.equal(netAuteur([brut(1400)], 4).contributionDiffuseur, 15.4)
})

test('remonter au brut retombe sur le net au centime, pour tous les modèles', () => {
  for (const m of [2, 3]) {
    for (let n = 1; n <= 3000; n += 7.13) {
      const v = Math.round(n * 100) / 100
      const r = netAuteur([net(v)], m)
      assert.equal(r.net, v)
      assert.equal(Math.round((r.brutTotal - somme(r)) * 100) / 100, v)
      assert.ok(Math.abs(r.brutTotal - brutPourNet(v, m).brut) < 0.005)
    }
  }
})

test('modèle effectif : sans fiche ou modèle 1 ou 2, c\'est le 2', () => {
  assert.equal(modeleEffectif(null).modele, 2)
  assert.equal(modeleEffectif({ da_model: '1' }).modele, 2)
  assert.equal(modeleEffectif({ da_model: '2' }).modele, 2)
  assert.equal(modeleEffectif({ da_model: '3' }).modele, 3)
})

test('modèle 4 sans A1 valide : repli sur le 3 avec la mention', () => {
  const sans = modeleEffectif({ da_model: '4' }, '2026-11-13')
  assert.equal(sans.modele, 3)
  assert.equal(sans.repli, true)
  assert.equal(sans.mention, 'A1 absent ou expiré : modèle 3 appliqué')
  const expire = modeleEffectif(
    { da_model: '4', a1_number: 'X', a1_start: '2024-01-01', a1_end: '2025-12-31' },
    '2026-11-13',
  )
  assert.equal(expire.modele, 3)
  const valide = modeleEffectif(
    { da_model: '4', a1_number: 'X', a1_start: '2026-01-01', a1_end: '2026-12-31' },
    '2026-11-13',
  )
  assert.equal(valide.modele, 4)
  assert.equal(valide.repli, false)
})

test('modèle suggéré : résidence, A1', async () => {
  const { modeleSuggere } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  assert.equal(modeleSuggere({}).modele, null)
  assert.equal(modeleSuggere({ tax_residence_country: 'France' }).modele, 2)
  assert.equal(modeleSuggere({ tax_residence_country: 'FR', a1_number: 'X', a1_start: '2026-01-01' }, '2026-11-13').modele, 2)
  assert.equal(modeleSuggere({ tax_residence_country: 'Pays-Bas' }, '2026-11-13').modele, 3)
  assert.equal(
    modeleSuggere({ tax_residence_country: 'Pays-Bas', a1_number: 'X', a1_start: '2026-01-01', a1_end: '2026-12-31' }, '2026-11-13').modele,
    4
  )
  const exp = modeleSuggere({ tax_residence_country: 'Pays-Bas', a1_number: 'X', a1_start: '2024-01-01', a1_end: '2025-12-31' }, '2026-11-13')
  assert.equal(exp.modele, 3)
  assert.match(exp.raison, /expiré/)
  // Sans choix sur la fiche, le modèle suit la suggestion.
  assert.equal(modeleEffectif({ tax_residence_country: 'Belgique' }, '2026-11-13').modele, 3)
  assert.equal(modeleEffectif({ tax_residence_country: 'Belgique', da_model: '2' }, '2026-11-13').modele, 2)
})

test('modèle figé sur la note : la fiche changée ne refait pas une note émise', async () => {
  const { modeleDeLaNote } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
  const fiche = { tax_residence_country: 'Pays-Bas' }
  // Figé en 2 : reste 2 même si la fiche appelle désormais le 3.
  assert.equal(modeleDeLaNote({ da_model: '2', pdf_path: 'x.pdf', issue_date: '2026-11-01' }, fiche).modele, 2)
  // PDF sans modèle figé : note d'avant le 13/11, calculée en 2.
  assert.equal(modeleDeLaNote({ da_model: null, pdf_path: 'x.pdf', issue_date: '2026-11-01' }, fiche).modele, 2)
  // Pas encore de PDF : suit la fiche.
  assert.equal(modeleDeLaNote({ da_model: null, pdf_path: null, issue_date: '2026-11-13' }, fiche).modele, 3)
  assert.equal(modeleDeLaNote({ da_model: '4', pdf_path: 'x.pdf' }, {}).modele, 4)
})
