import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript : on transpile les
// modules et on recâble leurs imports entre eux.
const urls = {}
function charger(chemin, remplacements = {}) {
  let src = readFileSync(new URL(chemin, import.meta.url), 'utf8')
  for (const [de, vers] of Object.entries(remplacements)) src = src.replaceAll(`'${de}'`, `'${vers}'`)
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}
urls.cycle = charger('../cycle.ts')
urls.types = charger('./types.ts')
urls.calendrier = charger('./calendrier.ts', { '@/lib/cycle': urls.cycle })
urls.saisie = charger('./saisie.ts', { './types': urls.types })
urls.fichier = charger('./fichier.ts')

const cal = await import(urls.calendrier)
const sa = await import(urls.saisie)
const fi = await import(urls.fichier)
const C = cal.CALENDRIER_DEFAUT

test('fixes de novembre 2026 : le 25 est un mercredi, rien ne bouge', () => {
  const e = Object.fromEntries(cal.etapesFixes('2026-11', C).map((x) => [x.cle, `${x.date} ${x.heure}`]))
  assert.equal(e.ouverture, '2026-11-25 8')
  assert.equal(e.relance, '2026-11-25 18')
  assert.equal(e.derniere_relance, '2026-11-26 12')
  assert.equal(e.cloture, '2026-11-26 24')
  assert.equal(e.envoi, '2026-11-27 12')
  assert.equal(e.versement, '2026-11-30 12')
})

test('un week-end avance au jour ouvré précédent', () => {
  // 25 avril 2026 est un samedi : ouverture le vendredi 24.
  assert.equal(cal.jourDuMois('2026-04', 25), '2026-04-24')
  // 30 août 2026 est un dimanche : versement le vendredi 28.
  assert.equal(cal.jourDuMois('2026-08', 30), '2026-08-28')
  // Février : le 30 devient le dernier jour (samedi 28/02/2026), donc le vendredi 27.
  assert.equal(cal.jourDuMois('2026-02', 30), '2026-02-27')
})

test('un jour férié avance aussi : le 1er novembre 2026 (dimanche) et le 11', () => {
  assert.equal(cal.jourDuMois('2026-11', 1), '2026-10-30')
  assert.equal(cal.jourDuMois('2026-11', 11), '2026-11-10')
})

test('vacataires d’octobre : relance 2 jours avant la fin, clôture le 1er novembre avancé', () => {
  const e = Object.fromEntries(cal.etapesVacataires('2026-10', C).map((x) => [x.cle, x.date]))
  assert.equal(e.relance, '2026-10-29')
  assert.equal(e.cloture, '2026-10-30') // le 1er novembre est férié et dimanche
  assert.equal(e.envoi, '2026-11-02')
})

test('le mois à saisir suit la clôture', () => {
  // 26 novembre 2026, 23 h à Paris (22 h UTC) : fixes encore sur novembre.
  assert.equal(cal.moisASaisir('fixes', C, new Date('2026-11-26T22:00:00Z')), '2026-11')
  // 27 novembre, 0 h 30 : novembre est clos, on saisit décembre.
  assert.equal(cal.moisASaisir('fixes', C, new Date('2026-11-26T23:30:00Z')), '2026-12')
  // Vacataires le 1er décembre 2026 à 10 h : encore novembre.
  assert.equal(cal.moisASaisir('vacataires', C, new Date('2026-12-01T09:00:00Z')), '2026-11')
  assert.equal(cal.moisASaisir('vacataires', C, new Date('2026-12-01T13:00:00Z')), '2026-12')
})

test('les réglages partiels gardent le reste par défaut', () => {
  const c = cal.completerCalendrier({ vacataires: { versement: 3 } })
  assert.equal(c.vacataires.versement, 3)
  assert.equal(c.vacataires.cloture.jour, 1)
  assert.equal(c.fixes.ouverture.jour, 25)
})

const SAL = { providerId: 'p', userId: null, nom: 'Sofia Klai', email: null, telephone: null, profil: 'alternant', matricule: '00063', entree: null, sortie: null }
const CODES = { conges_payes: '300', sans_solde: '632', arret_maladie: '100', heures_sup: '', transport: '', mutuelle_dispense: '', mutuelle_changement: '', net_vacataire: '' }

test('contrôles : justificatif manquant, transport anormal, matricule', () => {
  const x = sa.lireSaisie({ status: 'a_valider', submitted_at: 'x', transport: true, transport_amount: 150 }, '2026-11')
  const codes = sa.controler(SAL, x, 0).map((a) => a.code)
  assert.deepEqual(codes.sort(), ['justif_transport', 'transport_anormal'])
  assert.deepEqual(sa.controler({ ...SAL, matricule: null }, sa.lireSaisie(null, '2026-11'), 0).map((a) => a.code), ['matricule'])
  assert.ok(sa.controler({ ...SAL, profil: 'vacataire' }, sa.lireSaisie({ status: 'a_valider', submitted_at: 'x' }, '2026-11'), 0).some((a) => a.code === 'sans_mission'))
})

test('export Silae : 50 % du transport, CP avec dates, codes manquants vides et signalés', () => {
  const x = sa.lireSaisie(
    {
      status: 'valide', submitted_at: 'x', transport: true, transport_amount: 90.8,
      paid_leave_days: 2, paid_leave_start: '2026-11-12', paid_leave_end: '2026-11-13',
      overtime_hours: 3, overtime_lines: [{ heures: 3, du: '2026-11-04', au: '2026-11-04', motif: 'JPO', validees_par: 'Ilan Benhamou' }],
    },
    '2026-11'
  )
  const l = sa.lignesSilae(SAL, x, 0, CODES)
  assert.deepEqual(l.map((y) => [y.variable, y.code, y.valeur]), [
    ['conges_payes', '300', 2],
    ['heures_sup', '', 3],
    ['transport', '', 45.4],
  ])
  const csv = sa.csvSilae(l)
  assert.match(csv, /^Matricule;Code;Valeur;Date début;Date fin\r\n00063;300;2;12\/11\/2026;13\/11\/2026\r\n/)
  assert.match(csv, /00063;;45,4;01\/11\/2026;30\/11\/2026/)
  assert.deepEqual(sa.codesManquants(l).map((m) => m.variable), ['heures_sup', 'transport'])
})

test('vacataire : le net des missions part en net, jamais de brut', () => {
  const x = sa.lireSaisie({ status: 'valide', submitted_at: 'x', nothing_to_report: true }, '2026-10')
  const l = sa.lignesSilae({ ...SAL, profil: 'vacataire' }, x, 412.5, CODES)
  assert.deepEqual(l.map((y) => [y.variable, y.valeur]), [['net_vacataire', 412.5]])
})

test('rien à signaler : aucune ligne pour un fixe', () => {
  const x = sa.lireSaisie({ status: 'valide', submitted_at: 'x', nothing_to_report: true }, '2026-11')
  assert.equal(sa.lignesSilae({ ...SAL, profil: 'fixe' }, x, 0, CODES).length, 0)
})

test('import : la liste « Personnel présent » de Silae (Matricule, Salarié)', () => {
  const table = fi.lireCsv('Personnel présent - Octobre 2026;\nMatricule;Salarié\n00057;AL-MGADMEE Danial\n00060;YAPO Sun, Mhaude\n')
  const { lignes } = fi.lignesImport(table)
  assert.deepEqual(lignes.map((l) => [l.matricule, l.nom]), [['00057', 'AL-MGADMEE Danial'], ['00060', 'YAPO Sun, Mhaude']])
  assert.ok(fi.memePersonne('AL-MGADMEE Danial', 'Danial Almgadmee'))
  assert.ok(fi.memePersonne('YAPO Sun, Mhaude', 'Mhaude Yapo'))
  assert.ok(fi.memePersonne('CORNET Samantha née OHANA', 'Samantha Cornet'))
  assert.ok(!fi.memePersonne('Mathilde', 'Mathilde Durand'))
  assert.ok(!fi.memePersonne('HADDAD Benjamin', 'Benjamin Cohen'))
})

test('import : un matricule numérique retrouve ses zéros, les colonnes facultatives sont lues', () => {
  const { lignes } = fi.lignesImport([
    ['Matricule', 'Nom', 'Prénom', 'Email', 'Type de contrat', 'Date d’entrée', 'Date de sortie'],
    [63, 'KLAI', 'Sofia', 'S@X.FR', 'Apprentissage', '01/09/2026', null],
  ])
  assert.deepEqual(lignes[0], { matricule: '00063', nom: 'KLAI Sofia', email: 's@x.fr', profil: 'alternant', entree: '2026-09-01', sortie: null })
})
