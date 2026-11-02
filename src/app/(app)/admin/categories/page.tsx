import { PageHeader } from '@/components/ui/Page'
import { getManagers } from '@/lib/queries'
import { CategoryManager } from '@/components/admin/CategoryManager'
import { requireRole } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Category } from '@/lib/types'
import { saveCategory } from '../actions'
import { activeBrand, activeBrandScope } from '@/lib/brand/actif'

export default async function CategoriesPage() {
  await requireRole('admin')
  const supabase = await createServerSupabase()
  const { comptabilite } = await activeBrand()

  const { data } = await supabase
    .from('inv_categories')
    .select('*')
    .in('brand', (await activeBrandScope()))
    .order('sort_order')
    .order('name')

  return (
    <>
      <PageHeader
        title="Catégories de missions"
        description={
          comptabilite
            ? 'Les types de prestation proposés aux prestataires, et leur ventilation comptable dans Pennylane.'
            : 'Les types de prestation proposés aux prestataires.'
        }
      />
      <CategoryManager
        categories={(data ?? []) as Category[]}
        managers={await getManagers()}
        saveAction={saveCategory}
        comptabilite={comptabilite}
      />
    </>
  )
}
