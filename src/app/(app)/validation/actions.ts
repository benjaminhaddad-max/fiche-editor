'use server'

import { revalidatePath } from 'next/cache'
import { guideNom, guidePdf } from '@/lib/guides/pdf'
import { trouverOuCreerPrestataire } from '@/lib/personnes'
import { templates } from '@/lib/email/templates'
import { deliver, sendInvitation } from '@/lib/email/notify'
import { cycleForDate, todayParis } from '@/lib/cycle'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { notifyMissionRejected, notifyReadyToInvoice } from '@/lib/email/notify'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { managerCanEdit } from '@/lib/cycle'
import { formatDateLong, round2 } from '@/lib/format'

/**
 * Valide une prestation.
 *  - manager : submitted -> manager_approved
 *  - admin           : submitted | manager_approved -> approved
 *
 * L'admin qui valide une prestation encore au stade "manager" coche
 * les deux etapes d'un coup : c'est le raccourci assume pour les missions
 * qu'il a lui-meme commandees.
 */
export async function approveMission(formData: FormData): Promise<void> {
  const ids = formData.getAll('mission_id').map(String).filter(Boolean)
  await approveMissions(ids)
  revalidatePath('/validation')
  revalidatePath('/admin')
  revalidatePath('/admin/prestations')
}

/**
 * Valide une ou plusieurs prestations.
 *
 * Le mail « vos prestations sont validées » n'est envoyé qu'UNE fois par
 * prestataire à la fin, même si dix de ses lignes sont validées d'un coup :
 * dix mails identiques en dix secondes seraient pris pour du spam.
 */
async function approveMissions(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const user = await requireRole('manager', 'admin')
  const supabase = await createServerSupabase()
  const now = new Date().toISOString()
  const prestatairesAPrevenir = new Set<string>()

  for (const id of ids) {
    await approveOne(id, user, supabase, now, prestatairesAPrevenir)
  }

  for (const providerId of prestatairesAPrevenir) {
    await notifyReadyToInvoice(providerId)
  }
}

async function approveOne(
  id: string,
  user: { id: string; role: string },
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  now: string,
  aPrevenir: Set<string>
): Promise<void> {

  if (user.role === 'manager') {
    const { error } = await supabase
      .from('inv_missions')
      .update({
        status: 'manager_approved',
        manager_approved_at: now,
        manager_approved_by: user.id,
        rejection_reason: null,
        rejected_at: null,
        rejected_by: null,
      })
      .eq('id', id)
      .eq('manager_id', user.id)
      .eq('status', 'submitted')

    if (error) {
      console.error('[approveMission:manager]', error.message)
      return
    }
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'mission',
      entityId: id,
      action: 'manager_approve',
    })
    return
  } else {
    const { data: mission } = await supabase
      .from('inv_missions')
      .select('status, manager_approved_at, provider_id')
      .eq('id', id)
      .maybeSingle()

    if (!mission || !['submitted', 'manager_approved'].includes(mission.status)) return

    const patch: Record<string, unknown> = {
      status: 'approved',
      admin_approved_at: now,
      admin_approved_by: user.id,
      rejection_reason: null,
      rejected_at: null,
      rejected_by: null,
    }
    // Raccourci admin : on renseigne aussi l'etape manager si elle
    // n'a jamais eu lieu, pour garder une piste d'audit complete.
    if (!mission.manager_approved_at) {
      patch.manager_approved_at = now
      patch.manager_approved_by = user.id
    }

    const { error } = await supabase.from('inv_missions').update(patch).eq('id', id)

    if (error) {
      console.error('[approveMission:admin]', error.message)
      return
    }
    await logAudit(supabase, {
      actorId: user.id,
      entityType: 'mission',
      entityId: id,
      action: 'admin_approve',
      payload: { shortcut: mission.status === 'submitted' },
    })

    // La prestation devient facturable : le prestataire doit le savoir,
    // mais on regroupe l'envoi en fin de lot.
    aPrevenir.add(mission.provider_id)
  }
}

/** Refuse une prestation. Le motif est obligatoire : le prestataire doit
 *  savoir quoi corriger avant de la renvoyer. */
export async function rejectMission(formData: FormData): Promise<void> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('mission_id') ?? '')
  const reason = String(formData.get('rejection_reason') ?? '').trim()
  if (!id || reason.length < 3) return

  const supabase = await createServerSupabase()
  let query = supabase
    .from('inv_missions')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: user.id,
      rejection_reason: reason,
    })
    .eq('id', id)

  if (user.role === 'manager') {
    query = query.eq('manager_id', user.id).eq('status', 'submitted')
  } else {
    query = query.in('status', ['submitted', 'manager_approved'])
  }

  const { error } = await query
  if (error) {
    console.error('[rejectMission]', error.message)
    return
  }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'mission',
    entityId: id,
    action: 'reject',
    payload: { reason },
  })

  await notifyMissionRejected(id)

  revalidatePath('/validation')
  revalidatePath('/admin')
}

/**
 * Corrige une prestation pendant la vérification : libellé, quantité, prix.
 * Le manager ne touche qu'à ses propres lignes et jusqu'à la fin du mois ;
 * l'administrateur, à tout ce qui n'est pas encore facturé.
 */
export async function corrigerMission(formData: FormData): Promise<CorrectionResultat> {
  const user = await requireRole('manager', 'admin')
  const id = String(formData.get('mission_id') ?? '')
  const detail = String(formData.get('detail') ?? '').trim()
  const quantity = Number(formData.get('quantity'))
  const unit = Number(formData.get('unit_amount_ht'))
  const nouveauManager = String(formData.get('manager_id') ?? '').trim()
  if (!id || detail.length < 3 || !(quantity > 0) || !(unit >= 0)) {
    return { error: 'Corrigez la désignation, la quantité et le montant avant d’enregistrer.' }
  }

  const db = createServiceClient()
  const { data: m } = await db
    .from('inv_missions')
    .select('id, manager_id, status, start_date, detail, quantity, unit_amount_ht, total_ht, abatement_rate, invoice_id')
    .eq('id', id)
    .maybeSingle()
  if (!m) return { error: 'Prestation introuvable.' }
  if (m.invoice_id) return { error: 'Cette prestation est déjà facturée : elle ne se corrige plus.' }
  if (!['submitted', 'manager_approved', 'approved'].includes(m.status)) {
    return { error: 'Cette prestation n’est plus au stade de la vérification.' }
  }
  if (user.role === 'manager' && m.manager_id !== user.id) {
    return { error: 'Cette prestation ne vous est pas rattachée.' }
  }

  // Réattribuer, c'est envoyer la ligne se faire vérifier ailleurs : on ne
  // la confie qu'à quelqu'un qui encadre vraiment, et encore en poste.
  let managerId = m.manager_id
  let reattribue = false
  if (nouveauManager && nouveauManager !== m.manager_id) {
    const { data: cible } = await db
      .from('inv_users')
      .select('id, full_name')
      .eq('id', nouveauManager)
      .in('role', ['manager', 'admin'])
      .eq('is_active', true)
      .maybeSingle()
    if (!cible) return { error: 'Cette personne n’encadre pas, ou n’est plus en poste.' }
    managerId = cible.id
    reattribue = true
  }

  // Le mois clos protège les montants, pas l'aiguillage. Une ligne tombée
  // chez la mauvaise personne doit pouvoir partir chez la bonne, sinon elle
  // reste bloquée chez quelqu'un qui ne peut plus rien en faire — c'est
  // exactement ce qui arrivait aux prestations d'août.
  const fenetreOuverte = user.role === 'admin' || managerCanEdit(m.start_date)
  const montantChange =
    detail !== m.detail ||
    quantity !== Number(m.quantity) ||
    unit !== Number(m.unit_amount_ht)
  if (!fenetreOuverte && montantChange) {
    const c = cycleForDate(m.start_date)
    return {
      error: `${c.label} est clos depuis le ${formatDateLong(c.reviewEnd)} : le montant ne se corrige plus, seul l’administrateur peut le reprendre.${reattribue ? ' Le changement de manager, lui, a été refusé avec le reste — réessayez sans toucher au montant.' : ''}`,
    }
  }

  // On recalcule avec le taux figé sur la ligne : corriger un montant ne
  // doit pas faire réapparaître l'abattement, ni le faire disparaître.
  const total = round2(quantity * unit * (1 - Number(m.abatement_rate ?? 0) / 100))
  const { error: err } = await db
    .from('inv_missions')
    .update({ detail, quantity, unit_amount_ht: unit, total_ht: total, manager_id: managerId })
    .eq('id', id)
  if (err) return { error: `Enregistrement impossible : ${err.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'mission',
    entityId: id,
    action: 'correction',
    payload: {
      avant: { detail: m.detail, quantity: Number(m.quantity), unit_amount_ht: Number(m.unit_amount_ht), total_ht: Number(m.total_ht), manager_id: m.manager_id },
      apres: { detail, quantity, unit_amount_ht: unit, total_ht: total, manager_id: managerId },
    },
  })

  revalidatePath('/validation')
  return {
    message: reattribue
      ? 'Correction enregistrée. La prestation part chez le manager choisi : elle disparaît de votre liste.'
      : 'Correction enregistrée.',
  }
}

export interface CorrectionResultat {
  message?: string
  error?: string
}

export interface AjoutResultat {
  message?: string
  error?: string
}

/**
 * Ajoute un prestataire, depuis l'écran d'un manager.
 *
 * Deux champs suffisent : un nom, une adresse. Le reste — SIRET, adresse
 * postale, IBAN — c'est la personne qui le remplira, elle seule le connaît.
 * L'accès et le calendrier du mois partent dans la foulée si on le demande.
 */
export async function ajouterPrestataire(
  _prev: AjoutResultat | null,
  fd: FormData
): Promise<AjoutResultat> {
  const user = await requireRole('manager', 'admin')
  const nom = String(fd.get('nom') ?? '').trim()
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const telephone = String(fd.get('telephone') ?? '').trim() || null
  const prevenir = fd.get('prevenir') === '1'

  if (nom.length < 3) return { error: 'Indiquez le nom et le prénom.' }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return { error: 'Cette adresse email n’est pas valide.' }

  const db = createServiceClient()
  const trouve = await trouverOuCreerPrestataire(db, { nom, email, telephone })
  if ('error' in trouve) return { error: trouve.error }

  // Le manager qui l'ajoute devient son interlocuteur par défaut.
  if (trouve.cree) {
    await db.from('inv_providers').update({ default_manager_id: user.id }).eq('id', trouve.providerId)
  }

  if (prevenir) {
    const envoye = await sendInvitation(trouve.userId, user.id)
    if (envoye) {
      const cycle = cycleForDate(todayParis())
      await deliver({
        to: { email, name: nom },
        ...templates.monthCalendar({ name: nom, public: 'prestataire', cycle }),
        template: 'month_calendar',
        attachments: [{ name: guideNom('prestataire'), content: (await guidePdf('prestataire', cycle)).toString('base64') }],
        entityType: 'user',
        entityId: trouve.userId,
      })
    }
  }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: trouve.providerId,
    action: trouve.cree ? 'prestataire_ajoute' : 'prestataire_retrouve',
    payload: { email, prevenir },
  })
  revalidatePath('/validation')

  return {
    message: trouve.cree
      ? `${nom} est ajouté${prevenir ? ' et a reçu son accès ainsi que le calendrier du mois' : ''}.`
      : `${nom} était déjà sur la plateforme${prevenir ? ', son accès vient de lui être renvoyé' : ''}.`,
  }
}
