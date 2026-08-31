import { PageHeader } from '@/components/ui/Page'
import { CategoryManager } from '@/components/admin/CategoryManager'
import { requireRole } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Category } from '@/lib/types'
import { saveCategory } from '../actions'

export default async function CategoriesPage() {
  await requireRole('admin')
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_categories')
    .select('*')
    .order('sort_order')
    .order('name')

  return (
    <>
      <PageHeader
        title="Catégories de missions"
        description="Les types de prestation proposés aux prestataires, et leur ventilation comptable dans Pennylane."
      />
      <CategoryManager
        categories={(data ?? []) as Category[]}
        saveAction={saveCategory}
      />
    </>
  )
}
