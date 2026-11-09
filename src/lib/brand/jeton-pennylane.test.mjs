import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

// Lancement : npm test. Node 20 ne lit pas le TypeScript, on le transpile ici.
const source = readFileSync(new URL('./config.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})

async function charger(env) {
  for (const k of ['PENNYLANE_API_TOKEN', 'PENNYLANE_API_TOKEN_LINOVA']) delete process.env[k]
  Object.assign(process.env, env)
  // Une copie neuve à chaque fois : la configuration lit l'environnement au chargement.
  const code = `${outputText}\n// ${Math.random()}`
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

test('Linova ne reçoit jamais le jeton de Diploma', async () => {
  const { jetonPennylane } = await charger({ PENNYLANE_API_TOKEN: 'diploma' })
  assert.deepEqual(jetonPennylane('linova'), { variable: 'PENNYLANE_API_TOKEN_LINOVA', jeton: undefined })
  assert.equal(jetonPennylane('diploma').jeton, 'diploma')
})

test('chaque école lit le sien', async () => {
  const { jetonPennylane } = await charger({ PENNYLANE_API_TOKEN: 'diploma', PENNYLANE_API_TOKEN_LINOVA: 'linova' })
  assert.equal(jetonPennylane('linova').jeton, 'linova')
  assert.equal(jetonPennylane('diploma').jeton, 'diploma')
})

test('Medibox n’a aucun Pennylane relié', async () => {
  const { jetonPennylane, BRANDS } = await charger({ PENNYLANE_API_TOKEN: 'diploma' })
  assert.equal(jetonPennylane('medibox'), null)
  assert.equal(BRANDS.medibox.comptabilite, false)
})

test('les reçus de la boîte de Ben restent à Diploma', async () => {
  const { BRANDS } = await charger({})
  assert.equal(BRANDS.diploma.justificatifs, true)
  assert.equal(BRANDS.linova.justificatifs, false)
  assert.equal(BRANDS.linova.comptabilite, true)
})
