import { createServerSupabase } from '@/lib/supabase/server'
import type { Category } from '@/lib/types'

/** Categories proposables au prestataire (la RLS filtre deja visible/actif). */
export async function getProviderCategories(): Promise<
  Pick<Category, 'id' | 'name' | 'provider_label'>[]
> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_categories')
    .select('id, name, provider_label')
    .eq('is_active', true)
    .eq('visible_to_provider', true)
    .order('sort_order')
  return data ?? []
}

/** Donneurs d'ordre selectionnables : managers et admins actifs. */
export async function getManagers(): Promise<{ id: string; full_name: string }[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_users')
    .select('id, full_name')
    .in('role', ['manager', 'admin'])
    .eq('is_active', true)
    .order('full_name')
  return data ?? []
}
