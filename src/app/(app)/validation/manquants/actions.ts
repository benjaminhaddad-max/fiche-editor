'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { cycleForDate, echeanceDeclaration, todayParis } from '@/lib/cycle'
import { deliver, sendInvitation } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { guideNom, guidePdf } from '@/lib/guides/pdf'
import { champsManquants } from '@/lib/profil'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { isSalaried, type Employment } from '@/lib/types'

export interface RelanceUnResultat {
  /** La personne relancée, pour que le message s'affiche sur sa ligne. */
  userId?: string
  message?: string
  error?: string
}

/**
 * Relance une seule personne, depuis la liste de ceux qui n'ont rien déclaré.
 *
 * La relance groupée écrit à tout le monde d'un coup : utile en début de
 * cycle, trop large le dernier jour, quand il ne reste que deux ou trois
 * noms et qu'on ne veut pas réécrire aux vingt autres. Le message envoyé
 * est le même que celui de la relance groupée — même date limite, même
 * guide pour qui n'est jamais entré.
 */
export async function relancerUn(
  _prev: RelanceUnResultat | null,
  formData: FormData
): Promise<RelanceUnResultat> {
  const user = await requireRole('manager', 'admin')
  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return { error: 'Personne à relancer.' }

  const db = createServiceClient()
  const cycle = cycleForDate(todayParis())

  const { data: cible } = await db
    .from('inv_users')
    .select(
      'id, email, full_name, brand, email_unreachable_reason, provider:inv_providers!inv_providers_user_id_fkey(id, onboarding_complete, employment_type, legal_name, siret, iban, address_line1, postal_code, city, phone, social_security_number, default_manager_id)'
    )
    .eq('id', userId)
    .maybeSingle()

  // Une marque ne relance pas les intervenants d'une autre, même en
  // connaissant leur identifiant.
  if (!cible || cible.brand !== (await activeBrandId())) return { error: 'Introuvable.' }

  const fiche = (Array.isArray(cible.provider) ? cible.provider[0] : cible.provider) as
    | {
        id: string
        onboarding_complete: boolean
        employment_type: Employment
        legal_name: string
        siret: string | null
        iban: string | null
        address_line1: string | null
        postal_code: string | null
        city: string | null
        phone: string | null
        social_security_number: string | null
        default_manager_id: string | null
      }
    | null
  if (!fiche) return { error: 'Cette personne n’a pas de fiche de facturation.' }

  // Un manager ne relance que les siens : rattachés par défaut, ou dont il
  // a déjà validé une prestation. Même règle que la relance groupée.
  if (user.role === 'manager' && fiche.default_manager_id !== user.id) {
    const { count } = await db
      .from('inv_missions')
      .select('id', { count: 'exact', head: true })
      .eq('provider_id', fiche.id)
      .eq('manager_id', user.id)
    if (!count) return { userId, error: 'Cette personne n’est pas rattachée à vous.' }
  }

  if (cible.email_unreachable_reason) {
    return {
      userId,
      error: `Aucun message ne lui arrive (${cible.email_unreachable_reason}) : son adresse est à corriger avant de la relancer.`,
    }
  }

  const nom = cible.full_name as string
  const email = cible.email as string
  const envoyes: string[] = []

  try {
    // Jamais entré : le lien d'accès seul ne suffit pas, il entrerait sans
    // savoir ce qu'on attend de lui. Il reçoit le calendrier et son guide.
    if (!fiche.onboarding_complete) {
      const { data: inv } = await db
        .from('inv_invitations')
        .select('exchanges')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
      const venu = Number(inv?.[0]?.exchanges ?? 0) > 0
      if (!venu) {
        if (!(await sendInvitation(userId, user.id))) return { userId, error: 'L’invitation n’a pas pu partir.' }
        const pour = isSalaried(fiche.employment_type) ? 'salarie' : 'prestataire'
        await deliver({
          to: { email, name: nom },
          ...(await templates()).monthCalendar({ name: nom, public: pour, cycle }),
          template: 'month_calendar',
          attachments: [
            { name: await guideNom(pour), content: (await guidePdf(pour, cycle)).toString('base64') },
          ],
          entityType: 'user',
          entityId: userId,
        })
        envoyes.push('invitation et mode d’emploi')
      }
    }

    if (!envoyes.length) {
      await deliver({
        to: { email, name: nom },
        ...(await templates()).declarationReminder({
          name: nom,
          deadline: echeanceDeclaration(cycle, isSalaried(fiche.employment_type)),
          label: cycle.label,
        }),
        template: 'declaration_reminder',
        entityType: 'user',
        entityId: userId,
      })
      envoyes.push('rappel de déclaration')
    }

    // Une fiche incomplète bloque le paiement même s'il déclare : on le dit
    // dans le même geste, pas au mois suivant.
    const manque = champsManquants(fiche)
    if (manque.length) {
      await deliver({
        to: { email, name: nom },
        ...(await templates()).ficheIncomplete({
          name: nom,
          manque,
          invoiceDeadline: cycle.invoiceDeadline,
          paymentDate: cycle.paymentDate,
          facture: !isSalaried(fiche.employment_type),
        }),
        template: 'fiche_incomplete',
        entityType: 'user',
        entityId: userId,
      })
      envoyes.push('fiche à compléter')
    }
  } catch (e) {
    return { userId, error: e instanceof Error ? e.message : 'L’envoi a échoué.' }
  }

  revalidatePath('/validation/manquants')
  return { userId, message: `Envoyé à ${nom} : ${envoyes.join(', ')}.` }
}
