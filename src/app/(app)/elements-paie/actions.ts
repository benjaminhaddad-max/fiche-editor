'use server'

import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { moisASaisir } from '@/lib/social/calendrier'
import { datesIncoherentes, lireHeuresSup, SchemaFormulaire } from '@/lib/social/formulaire'
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

/** « Rien à signaler ce mois-ci » : une réponse, qui arrête les relances. */
export async function rienASignaler(_prev: ElementsResult, fd: FormData): Promise<ElementsResult> {
  const { user, salarie } = await requireSalarie()
  const period = String(fd.get('period') ?? '')
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: 'Mois invalide.' }
  if (!(await moisOuvert(salarie.providerId, period, salarie.profil))) return { error: 'Ce mois est clos.' }
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
        unpaid_leave_days: 0,
        sick_leave_days: 0,
        transport: false,
        transport_amount: null,
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
  const incoherent = datesIncoherentes(v)
  if (incoherent) return { error: incoherent }
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

  const transport = v.transport === 'oui'
  const montant = v.transport_amount === '' || v.transport_amount === undefined ? null : Number(v.transport_amount)
  if (transport && !montant) return { error: 'Transport : indiquez le montant de l’abonnement.' }
  // Le justificatif est obligatoire (§5), même quand on reconduit l'abonnement.
  if (transport && !transportDoc.id && !avant?.transport_document) {
    return { error: 'Transport : le justificatif du mois est obligatoire (PDF ou photo).' }
  }

  const heures = Math.round(hs.lignes.reduce((t, l) => t + l.heures, 0) * 100) / 100
  const { error } = await db.from('inv_payroll_inputs').upsert(
    {
      provider_id: salarie.providerId,
      period: v.period,
      nothing_to_report: false,
      overtime_hours: heures,
      overtime_lines: hs.lignes,
      paid_leave_days: v.paid_leave_days,
      paid_leave_start: v.paid_leave_start,
      paid_leave_end: v.paid_leave_end,
      unpaid_leave_days: v.unpaid_leave_days,
      unpaid_leave_start: v.unpaid_leave_start,
      unpaid_leave_end: v.unpaid_leave_end,
      sick_leave_days: v.sick_leave_days,
      sick_leave_start: v.sick_leave_start,
      sick_leave_end: v.sick_leave_end,
      ...(arretDoc.id ? { sick_leave_document: arretDoc.id } : {}),
      transport,
      transport_amount: transport ? montant : null,
      transport_renewed: transport && v.transport_renewed === 'on',
      ...(transportDoc.id ? { transport_document: transportDoc.id } : {}),
      mutuelle: v.mutuelle,
      mutuelle_detail: v.mutuelle_detail || null,
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
      conges_payes: v.paid_leave_days,
      sans_solde: v.unpaid_leave_days,
      arret: v.sick_leave_days,
      transport: transport ? montant : null,
      mutuelle: v.mutuelle,
    },
  })

  revalidatePath('/elements-paie')
  revalidatePath('/social')
  return { success: 'Merci, vos éléments sont enregistrés. Vous pouvez les corriger jusqu’à la clôture.' }
}
