'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { logAudit } from '@/lib/audit'
import { activeBrandId } from '@/lib/brand/actif'
import { deliver, sendInvitation } from '@/lib/email/notify'
import { sendSms } from '@/lib/email/sms'
import { templates } from '@/lib/email/templates'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { ouvrirIdentite } from '@/lib/personnes'
import { createServiceClient } from '@/lib/supabase/service'
import { completerCalendrier } from '@/lib/social/calendrier'
import { ligneDuSalarie, tableauDuMois, type LigneSocial } from '@/lib/social/donnees'
import { lignesImport, lireCsv, lireXlsx } from '@/lib/social/fichier'
import { datesIncoherentes, lireHeuresSup, SchemaFormulaire } from '@/lib/social/formulaire'
import { importerSalaries, type ResultatImport } from '@/lib/social/import'
import { CODES_DEFAUT, ecrireParametres, lireParametres, requireEquipeSocial } from '@/lib/social/parametres'
import { deposerPiece } from '@/lib/social/pieces'
import { demanderElements } from '@/lib/social/relances'
import { codesManquants, csvSilae, lignesSilae } from '@/lib/social/saisie'
import { EMPLOI_DU_PROFIL, GROUPE_LABEL, PROFILS, VARIABLES, type GroupeSocial, type ProfilSocial } from '@/lib/social/types'

export interface Resultat {
  error?: string
  success?: string
}

const MOIS = /^\d{4}-\d{2}$/
const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function rafraichir(providerId?: string) {
  revalidatePath('/social')
  if (providerId) revalidatePath(`/social/${providerId}`)
  revalidatePath('/elements-paie')
}

/** Valider une saisie : seule une saisie validée part vers Silae. */
async function valider(l: LigneSocial, userId: string): Promise<string | null> {
  // « valide » aussi : revalider refige le net des missions d'un vacataire.
  if (!['a_valider', 'a_corriger', 'attente', 'valide'].includes(l.saisie.status) || !l.saisie.submitted_at) {
    return `${l.salarie.nom} : rien à valider.`
  }
  const { error } = await createServiceClient()
    .from('inv_payroll_inputs')
    .update({
      status: 'valide',
      validated_at: new Date().toISOString(),
      validated_by: userId,
      // Le net des missions est figé au moment de la validation : c'est lui
      // qui partira, même si une mission bouge ensuite.
      missions_total: l.salarie.profil === 'vacataire' ? l.netEnCours : null,
    })
    .eq('provider_id', l.salarie.providerId)
    .eq('period', l.saisie.period)
  if (error) return `${l.salarie.nom} : ${error.message}`
  await logAudit(null, {
    actorId: userId,
    entityType: 'provider',
    entityId: l.salarie.providerId,
    action: 'social_validation',
    payload: { periode: l.saisie.period, anomalies: l.anomalies.map((a) => a.texte), net_missions: l.netEnCours },
  })
  return null
}

export async function validerSaisie(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const providerId = String(fd.get('provider_id') ?? '')
  const mois = String(fd.get('mois') ?? '')
  if (!MOIS.test(mois)) return { error: 'Mois invalide.' }
  const l = await ligneDuSalarie(providerId, mois)
  if (!l) return { error: 'Salarié introuvable pour ce mois.' }
  const err = await valider(l, user.id)
  if (err) return { error: err }
  rafraichir(providerId)
  return { success: `${l.salarie.nom} : validé.` }
}

/** Validation en masse : seulement les saisies à valider sans aucune anomalie. */
export async function validerEnMasse(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const mois = String(fd.get('mois') ?? '')
  if (!MOIS.test(mois)) return { error: 'Mois invalide.' }
  const ids = new Set(fd.getAll('provider_id').map(String))
  const lignes = (await tableauDuMois(mois)).filter(
    (l) => ids.has(l.salarie.providerId) && l.saisie.status === 'a_valider' && !l.anomalies.length
  )
  let ok = 0
  const erreurs: string[] = []
  for (const l of lignes) {
    const e = await valider(l, user.id)
    if (e) erreurs.push(e)
    else ok++
  }
  rafraichir()
  const ecartees = ids.size - lignes.length
  return {
    success: `${ok} saisie(s) validée(s).${ecartees ? ` ${ecartees} écartée(s) : anomalie ou rien à valider.` : ''}`,
    ...(erreurs.length ? { error: erreurs.join(' ') } : {}),
  }
}

/** Renvoyer au salarié avec un commentaire : il corrige dans son espace. */
export async function renvoyerSaisie(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const providerId = String(fd.get('provider_id') ?? '')
  const mois = String(fd.get('mois') ?? '')
  const commentaire = String(fd.get('commentaire') ?? '').trim()
  if (!MOIS.test(mois)) return { error: 'Mois invalide.' }
  if (commentaire.length < 3) return { error: 'Dites au salarié ce qu’il doit corriger.' }
  const l = await ligneDuSalarie(providerId, mois)
  if (!l) return { error: 'Salarié introuvable pour ce mois.' }
  if (l.saisie.status === 'transmis') return { error: 'Déjà transmis à la paie : la correction se fera le mois suivant.' }
  const { error } = await createServiceClient()
    .from('inv_payroll_inputs')
    .upsert(
      {
        provider_id: providerId,
        period: mois,
        status: 'a_corriger',
        returned_at: new Date().toISOString(),
        returned_by: user.id,
        return_comment: commentaire,
        validated_at: null,
        validated_by: null,
      },
      { onConflict: 'provider_id,period' }
    )
  if (error) return { error: error.message }
  if (l.salarie.email) {
    await deliver({
      to: { email: l.salarie.email, name: l.salarie.nom },
      ...(await templates()).socialRetour({ name: l.salarie.nom, label: libelleMois(mois), commentaire }),
      template: 'social_retour',
      entityType: 'provider',
      entityId: providerId,
      providerId,
    })
    await sendSms(l.salarie.telephone, `L’équipe paie vous demande une correction sur vos éléments de ${libelleMois(mois)} : voir votre espace.`)
  }
  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: providerId,
    action: 'social_renvoi',
    payload: { periode: mois, commentaire },
  })
  rafraichir(providerId)
  return { success: `Renvoyé à ${l.salarie.nom}${l.salarie.email ? ', prévenu par email et SMS' : ' (pas d’adresse : prévenez-le)'}.` }
}

const CHAMPS_TRACES = [
  'paid_leave_days', 'paid_leave_start', 'paid_leave_end',
  'unpaid_leave_days', 'unpaid_leave_start', 'unpaid_leave_end',
  'sick_leave_days', 'sick_leave_start', 'sick_leave_end',
  'transport', 'transport_amount', 'mutuelle', 'mutuelle_detail', 'comment', 'overtime_hours', 'overtime_lines',
] as const

/**
 * Corriger à la place du salarié, avec trace : l'ancienne et la nouvelle
 * valeur de chaque champ changé partent au journal. Sert aussi à saisir
 * pour quelqu'un qui n'a pas répondu.
 */
export async function corrigerSaisie(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const providerId = String(fd.get('provider_id') ?? '')
  const parsed = SchemaFormulaire.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  const incoherent = datesIncoherentes(v)
  if (incoherent) return { error: incoherent }
  const hs = lireHeuresSup(v.heures_sup)
  if ('erreur' in hs) return { error: hs.erreur }
  const l = await ligneDuSalarie(providerId, v.period)
  if (!l) return { error: 'Salarié introuvable pour ce mois.' }
  if (l.saisie.status === 'transmis') return { error: 'Déjà transmis à la paie.' }

  const pieces: Record<string, string> = {}
  for (const [champ, colonne, dossier, intitule] of [
    ['justificatif', 'transport_document', 'transport', 'Justificatif de transport'],
    ['arret', 'sick_leave_document', 'arret-travail', 'Arrêt de travail'],
    ['mutuelle_piece', 'mutuelle_document', 'mutuelle', 'Justificatif mutuelle'],
  ] as const) {
    const r = await deposerPiece({ fichier: fd.get(champ), providerId, userId: user.id, period: v.period, dossier, intitule })
    if ('erreur' in r) return { error: r.erreur }
    if (r.id) pieces[colonne] = r.id
  }

  const transport = v.transport === 'oui'
  const nouveau = {
    paid_leave_days: v.paid_leave_days,
    paid_leave_start: v.paid_leave_start,
    paid_leave_end: v.paid_leave_end,
    unpaid_leave_days: v.unpaid_leave_days,
    unpaid_leave_start: v.unpaid_leave_start,
    unpaid_leave_end: v.unpaid_leave_end,
    sick_leave_days: v.sick_leave_days,
    sick_leave_start: v.sick_leave_start,
    sick_leave_end: v.sick_leave_end,
    transport,
    transport_amount: transport && v.transport_amount !== '' && v.transport_amount !== undefined ? Number(v.transport_amount) : null,
    mutuelle: v.mutuelle,
    mutuelle_detail: v.mutuelle_detail || null,
    comment: v.comment || null,
    overtime_hours: Math.round(hs.lignes.reduce((t, x) => t + x.heures, 0) * 100) / 100,
    overtime_lines: hs.lignes,
  }
  const avant = l.saisie as unknown as Record<string, unknown>
  const diff: Record<string, { avant: unknown; apres: unknown }> = {}
  for (const k of CHAMPS_TRACES) {
    const a = avant[k] ?? null
    const b = (nouveau as Record<string, unknown>)[k] ?? null
    if (JSON.stringify(a) !== JSON.stringify(b)) diff[k] = { avant: a, apres: b }
  }
  for (const k of Object.keys(pieces)) diff[k] = { avant: avant[k] ?? null, apres: pieces[k] }
  if (!Object.keys(diff).length) return { success: 'Aucun changement.' }

  const { error } = await createServiceClient()
    .from('inv_payroll_inputs')
    .upsert(
      {
        provider_id: providerId,
        period: v.period,
        ...nouveau,
        ...pieces,
        nothing_to_report: false,
        status: 'a_valider',
        submitted_at: l.saisie.submitted_at ?? new Date().toISOString(),
        ...(l.saisie.submitted_at ? {} : { submitted_by: user.id }),
        validated_at: null,
        validated_by: null,
      },
      { onConflict: 'provider_id,period' }
    )
  if (error) return { error: error.message }
  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: providerId,
    action: 'social_correction',
    payload: { periode: v.period, modifications: diff },
  })
  rafraichir(providerId)
  return { success: `Corrigé (${Object.keys(diff).length} champ(s), tracé au journal). La saisie repasse « à valider ».` }
}

/** Relancer à la main ceux qu'on a cochés. */
export async function relancerSalaries(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const mois = String(fd.get('mois') ?? '')
  const groupe = String(fd.get('groupe') ?? '') as GroupeSocial
  const ids = fd.getAll('provider_id').map(String).filter(Boolean)
  if (!MOIS.test(mois) || !ids.length || !(groupe in GROUPE_LABEL)) return { error: 'Rien à relancer.' }
  const r = await demanderElements(groupe, mois, true, ids)
  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'social_relance',
    payload: { mois, groupe, envoyes: r.envoyes, sans_compte: r.sansCompte },
  })
  rafraichir()
  return {
    success: `${r.envoyes} relance(s) envoyée(s).`,
    ...(r.sansCompte.length ? { error: `Sans adresse, non relancés : ${r.sansCompte.join(', ')}.` } : {}),
  }
}

/**
 * Le fichier Silae du mois pour un groupe, construit des seules lignes
 * validées. Les codes manquants restent vides et sont signalés.
 */
async function fichierDuMois(mois: string, groupe: GroupeSocial) {
  const { codes } = await lireParametres()
  const retenues = (await tableauDuMois(mois, groupe)).filter((l) => l.saisie.status === 'valide')
  const lignes = retenues.flatMap((l) => lignesSilae(l.salarie, l.saisie, l.netMissions, codes))
  return { retenues, lignes, csv: csvSilae(lignes), manquants: codesManquants(lignes) }
}

/**
 * Envoyer à Net Paye — sur clic de Shirel, pas d'office (décision par
 * défaut du lot 1). Le fichier part avec les justificatifs en pièces
 * jointes, les lignes passent « transmis à la paie », et pour les
 * vacataires les missions sont fermées : elles ne repartiront pas.
 */
export async function envoyerNetPaye(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const mois = String(fd.get('mois') ?? '')
  const groupe = String(fd.get('groupe') ?? '') as GroupeSocial
  if (!MOIS.test(mois) || !(groupe in GROUPE_LABEL)) return { error: 'Mois ou groupe invalide.' }
  const params = await lireParametres()
  if (!params.netpayeEmail) return { error: 'Renseignez d’abord l’adresse de Net Paye dans Paramètres.' }
  const { retenues, lignes, csv, manquants } = await fichierDuMois(mois, groupe)
  if (!retenues.length) return { error: 'Aucune saisie validée à envoyer pour ce groupe.' }
  // Le net d'un vacataire est figé à la validation. Si un manager a validé
  // ou retiré une mission depuis, le fichier ne dirait plus la vérité.
  const bouge = retenues.filter((l) => {
    if (l.salarie.profil !== 'vacataire') return false
    const live = Math.round(l.missions.filter((m) => m.status === 'manager_approved' || m.status === 'approved').reduce((t, m) => t + m.total, 0) * 100) / 100
    return live !== (l.saisie.missions_total ?? 0)
  })
  if (bouge.length) {
    return { error: `Les missions ont changé depuis la validation pour : ${bouge.map((l) => l.salarie.nom).join(', ')}. Revalidez-les avant l’envoi.` }
  }

  const db = createServiceClient()
  // Les justificatifs, en pièces jointes tant que le total reste raisonnable.
  const ids = retenues.flatMap((l) => [l.saisie.transport_document, l.saisie.sick_leave_document, l.saisie.mutuelle_document]).filter(Boolean) as string[]
  const { data: docs } = ids.length
    ? await db.from('inv_documents').select('id, path, filename, label, provider_id').in('id', ids)
    : { data: [] }
  const jointes: { name: string; content: string }[] = []
  const nomsPieces: string[] = []
  let poids = 0
  for (const d of docs ?? []) {
    const { data } = await db.storage.from(INVOICE_BUCKET).download(d.path as string)
    if (!data) continue
    const buf = Buffer.from(await data.arrayBuffer())
    const qui = retenues.find((l) => l.salarie.providerId === d.provider_id)?.salarie
    const nom = `${qui?.matricule ?? ''}-${qui?.nom ?? ''}-${d.label}`.replace(/[^\w.-]+/g, '_') + (String(d.path).match(/\.\w+$/)?.[0] ?? '')
    if (poids + buf.length > 8 * 1024 * 1024) {
      nomsPieces.push(`${nom} (trop lourd pour le mail, disponible sur demande)`)
      continue
    }
    poids += buf.length
    jointes.push({ name: nom, content: buf.toString('base64') })
    nomsPieces.push(nom)
  }

  const fichier = `elements-variables-${groupe}-${mois}.csv`
  await deliver({
    to: { email: params.netpayeEmail, name: params.netpayeNom },
    ...(await templates()).socialNetPaye({
      nom: params.netpayeNom,
      label: libelleMois(mois),
      groupe: GROUPE_LABEL[groupe],
      salaries: retenues.length,
      lignes: lignes.length,
      manquants: manquants.map((m) => m.libelle),
      pieces: nomsPieces,
    }),
    attachments: [{ name: fichier, content: Buffer.from('﻿' + csv, 'utf8').toString('base64') }, ...jointes],
    template: 'social_netpaye',
    entityType: 'user',
    entityId: user.id,
  })

  // Les missions des vacataires sont fermées dans un lot de paie, comme le
  // faisait l'ancien « Envoi au social » : sinon elles repartiraient.
  let lot: string | null = null
  const missions = retenues.flatMap((l) => l.missions.filter((m) => m.status === 'manager_approved' || m.status === 'approved'))
  if (groupe === 'vacataires' && missions.length) {
    const total = Math.round(missions.reduce((t, m) => t + m.total, 0) * 100) / 100
    const { data } = await db
      .from('inv_payroll_batches')
      .insert({ cycle_month: mois, total_ht: total, lines: missions.length, created_by: user.id })
      .select('id')
      .single()
    lot = (data?.id as string | undefined) ?? null
    if (lot) {
      await db
        .from('inv_missions')
        .update({ payroll_batch_id: lot, status: 'invoiced', admin_approved_at: new Date().toISOString(), admin_approved_by: user.id })
        .in('id', missions.map((m) => m.id))
    }
  }

  const { data: exp } = await db
    .from('inv_social_exports')
    .insert({
      brand: await activeBrandId(),
      period: mois,
      groupe,
      lignes: lignes.length,
      salaries: retenues.length,
      codes_manquants: manquants,
      contenu: csv,
      envoye_a: params.netpayeEmail,
      payroll_batch_id: lot,
      created_by: user.id,
    })
    .select('id')
    .single()
  await db
    .from('inv_payroll_inputs')
    .update({ status: 'transmis', transmitted_at: new Date().toISOString(), transmitted_by: user.id, exported_at: new Date().toISOString(), export_id: exp?.id ?? null })
    .eq('period', mois)
    .in('provider_id', retenues.map((l) => l.salarie.providerId))
    .eq('status', 'valide')

  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'social_envoi_netpaye',
    payload: { mois, groupe, salaries: retenues.length, lignes: lignes.length, manquants: manquants.map((m) => m.variable), destinataire: params.netpayeEmail },
  })
  rafraichir()
  return {
    success: `Envoyé à ${params.netpayeNom} (${params.netpayeEmail}) : ${retenues.length} salarié(s), ${lignes.length} ligne(s), ${jointes.length} justificatif(s).`,
    ...(manquants.length ? { error: `Codes Silae manquants, laissés vides : ${manquants.map((m) => m.libelle).join(', ')}.` } : {}),
  }
}

// ---------------------------------------------------------------------------
// Salariés

export async function importerFichier(_p: ResultatImport | { error: string } | null, fd: FormData): Promise<(ResultatImport & { applique: boolean }) | { error: string }> {
  const user = await requireEquipeSocial()
  const f = fd.get('fichier')
  if (!(f instanceof File) || !f.size) return { error: 'Choisissez un fichier .xlsx ou .csv.' }
  const buf = Buffer.from(await f.arrayBuffer())
  let table
  try {
    table = f.name.toLowerCase().endsWith('.csv') ? lireCsv(buf.toString('utf8')) : lireXlsx(buf)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Fichier illisible.' }
  }
  const { lignes, erreurs } = lignesImport(table)
  if (!lignes.length) return { error: erreurs[0] ?? 'Aucun salarié lu dans ce fichier.' }
  // Premier passage : on montre ce qui va se passer. Le second applique.
  const appliquer = fd.get('appliquer') === '1'
  const r = await importerSalaries(lignes, appliquer)
  r.conflits.push(...erreurs)
  if (appliquer) {
    await logAudit(null, {
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      action: 'social_import_salaries',
      payload: { fichier: f.name, lignes: lignes.length, crees: r.crees.length, rattaches: r.rattaches.length, conflits: r.conflits },
    })
    revalidatePath('/social/salaries')
  }
  return { ...r, applique: appliquer }
}

const SchemaFiche = z.object({
  provider_id: z.string().uuid(),
  matricule: z.string().trim().max(20).optional(),
  profil: z.enum(PROFILS as [ProfilSocial, ...ProfilSocial[]]),
  entree: z.string().trim().optional(),
  sortie: z.string().trim().optional(),
})

export async function modifierSalarie(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const p = SchemaFiche.safeParse(Object.fromEntries(fd))
  if (!p.success) return { error: p.error.issues[0].message }
  const v = p.data
  const db = createServiceClient()
  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, brand, employment_type, social_profile, silae_matricule')
    .eq('id', v.provider_id)
    .eq('brand', await activeBrandId())
    .maybeSingle()
  if (!fiche?.social_profile) return { error: 'Fiche introuvable dans l’Espace Social.' }
  const { error } = await db
    .from('inv_providers')
    .update({
      silae_matricule: v.matricule || null,
      social_profile: v.profil,
      employment_type: fiche.employment_type === 'salarie_enseignant' && v.profil === 'fixe' ? 'salarie_enseignant' : EMPLOI_DU_PROFIL[v.profil],
      social_entry_date: v.entree || null,
      social_exit_date: v.sortie || null,
    })
    .eq('id', v.provider_id)
  if (error) return { error: error.code === '23505' ? 'Ce matricule est déjà porté par une autre fiche.' : error.message }
  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: v.provider_id,
    action: 'social_fiche',
    payload: { avant: { matricule: fiche.silae_matricule, profil: fiche.social_profile }, apres: { matricule: v.matricule || null, profil: v.profil, entree: v.entree || null, sortie: v.sortie || null } },
  })
  revalidatePath('/social/salaries')
  return { success: 'Fiche enregistrée.' }
}

/** Ouvrir l'accès d'un salarié qui n'a pas encore de compte, et l'inviter. */
export async function envoyerAcces(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const providerId = String(fd.get('provider_id') ?? '')
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const db = createServiceClient()
  const brand = await activeBrandId()
  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, user_id, legal_name, phone, social_profile')
    .eq('id', providerId)
    .eq('brand', brand)
    .maybeSingle()
  if (!fiche?.social_profile) return { error: 'Fiche introuvable.' }
  let userId = fiche.user_id as string | null
  if (!userId) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Indiquez l’adresse email du salarié.' }
    // Un compte existe déjà (ici, ou transverse comme celui de la direction) :
    // on y rattache la fiche plutôt que d'ouvrir un second profil.
    const { data: deja } = await db.from('inv_users').select('id').in('brand', [brand, 'all']).ilike('email', email).limit(1).maybeSingle()
    if (deja) {
      const { data: autre } = await db.from('inv_providers').select('id').eq('user_id', deja.id).maybeSingle()
      if (autre) return { error: 'Ce compte porte déjà une autre fiche : rattachement à faire à la main.' }
      await db.from('inv_providers').update({ user_id: deja.id, contact_email: email }).eq('id', providerId)
      await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: providerId, action: 'social_acces', payload: { rattache: deja.id } })
      revalidatePath('/social/salaries')
      return { success: 'Fiche rattachée au compte existant : la personne voit « Mes éléments de paie » à sa prochaine connexion.' }
    }
    const identite = await ouvrirIdentite(db, email)
    if ('error' in identite) return { error: identite.error }
    const { data: u, error } = await db
      .from('inv_users')
      .insert({ auth_id: identite.authId, email, full_name: fiche.legal_name, role: 'prestataire', phone: fiche.phone, brand })
      .select('id')
      .single()
    if (error || !u) return { error: `Création du compte impossible : ${error?.message}` }
    userId = u.id as string
    await db.from('inv_providers').update({ user_id: userId, contact_email: email }).eq('id', providerId)
  }
  const ok = await sendInvitation(userId, user.id)
  await logAudit(null, { actorId: user.id, entityType: 'provider', entityId: providerId, action: 'social_acces', payload: { envoye: ok } })
  revalidatePath('/social/salaries')
  return ok ? { success: 'Accès envoyé.' } : { error: 'L’invitation n’a pas pu partir.' }
}

// ---------------------------------------------------------------------------
// Paramètres

const heure = z.coerce.number<number>().int().min(0).max(24)
const jour = z.coerce.number<number>().int().min(1).max(31)

export async function enregistrerParametres(_p: Resultat, fd: FormData): Promise<Resultat> {
  const user = await requireEquipeSocial()
  const g = (k: string) => fd.get(k)
  const moment = (k: string) => ({ jour: jour.parse(g(`${k}_jour`)), heure: heure.parse(g(`${k}_heure`)) })
  let calendrier
  try {
    calendrier = completerCalendrier({
      fixes: {
        ouverture: moment('f_ouverture'),
        relance: moment('f_relance'),
        derniereRelance: moment('f_derniere'),
        cloture: moment('f_cloture'),
        validation: moment('f_validation'),
        envoi: moment('f_envoi'),
        limiteNetPaye: jour.parse(g('f_limite')),
        versement: jour.parse(g('f_versement')),
      },
      vacataires: {
        relanceJoursAvantFin: z.coerce.number<number>().int().min(0).max(10).parse(g('v_relance_jours')),
        relanceHeure: heure.parse(g('v_relance_heure')),
        cloture: moment('v_cloture'),
        validation: moment('v_validation'),
        envoi: moment('v_envoi'),
        versement: jour.parse(g('v_versement')),
      },
      email: g('email') === 'on',
      sms: g('sms') === 'on',
    })
  } catch {
    return { error: 'Un jour (1 à 31) ou une heure (0 à 24) est invalide.' }
  }
  const codes = { ...CODES_DEFAUT }
  for (const v of VARIABLES) codes[v.cle] = String(g(`code_${v.cle}`) ?? '').trim().slice(0, 20)
  const netpayeEmail = String(g('netpaye_email') ?? '').trim()
  if (netpayeEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(netpayeEmail)) return { error: 'Adresse de Net Paye invalide.' }
  const equipe = String(g('equipe') ?? '')
    .split(/[\s,;]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  // Seul un administrateur change l'équipe : on ne s'ouvre pas l'accès à soi-même.
  const err = await ecrireParametres(
    {
      calendrier,
      codes,
      netpayeEmail,
      netpayeNom: String(g('netpaye_nom') ?? '').trim(),
      ...(user.role === 'admin' && equipe.length ? { equipe } : {}),
    },
    user.id
  )
  if (err) return { error: err }
  await logAudit(null, { actorId: user.id, entityType: 'user', entityId: user.id, action: 'social_parametres', payload: { calendrier, codes, netpayeEmail } })
  revalidatePath('/social')
  return { success: 'Paramètres enregistrés.' }
}
