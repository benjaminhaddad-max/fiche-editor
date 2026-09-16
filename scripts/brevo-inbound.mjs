#!/usr/bin/env node
/**
 * Finit de brancher l'adresse de dépôt des factures diverses.
 *
 *   npm run brevo-inbound
 *
 * L'adresse donnée aux managers est depotfactures@diploma-sante.fr, un
 * groupe Google Workspace qui fait suivre à factures@depot.diploma-sante.fr :
 * le domaine principal reçoit son courrier chez Google, Brevo ne peut donc
 * écouter qu'un sous-domaine.
 *
 * À lancer une fois les enregistrements DNS ajoutés chez OVH :
 *   1. vérifie le sous-domaine dans Brevo ;
 *   2. contrôle les MX ;
 *   3. crée le webhook qui envoie chaque email reçu à la plateforme.
 * Relancé, il ne crée rien en double.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolveMx } from 'node:dns/promises'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const DOMAINE = 'depot.diploma-sante.fr'
const KEY = process.env.BREVO_API_KEY
const SECRET = process.env.INBOUND_SECRET
const URL_WEBHOOK = `https://facturation.diploma-sante.fr/api/inbound/factures?token=${SECRET}`
if (!KEY || !SECRET) { console.error('\n✗ BREVO_API_KEY ou INBOUND_SECRET manquant.\n'); process.exit(1) }

const brevo = (path, init = {}) =>
  fetch(`https://api.brevo.com/v3${path}`, {
    ...init,
    headers: { 'api-key': KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  })

// 1. Vérification du domaine
await brevo(`/senders/domains/${DOMAINE}/authenticate`, { method: 'PUT' })
const etat = await (await brevo(`/senders/domains/${DOMAINE}`)).json()
const verifie = etat.verified || etat.authenticated
console.log(`\n${verifie ? '✓' : '✗'} domaine ${DOMAINE} ${verifie ? 'vérifié' : 'pas encore vérifié'}`)
if (!verifie) {
  for (const [nom, r] of Object.entries(etat.dns_records ?? {})) {
    if (r) console.log(`  ${r.status ? '✓' : '·'} ${nom.padEnd(12)} ${r.type.padEnd(6)} ${r.host_name}  →  ${r.value}`)
  }
}

// 2. MX
let mx = []
try { mx = await resolveMx(DOMAINE) } catch { /* pas encore propagé */ }
const mxOk = mx.some((m) => /inbound\d\.(sendinblue|brevo)\.com/.test(m.exchange))
console.log(`${mxOk ? '✓' : '✗'} MX ${mxOk ? mx.map((m) => `${m.priority} ${m.exchange}`).join(', ') : 'absents — inbound1.sendinblue.com (10) et inbound2.sendinblue.com (20)'}`)

if (!verifie || !mxOk) {
  console.log('\nLa propagation DNS peut prendre quelques heures. Relancez ce script ensuite.\n')
  process.exit(1)
}

// 3. Webhook
const existants = await (await brevo('/webhooks?type=inbound')).json()
if ((existants.webhooks ?? []).some((w) => w.domain === DOMAINE)) {
  console.log('✓ webhook déjà en place')
} else {
  const res = await brevo('/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      type: 'inbound',
      events: ['inboundEmailProcessed'],
      url: URL_WEBHOOK,
      domain: DOMAINE,
      description: 'Diploma Invoice — factures diverses',
    }),
  })
  const corps = await res.json()
  if (!res.ok) { console.error('✗ webhook :', corps.message); process.exit(1) }
  console.log('✓ webhook créé', corps.id)
}
console.log(`\nBranché. Il reste à faire suivre depotfactures@diploma-sante.fr vers factures@${DOMAINE} (groupe Google).\n`)
