#!/usr/bin/env node
/** Affiche le calendrier de facturation, pour vérification. */
import { execFileSync } from 'node:child_process'
execFileSync('npx', ['tsc', 'src/lib/cycle.ts', '--outDir', '/tmp/cyc', '--module', 'esnext',
  '--target', 'es2022', '--moduleResolution', 'bundler'], { stdio: 'inherit' })
const { academicYearCycles } = await import('/tmp/cyc/cycle.js')

const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
const fr = (d) => { const x = new Date(`${d}T12:00:00Z`); return `${String(x.getUTCDate()).padStart(2,'0')} ${MOIS[x.getUTCMonth()].slice(0,4)}` }
const jour = (d) => ['dim','lun','mar','mer','jeu','ven','sam'][new Date(`${d}T12:00:00Z`).getUTCDay()]

console.log('\nCalendrier de facturation — année universitaire 2026/2027\n')
console.log('  MOIS         SAISIE JUSQU\'AU     BORDEREAU       FACTURE AVANT     PAIEMENT')
for (const c of academicYearCycles(2026)) {
  const [y, m] = c.month.split('-')
  console.log(`  ${(MOIS[+m-1] + ' ' + y).padEnd(14)} ${(fr(c.periodEnd)+' ('+jour(c.periodEnd)+')').padEnd(19)} ${(fr(c.statementDate)+' ('+jour(c.statementDate)+')').padEnd(16)} ${(fr(c.invoiceDeadline)+' ('+jour(c.invoiceDeadline)+')').padEnd(18)} ${fr(c.paymentStart)} → ${fr(c.paymentEnd)}`)
}
console.log()
