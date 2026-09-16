#!/usr/bin/env node
/** Affiche le calendrier de facturation de l'année universitaire, pour vérification. */
import { academicYearCycles } from './lib/cycle.mjs'

const MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
const fr = (d) => {
  const x = new Date(`${d}T12:00:00Z`)
  return `${['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][x.getUTCDay()]} ${String(x.getUTCDate()).padStart(2, '0')} ${MOIS[x.getUTCMonth()]}`
}
const debut = Number(process.argv[2] ?? new Date().getFullYear())

console.log(`\nCalendrier de facturation ${debut}-${debut + 1}\n`)
console.log('  MOIS             DÉCLARATION      VÉRIFICATION             BORDEREAU      FACTURE AVANT   PAIEMENT')
for (const c of academicYearCycles(debut)) {
  console.log(
    `  ${c.label.padEnd(16)} ${fr(c.declarationDeadline).padEnd(16)} ${`${fr(c.reviewStart)} → ${fr(c.reviewEnd)}`.padEnd(24)} ${fr(c.statementDate).padEnd(14)} ${fr(c.invoiceDeadline).padEnd(15)} ${fr(c.paymentDate)}`
  )
}
console.log()
