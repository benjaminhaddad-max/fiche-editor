#!/usr/bin/env node
/**
 * Retire un prestataire de la plateforme.
 *
 *   node --experimental-websocket scripts/retirer.mjs a@b.fr,c@d.fr           aperçu
 *   node --experimental-websocket scripts/retirer.mjs a@b.fr --apply          applique
 *
 * Deux gestes, et seulement ces deux-là :
 *   1. le compte est désactivé — plus de connexion, plus d'email, plus rien
 *      dans les listes ; c'est l'interrupteur que l'espace admin utilise déjà ;
 *   2. le contrat de coaching passe à « ended » — sans ça, les échéances
 *      d'octobre à mai continueraient de créer des prestations à facturer.
 *
 * Rien n'est supprimé. Les prestations et factures déjà émises restent en
 * place : elles sont la trace comptable d'un travail réellement fait, et on
 * ne réécrit pas l'histoire parce qu'une personne change de statut. Une
 * prestation validée non facturée est signalée, pas effacée — c'est une
 * décision de paie, pas une décision technique.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) {
  for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].trim()
  }
}

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const EMAILS = args.filter((a) => a.includes('@')).flatMap((a) => a.split(','))
if (!EMAILS.length) {
  console.error('\nIndiquez au moins une adresse email.\n')
  process.exit(1)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const eur = (n) => Number(n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

const { data: admin } = await db.from('inv_users').select('id').eq('role', 'admin').limit(1).maybeSingle()

console.log(`\n${APPLY ? 'Retrait' : 'Aperçu'} — ${EMAILS.length} personne(s)\n`)
let aRegler = 0

for (const email of EMAILS) {
  const { data: u } = await db.from('inv_users').select('id, full_name, email, is_active').eq('email', email.trim()).maybeSingle()
  if (!u) { console.log(`  ✗ ${email} : compte introuvable`); continue }

  const { data: p } = await db.from('inv_providers').select('id').eq('user_id', u.id).maybeSingle()
  const { data: contrats } = p
    ? await db.from('inv_coaching_contracts').select('id, program, total_ht, status').eq('provider_id', p.id)
    : { data: [] }
  const { data: missions } = p
    ? await db.from('inv_missions').select('id, status, total_ht, detail').eq('provider_id', p.id).eq('status', 'approved').is('invoice_id', null)
    : { data: [] }
  const { data: futures } = contrats?.length
    ? await db.from('inv_contract_instalments').select('amount_ht, due_date, mission_id').in('contract_id', contrats.map((c) => c.id)).is('mission_id', null)
    : { data: [] }

  const duFutur = (futures ?? []).reduce((s, x) => s + Number(x.amount_ht), 0)
  const duMaintenant = (missions ?? []).reduce((s, x) => s + Number(x.total_ht), 0)
  aRegler += duMaintenant

  console.log(`  ${u.full_name} <${u.email}>`)
  console.log(`     compte            ${u.is_active ? 'actif → désactivé' : 'déjà inactif'}`)
  for (const c of contrats ?? []) console.log(`     contrat ${c.program}  ${eur(c.total_ht)}  ${c.status} → ended`)
  console.log(`     échéances à venir annulées : ${futures?.length ?? 0} — ${eur(duFutur)}`)
  if (duMaintenant) console.log(`     ⚠ prestation validée NON facturée : ${eur(duMaintenant)} — laissée en place, à arbitrer`)

  if (APPLY) {
    await db.from('inv_users').update({ is_active: false }).eq('id', u.id)
    if (contrats?.length) {
      await db.from('inv_coaching_contracts').update({ status: 'ended' }).in('id', contrats.map((c) => c.id))
    }
    if (admin) {
      await db.from('inv_audit_log').insert({
        actor_id: admin.id,
        entity_type: 'user',
        entity_id: u.id,
        action: 'provider_removed',
        payload: {
          motif: 'passage en contrat de travail',
          contrats_clotures: (contrats ?? []).map((c) => c.id),
          echeances_annulees: futures?.length ?? 0,
          montant_futur_annule: duFutur,
          prestation_validee_non_facturee: duMaintenant,
        },
      })
    }
  }
  console.log()
}

if (aRegler) {
  console.log(`⚠ ${eur(aRegler)} de prestations validées et non facturées restent en suspens.`)
  console.log('  Les comptes étant désactivés, ces personnes ne peuvent plus émettre la facture.\n')
}
if (!APPLY) console.log('(aperçu — relancez avec --apply)\n')
