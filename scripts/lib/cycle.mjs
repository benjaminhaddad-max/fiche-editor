/**
 * Charge le calcul du cycle depuis src/lib/cycle.ts, pour que les scripts et
 * l'application partagent exactement la même définition du calendrier.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const OUT = '/tmp/diploma-invoice-cycle'

if (!existsSync(`${OUT}/cycle.js`)) {
  execFileSync('npx', ['tsc', 'src/lib/cycle.ts', '--outDir', OUT,
    '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler'],
    { stdio: 'pipe' })
}

export const { billingCycle, cycleForDate, lastSaturday, academicYearCycles } =
  await import(`${OUT}/cycle.js`)
