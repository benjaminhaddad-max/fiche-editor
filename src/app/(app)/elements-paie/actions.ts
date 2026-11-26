'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { activeBrand } from '@/lib/brand/actif'
import { logAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { maintenantParis, moisASaisir } from '@/lib/social/calendrier'
import { dispenseEnCours, etatDispense, SITUATIONS, texteSigne, type SituationDispense } from '@/lib/social/dispense'
import { dernieresDispenses } from '@/lib/social/donnees'
import { lireConges, lireHeuresSup, SchemaFormulaire } from '@/lib/social/formulaire'
import { lireParametres } from '@/lib/social/parametres'
import { deposerPiece } from '@/lib/social/pieces'
import { requireSalarie } from '@/lib/social/salarie'
import { groupeDuProfil } from '@/lib/social/types'

export interface ElementsResult {
  error?: string
  success?: string
}

/**
 * Le mois peut-il encore être rempli par le salarié ? Le mois en cours de
 * saisie, ou un mois que Shirel lui a renvoyé pour correction et qu'elle
 * n'a pas encore validé.
 */
async function moisOuvert(providerId: string, period: string, profil: Parameters<typeof groupeDuProfil>[0]) {
  const { calendrier } = await lireParametres()
  if (period === moisASaisir(groupeDuProfil(profil), calendrier)) {
    const { data } = await createServiceClient()
      .from('inv_payroll_inputs')
      .select('status')
      .eq('provider_id', providerId)
      .eq('period', period)
      .maybeSingle()
    return !data || ['attente', 'a_valider', 'a_corriger'].includes(data.status as string)
  }
  const { data } = await createServiceClient()
    .from('inv_payroll_inputs')
    .select('status')
    .eq('provider_id', providerId)
    .eq('period', period)
    .maybeSingle()
  return data?.status === 'a_corriger'
}

/** La dispense signée en cours, s'il y en a une. */
async function dispenseDe(providerId: string) {
  const d = (await dernieresDispenses([providerId])).get(providerId) ?? null
  return { d, etat: etatDispense(d, maintenantParis().date) }
}

/** « Rien à signaler ce mois-ci » : une réponse, qui arrête les relances. */
export async function rienASignaler(_prev: ElementsResult, fd: FormData): Promise<ElementsResult> {
  const { user, salarie } = await requireSalarie()
  const period = String(fd.get('period') ?? '')
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: 'Mois invalide.' }
  if (!(await moisOuvert(salarie.providerId, period, salarie.profil))) return { error: 'Ce mois est clos.' }
  // Une dispense signée et valable vaut pour ce mois aussi.
  const { etat } = await dispenseDe(salarie.providerId)
  if (etat === 'a_renouveler') {
    return { error: 'Votre dispense de mutuelle arrive à échéance : renouvelez-la dans le formulaire ci-dessous (rubrique Mutuelle).' }
  }
  const { error } = await createServiceClient()
    .from('inv_payroll_inputs')
    .upsert(
      {
        provider_id: salarie.providerId,
        period,
        nothing_to_report: true,
        overtime_hours: 0,
        overtime_lines: [],
        paid_leave_days: 0,
        paid_leave_periods: [],
        paid_leave_start: null,
        paid_leave_end: null,
        unpaid_leave_days: 0,
        unpaid_leave_periods: [],
        unpaid_leave_start: null,
        unpaid_leave_end: null,
        sick_leave_days: 0,
        sick_leave_periods: [],
        sick_leave_start: null,
        sick_leave_end: null,
        transport: false,
        transport_annuel: false,
        transport_amount: null,
        ...(dispenseEnCours(etat) ? { mutuelle: 'dispense' } : {}),
        status: 'a_valider',
        submitted_at: new Date().toISOString(),
        submitted_by: user.id,
        return_comment: null,
      },
      { onConflict: 'provider_id,period' }
    )
  if (error) return { error: `Enregistrement impossible : ${error.message}` }
  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: salarie.providerId,
    action: 'social_saisie',
    payload: { periode: period, rien_a_signaler: true },
  })
  revalidatePath('/elements-paie')
  revalidatePath('/social')
  return { success: 'C’est noté : rien à signaler ce mois-ci. Vous ne serez plus relancé.' }
}

/** Le formulaire mensuel (§5 du plan). */
export async function enregistrerElements(_prev: ElementsResult, fd: FormData): Promise<ElementsResult> {
  const { user, salarie } = await requireSalarie()
  const parsed = SchemaFormulaire.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data
  if (!(await moisOuvert(salarie.providerId, v.period, salarie.profil))) {
    return { error: 'Ce mois est clos : écrivez à l’équipe paie pour toute correction.' }
  }
  const cg = lireConges(fd, (await lireParametres()).calendrier.joursConge)
  if ('erreur' in cg) return { error: cg.erreur }
  const conges = cg.conges
  const hs = lireHeuresSup(v.heures_sup)
  if ('erreur' in hs) return { error: hs.erreur }

  const db = createServiceClient()
  const { data: avant } = await db
    .from('inv_payroll_inputs')
    .select('transport_document, sick_leave_document, mutuelle_document')
    .eq('provider_id', salarie.providerId)
    .eq('period', v.period)
    .maybeSingle()

  const piece = (champ: string, dossier: string, intitule: string) =>
    deposerPiece({ fichier: fd.get(champ), providerId: salarie.providerId, userId: user.id, period: v.period, dossier, intitule })
  const transportDoc = await piece('justificatif', 'transport', 'Justificatif de transport')
  if ('erreur' in transportDoc) return { error: transportDoc.erreur }
  const arretDoc = await piece('arret', 'arret-travail', 'Arrêt de travail')
  if ('erreur' in arretDoc) return { error: arretDoc.erreur }
  const mutuelleDoc = await piece('mutuelle_piece', 'mutuelle', 'Justificatif mutuelle')
  if ('erreur' in mutuelleDoc) return { error: mutuelleDoc.erreur }

  // Dispense de mutuelle : signée une fois, gardée jusqu'à son échéance. On
  // la (re)signe quand il n'y en a pas, qu'elle est échue, ou qu'elle arrive
  // à échéance dans le mois.
  const { etat } = await dispenseDe(salarie.providerId)
  let signature: Record<string, unknown> | null = null
  if (v.mutuelle === 'dispense' && etat !== 'valide') {
    const situation = String(fd.get('dispense_situation') ?? '') as SituationDispense
    const organisme = String(fd.get('dispense_organisme') ?? '').trim()
    const echeance = String(fd.get('dispense_echeance') ?? '').trim()
    const faitA = String(fd.get('dispense_fait_a') ?? '').trim()
    const nom = String(fd.get('dispense_signature') ?? '').trim()
    if (!SITUATIONS.some((s) => s.cle === situation)) return { error: 'Dispense de mutuelle : cochez votre situation.' }
    if (organisme.length < 3) return { error: 'Dispense de mutuelle : indiquez l’organisme qui vous couvre (nom et coordonnées).' }
    if (echeance && !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) return { error: 'Dispense de mutuelle : date d’échéance invalide.' }
    const aujourdhui = maintenantParis().date
    if (echeance && echeance <= aujourdhui) return { error: 'Dispense de mutuelle : la date d’échéance est déjà passée.' }
    if (faitA.length < 2) return { error: 'Dispense de mutuelle : indiquez la ville (« Fait à »).' }
    if (nom.length < 3) return { error: 'Dispense de mutuelle : signez en tapant vos nom et prénom.' }
    if (fd.get('dispense_accord') !== 'on') return { error: 'Dispense de mutuelle : cochez la case confirmant avoir lu l’attestation.' }
    const h = await headers()
    signature = {
      provider_id: salarie.providerId,
      situation,
      organisme,
      echeance: echeance || null,
      fait_a: faitA,
      signe_le: aujourdhui,
      signature: nom,
      signed_by: user.id,
      ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
      document: mutuelleDoc.id ?? null,
      texte: texteSigne({
        societe: (await activeBrand()).company.name,
        nom,
        situation,
        organisme,
        echeance: echeance || null,
        faitA,
        le: aujourdhui,
      }),
    }
  }

  const transport = v.transport === 'oui'
  const montant = v.transport_amount === '' || v.transport_amount === undefined ? null : Number(v.transport_amount)
  if (transport && !montant) return { error: 'Transport : indiquez le montant de l’abonnement.' }
  // Le justificatif est obligatoire (§5), même quand on reconduit l'abonnement.
  if (transport && !transportDoc.id && !avant?.transport_document) {
    return { error: 'Transport : le justificatif du mois est obligatoire (PDF ou photo).' }
  }

  // L'arrêt de travail aussi : pas de jours d'arrêt sans le document.
  if (conges.sick_leave_days > 0 && !arretDoc.id && !avant?.sick_leave_document) {
    return { error: 'Arrêt de travail : l’arrêt est obligatoire (PDF ou photo).' }
  }

  if (signature) {
    const { error: e } = await db.from('inv_mutuelle_dispenses').insert(signature)
    if (e) return { error: `Dispense de mutuelle : enregistrement impossible (${e.message}).` }
  }

  const heures = Math.round(hs.lignes.reduce((t, l) => t + l.heures, 0) * 100) / 100
  const { error } = await db.from('inv_payroll_inputs').upsert(
    {
      provider_id: salarie.providerId,
      period: v.period,
      nothing_to_report: false,
      overtime_hours: heures,
      overtime_lines: hs.lignes,
      ...conges,
      ...(arretDoc.id ? { sick_leave_document: arretDoc.id } : {}),
      transport,
      transport_annuel: v.transport === 'annuel',
      transport_amount: transport ? montant : null,
      transport_renewed: transport && v.transport_renewed === 'on',
      ...(transportDoc.id ? { transport_document: transportDoc.id } : {}),
      mutuelle: v.mutuelle,
      mutuelle_detail:
        v.mutuelle_detail ||
        (v.mutuelle === 'dispense' ? (signature ? 'Dispense signée en ligne' : 'Dispense déjà signée') : null),
      ...(mutuelleDoc.id ? { mutuelle_document: mutuelleDoc.id } : {}),
      comment: v.comment || null,
      status: 'a_valider',
      submitted_at: new Date().toISOString(),
      submitted_by: user.id,
    },
    { onConflict: 'provider_id,period' }
  )
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: salarie.providerId,
    action: 'social_saisie',
    payload: {
      periode: v.period,
      heures_sup: heures,
      conges_payes: conges.paid_leave_days,
      sans_solde: conges.unpaid_leave_days,
      arret: conges.sick_leave_days,
      periodes: { cp: conges.paid_leave_periods, sans_solde: conges.unpaid_leave_periods, arret: conges.sick_leave_periods },
      transport: transport ? montant : null,
      mutuelle: v.mutuelle,
      ...(signature ? { dispense_signee: { situation: signature.situation, echeance: signature.echeance } } : {}),
    },
  })

  revalidatePath('/elements-paie')
  revalidatePath('/social')
  return { success: 'Merci, vos éléments sont enregistrés. Vous pouvez les corriger jusqu’à la clôture.' }
}
