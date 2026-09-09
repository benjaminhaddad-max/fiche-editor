'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireProvider } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface ProfileResult {
  error?: string
  success?: boolean
  fieldErrors?: Record<string, string>
}

/**
 * Champ facultatif. Tolère aussi l'ABSENCE du champ : un champ masqué à
 * l'écran — la TVA intracommunautaire quand on est en franchise — n'est pas
 * envoyé du tout, et doit valoir null plutôt que faire échouer le formulaire.
 */
const optional = (schema: z.ZodType<string>) =>
  z
    .union([schema, z.literal('')])
    // .optional() est indispensable : un champ masqué à l'écran n'est pas
    // envoyé du tout, et une union acceptant `undefined` ne suffit pas —
    // Zod exige la présence de la CLÉ. C'est ce détail qui empêchait tous
    // les auto-entrepreneurs d'enregistrer leur profil, la TVA
    // intracommunautaire étant masquée en franchise.
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v))

const ProfileSchema = z
  .object({
    legal_name: z.string().trim().min(2, 'Raison sociale obligatoire.'),
    legal_form: optional(z.string().trim()),
    // L'article liminaire du contrat prévoit le cas : « si l'auto-entreprise
    // est en cours de création, mentionner "en cours" ». On l'accepte donc
    // tel quel, en le normalisant pour qu'il s'affiche pareil sur toutes les
    // factures.
    siret: optional(
      z
        .string()
        .trim()
        .transform((v) => (/^en\s*cours$/i.test(v) ? 'en cours' : v.replace(/\s+/g, '')))
        .refine(
          (v) => v === 'en cours' || /^\d{9}(\d{5})?$/.test(v),
          'Indiquez 14 chiffres (ou 9 pour un SIREN), ou « en cours » si votre auto-entreprise est en création.'
        )
    ),
    vat_number: optional(z.string().trim()),
    address_line1: z.string().trim().min(3, 'Adresse obligatoire.'),
    address_line2: optional(z.string().trim()),
    postal_code: z.string().trim().regex(/^\d{4,10}$/, 'Code postal invalide.'),
    city: z.string().trim().min(1, 'Ville obligatoire.'),
    country: z.string().trim().min(2, 'Pays obligatoire.'),
    phone: optional(z.string().trim()),
    iban: optional(
      z
        .string()
        .trim()
        .transform((v) => v.replace(/\s+/g, '').toUpperCase())
        .refine((v) => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), 'IBAN invalide.')
    ),
    bic: optional(z.string().trim().transform((v) => v.toUpperCase())),
    vat_regime: z.enum(['franchise', 'normal']),
    invoice_mode: z.enum(['generated', 'uploaded']),
  })
  .transform((v) => ({
    ...v,
    // La contrainte SQL impose 0 en franchise et > 0 sinon : on l'applique ici
    // pour ne pas dependre d'un champ saisi.
    vat_rate: v.vat_regime === 'franchise' ? 0 : 20,
  }))
  .refine(
    (v) => v.vat_regime === 'franchise' || Boolean(v.vat_number),
    { message: 'Numéro de TVA obligatoire si vous êtes assujetti.', path: ['vat_number'] }
  )

/** Pour que le récapitulatif d'erreurs nomme le champ, pas seulement le défaut. */
const LIBELLES: Record<string, string> = {
  legal_name: 'Raison sociale',
  legal_form: 'Forme juridique',
  siret: 'SIRET',
  vat_number: 'Numéro de TVA',
  address_line1: 'Adresse',
  address_line2: 'Complément d’adresse',
  postal_code: 'Code postal',
  city: 'Ville',
  country: 'Pays',
  phone: 'Téléphone',
  iban: 'IBAN',
  bic: 'BIC',
  vat_regime: 'Régime de TVA',
  invoice_mode: 'Mode de facturation',
}


/**
 * Journalise un échec d'enregistrement.
 *
 * Sans cette trace, un prestataire qui n'y arrive pas n'existe nulle part :
 * on ne l'apprend que s'il prend la peine d'écrire, et on ne peut alors ni
 * dater ni reproduire sa panne. On note ce qui a bloqué et quels champs
 * étaient présents — jamais leur contenu, il y a un IBAN là-dedans.
 */
async function journaliserEchec(
  providerId: string,
  actorId: string,
  raison: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await createServiceClient().from('inv_audit_log').insert({
      actor_id: actorId,
      entity_type: 'provider',
      entity_id: providerId,
      action: `profile_save_${raison}`,
      payload: detail,
    })
  } catch {
    /* Le journal ne doit jamais empêcher la réponse à l'utilisateur. */
  }
}

export async function updateProfile(
  _prev: ProfileResult,
  formData: FormData
): Promise<ProfileResult> {
  const { user, provider } = await requireProvider()

  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_')
      const nom = LIBELLES[key]
      fieldErrors[key] ??= nom ? `${nom} : ${issue.message}` : issue.message
    }
    await journaliserEchec(provider.id, user.id, 'rejected', {
      champs_refuses: fieldErrors,
      champs_transmis: [...formData.keys()],
    })
    return { fieldErrors }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('inv_providers')
    .update({ ...parsed.data, onboarding_complete: true })
    .eq('id', provider.id)
    .select('id')

  if (error) {
    await journaliserEchec(provider.id, user.id, 'error', { message: error.message })
    return { error: `Enregistrement impossible : ${error.message}` }
  }

  // Une écriture refusée par la sécurité en base ne renvoie pas d'erreur :
  // elle ne touche simplement aucune ligne. Sans ce contrôle, l'utilisateur
  // voyait « enregistré » alors que rien n'était sauvegardé.
  if (!data || data.length === 0) {
    await journaliserEchec(provider.id, user.id, 'empty', {})
    return {
      error:
        'Vos informations n’ont pas pu être enregistrées (aucune ligne modifiée). ' +
        'Déconnectez-vous puis reconnectez-vous, et réessayez.',
    }
  }

  revalidatePath('/profil')
  return { success: true }
}
