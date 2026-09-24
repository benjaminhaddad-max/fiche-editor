'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { cycleForDate, managerCanEdit, providerCanDeclare } from '@/lib/cycle'
import { formatDateLong, round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

export interface DeclarationResult {
  error?: string
  success?: string
  /** Erreurs par ligne, indexées sur la position dans le formulaire. */
  lineErrors?: Record<number, string>
}

const Ligne = z.object({
  category_id: z.uuid('Choisissez le type de prestation.'),
  /** Le manager qui a confié CETTE mission. À défaut, celui de l'en-tête. */
  manager_id: z.union([z.uuid(), z.literal('')]).optional(),
  detail: z.string().trim().min(3, 'Décrivez la prestation.').max(500),
  date: z.iso.date('Date invalide.'),
  kind: z.enum(['prestation', 'bonus']).default('prestation'),
  /** Salarié : le montant est-il en brut ou en net ? Vide pour un indépendant. */
  pay_basis: z.union([z.enum(['brut', 'net']), z.literal('')]).optional(),
  /** Formation concernée, écrite librement : PASS, LAS, Terminale Santé… */
  formation: z.string().trim().max(120).optional(),
  /** Rattrapage d'un mois clos : la date reste vraie, le paiement suit le cycle en cours. */
  regularisation: z.coerce.boolean().optional(),
  pricing_type: z.enum(['forfait_mission', 'forfait_horaire', 'forfait_journalier']),
  quantity: z.coerce.number<number>().positive('Quantité supérieure à 0.').max(10000),
  unit_amount_ht: z.coerce.number<number>().nonnegative('Montant invalide.').max(1000000),
})

const Entete = z.object({
  provider_id: z.uuid().optional(),
  /** Manager par défaut : celui des lignes qui n'en nomment pas d'autre. */
  manager_id: z.uuid('Indiquez le manager concerné.'),
  intent: z.enum(['submit', 'draft']).default('submit'),
})

/**
 * Enregistre une déclaration à plusieurs lignes, comme une facture.
 *
 * Chaque ligne devient une prestation à part entière — c'est ce qui permet
 * de valider, refuser ou facturer ligne à ligne — mais elles partagent un
 * identifiant de déclaration pour rester regroupées à l'écran.
 *
 *   prestataire   lignes « en attente manager », jusqu'à L−3 du mois
 *   manager       lignes déjà validées par lui, jusqu'à L
 *   admin         lignes validées, sans limite de date
 *
 * Chaque ligne porte son manager : quelqu'un qui enregistre des cours pour
 * l'une et fait du commercial pour l'autre déclare tout d'un coup, et chaque
 * ligne part en vérification chez la bonne personne.
 */
export async function declarer(
  _prev: DeclarationResult,
  formData: FormData
): Promise<DeclarationResult> {
  const user = await getSessionUser()
  if (!user) return { error: 'Session expirée, reconnectez-vous.' }

  const entete = Entete.safeParse({
    provider_id: formData.get('provider_id') || undefined,
    manager_id: formData.get('manager_id') || undefined,
    intent: formData.get('intent') || undefined,
  })
  if (!entete.success) return { error: entete.error.issues[0].message }

  let brutes: unknown[]
  try {
    brutes = JSON.parse(String(formData.get('lignes') ?? '[]'))
  } catch {
    return { error: 'Lignes illisibles, rechargez la page.' }
  }
  if (!Array.isArray(brutes) || brutes.length === 0) return { error: 'Ajoutez au moins une ligne.' }
  if (brutes.length > 60) return { error: '60 lignes au plus par déclaration.' }

  const db = createServiceClient()

  // ---- Pour qui ?
  let providerId: string
  if (user.role === 'prestataire') {
    const { data: p } = await db.from('inv_providers').select('id').eq('user_id', user.id).maybeSingle()
    if (!p) return { error: 'Fiche prestataire introuvable.' }
    providerId = p.id
  } else {
    if (!entete.data.provider_id) return { error: 'Choisissez le prestataire.' }
    providerId = entete.data.provider_id
  }

  const { data: provider } = await db
    .from('inv_providers')
    .select('id, legal_name, employment_type')
    .eq('id', providerId)
    .maybeSingle()
  if (!provider) return { error: 'Prestataire introuvable.' }

  // Un manager déclare en son nom ; seul l'administrateur choisit librement.
  const managerId = user.role === 'manager' ? user.id : entete.data.manager_id

  // Les identifiants viennent du navigateur : on ne rattache une prestation
  // qu'à quelqu'un qui encadre vraiment, et qui est encore en poste.
  const { data: encadrants } = await db
    .from('inv_users')
    .select('id')
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
  const encadre = new Set((encadrants ?? []).map((e) => e.id as string))
  if (!encadre.has(managerId)) return { error: 'Ce manager n’est plus en poste, choisissez-en un autre.' }

  // ---- Lignes
  const lignes: z.infer<typeof Ligne>[] = []
  const lineErrors: Record<number, string> = {}
  brutes.forEach((b, i) => {
    const r = Ligne.safeParse(b)
    if (!r.success) {
      lineErrors[i] = r.error.issues[0].message
      return
    }
    if (r.data.manager_id && !encadre.has(r.data.manager_id)) {
      lineErrors[i] = 'Ce manager n’est plus en poste.'
      return
    }
    if (r.data.kind === 'bonus' && provider.employment_type === 'independant') {
      lineErrors[i] = 'Les bonus concernent les vacataires et alternants.'
      return
    }
    if (user.role === 'prestataire' && !providerCanDeclare(r.data.date) && !r.data.regularisation) {
      const c = cycleForDate(r.data.date)
      lineErrors[i] = `Trop tard pour ${c.label} (clôture le ${formatDateLong(c.declarationDeadline)}). Cochez « régularisation » si c’est un rattrapage, ou demandez à votre manager de l’ajouter.`
      return
    }
    if (user.role === 'manager' && !managerCanEdit(r.data.date)) {
      const c = cycleForDate(r.data.date)
      lineErrors[i] = `${c.label} est clos depuis le ${formatDateLong(c.reviewEnd)}. Seul l’administrateur peut encore l’ajouter.`
      return
    }
    lignes.push(r.data)
  })
  if (Object.keys(lineErrors).length) {
    return { error: 'Certaines lignes sont à corriger.', lineErrors }
  }

  const now = new Date().toISOString()
  const brouillon = user.role === 'prestataire' && entete.data.intent === 'draft'
  const status =
    user.role === 'admin' ? 'approved' : user.role === 'manager' ? 'manager_approved' : brouillon ? 'draft' : 'submitted'

  const declarationId = randomUUID()
  const rows = lignes.map((l) => ({
    provider_id: providerId,
    manager_id: user.role === 'manager' ? user.id : l.manager_id || managerId,
    category_id: l.category_id,
    detail: l.detail,
    start_date: l.date,
    end_date: l.date,
    kind: l.kind,
    formation: l.formation || null,
    // Une régularisation ne se déclare que sur un mois déjà clos ; ailleurs,
    // la case cochée par mégarde ne doit rien changer.
    regularisation: Boolean(l.regularisation) && !providerCanDeclare(l.date),
    // Un indépendant facture : la question brut/net ne se pose pas pour lui.
    pay_basis: provider.employment_type === 'independant' ? null : l.pay_basis || 'brut',
    pricing_type: l.kind === 'bonus' ? 'forfait_mission' : l.pricing_type,
    quantity: l.kind === 'bonus' ? 1 : l.quantity,
    unit_amount_ht: l.kind === 'bonus' ? round2(l.quantity * l.unit_amount_ht) : l.unit_amount_ht,
    total_ht: round2(l.quantity * l.unit_amount_ht),
    status,
    origin: user.role === 'prestataire' ? 'provider' : 'manager',
    declaration_id: declarationId,
    declared_by: user.id,
    submitted_at: brouillon ? null : now,
    ...(user.role !== 'prestataire' ? { manager_approved_at: now, manager_approved_by: user.id } : {}),
    ...(user.role === 'admin' ? { admin_approved_at: now, admin_approved_by: user.id } : {}),
  }))

  const { error } = await db.from('inv_missions').insert(rows)
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  const total = round2(rows.reduce((s, r) => s + r.total_ht, 0))
  await logAudit(null, {
    actorId: user.id,
    entityType: 'mission',
    entityId: declarationId,
    action: user.role === 'prestataire' ? 'declaration' : 'declaration_pour_prestataire',
    payload: { provider_id: providerId, lignes: rows.length, total_ht: total },
  })

  revalidatePath('/missions')
  revalidatePath('/validation')

  const n = rows.length
  const quoi = `${n} ligne${n > 1 ? 's' : ''} — ${total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} HT`
  if (user.role === 'prestataire') {
    return {
      success: brouillon
        ? `${quoi} enregistrée${n > 1 ? 's' : ''} en brouillon.`
        : `${quoi} envoyée${n > 1 ? 's' : ''} en validation.`,
    }
  }
  return { success: `${quoi} déclarée${n > 1 ? 's' : ''} pour ${provider.legal_name}, déjà validée${n > 1 ? 's' : ''}.` }
}
