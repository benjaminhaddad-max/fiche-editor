import { createServerSupabase } from '@/lib/supabase/server'
import { brandScope, getBrandId } from '@/lib/brand'
import type { Category } from '@/lib/types'

/*
 * Ces fonctions alimentent la plupart des écrans : les listes de managers,
 * de catégories et de prestataires viennent d'ici. Elles sont donc le
 * premier endroit à borner — une seule d'entre elles laissée ouverte suffit
 * à faire apparaître l'autre école dans un menu déroulant, et à y router une
 * prestation.
 *
 * Une catégorie peut être commune aux deux écoles : elle porte « all », d'où
 * `brandScope()` plutôt qu'une égalité stricte.
 */

/** Categories proposables au prestataire (la RLS filtre deja visible/actif). */
export async function getProviderCategories(): Promise<
  Pick<Category, 'id' | 'name' | 'provider_label'>[]
> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_categories')
    .select('id, name, provider_label')
    .in('brand', brandScope())
    .eq('is_active', true)
    .eq('visible_to_provider', true)
    .order('sort_order')
  return data ?? []
}

/** Managers selectionnables : managers et admins actifs. */
export async function getManagers(): Promise<{ id: string; full_name: string }[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_users')
    .select('id, full_name')
    .eq('brand', getBrandId())
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}

/** Catégories actives avec leur pôle, pour les formulaires de déclaration. */
export async function getCategoriesWithPole(opts: { forProvider?: boolean } = {}) {
  const supabase = await createServerSupabase()
  let q = supabase
    .from('inv_categories')
    .select('id, name, provider_label, pole, requires_session')
    .in('brand', brandScope())
    .eq('is_active', true)
    .order('sort_order')
  if (opts.forProvider) q = q.eq('visible_to_provider', true)
  const { data } = await q
  return (data ?? []).map((c) => ({
    id: c.id as string,
    label: (c.provider_label as string | null) || (c.name as string),
    pole: c.pole as import('@/lib/types').Pole,
    requiresSession: c.requires_session === true,
  }))
}

/**
 * Prestataires actifs, avec leur statut. Un fournisseur sans compte (reçu
 * par email) n'est pas proposé : on ne déclare pas de prestation pour lui.
 */
export async function getActiveProviders() {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const db = createServiceClient()
  const { data } = await db
    .from('inv_providers')
    .select('id, legal_name, employment_type, user:inv_users!inv_providers_user_id_fkey!inner(full_name, is_active)')
    .eq('brand', getBrandId())
    .eq('user.is_active', true)
  return ((data ?? []) as unknown as {
    id: string
    legal_name: string
    employment_type: import('@/lib/types').Employment
    user: { full_name: string } | null
  }[])
    .map((p) => ({ id: p.id, name: p.user?.full_name ?? p.legal_name, employment: p.employment_type }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}
