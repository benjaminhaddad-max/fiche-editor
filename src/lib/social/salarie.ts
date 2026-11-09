import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import type { AppUser } from '@/lib/types'
import { COLONNES_FICHE, salarieDeLaFiche } from './donnees'
import type { Salarie } from './saisie'

/**
 * La fiche salarié de la personne connectée, quel que soit son rôle : un
 * manager comme Ilan ou Jennifer est aussi salarié et remplit son
 * formulaire comme les autres.
 */
export async function maFicheSalarie(user: AppUser): Promise<Salarie | null> {
  const { data } = await createServiceClient()
    .from('inv_providers')
    .select(COLONNES_FICHE)
    .eq('user_id', user.id)
    .eq('brand', await activeBrandId())
    .not('social_profile', 'is', null)
    .maybeSingle()
  return data ? salarieDeLaFiche(data as unknown as Parameters<typeof salarieDeLaFiche>[0]) : null
}

/** Garde du formulaire mensuel : réservé aux personnes rattachées à l'Espace Social. */
export async function requireSalarie(): Promise<{ user: AppUser; salarie: Salarie }> {
  const user = await requireUser()
  const salarie = await maFicheSalarie(user)
  if (!salarie) redirect(user.role === 'prestataire' ? '/missions' : '/validation')
  return { user, salarie }
}
