/**
 * Charge le calcul du cycle depuis src/lib/cycle.ts, pour que les scripts et
 * l'application partagent exactement la même définition du calendrier.
 */
import { execFileSync } from 'node:child_process'

const OUT = '/tmp/diploma-invoice-cycle'

// Toujours recompilé : une version en cache garderait une règle périmée.
{
  execFileSync('npx', ['tsc', 'src/lib/cycle.ts', '--outDir', OUT,
    '--module', 'esnext', '--target', 'es2022', '--moduleResolution', 'bundler'],
    { stdio: 'pipe' })
}

export const { billingCycle, cycleForDate, activeCycle, academicYearCycles } =
  await import(`${OUT}/cycle.js`)
