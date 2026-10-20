import { AppShell } from '@/components/layout/AppShell'
import { MarqueProvider } from '@/components/brand/MarqueProvider'
import { activeBrand } from '@/lib/brand/actif'
import { FicheAcompleter } from '@/components/profile/FicheAcompleter'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { requireUser } from '@/lib/auth'
import { getImpersonator } from '@/lib/impersonation'
import { createServerSupabase } from '@/lib/supabase/server'
import { countUnread } from '@/lib/threads'
import { isSalaried } from '@/lib/types'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const impersonator = await getImpersonator(user)

  let salarie = false
  if (user.role === 'prestataire') {
    const supabase = await createServerSupabase()
    const { data } = await supabase.from('inv_providers').select('employment_type').eq('user_id', user.id).maybeSingle()
    salarie = isSalaried(data?.employment_type)
  }
  const unread = await countUnread(user.id)
  const marque = await activeBrand()

  return (
    <MarqueProvider valeur={marque}>
    <AppShell
      user={{ full_name: user.full_name, email: user.email, role: user.role }}
      salarie={salarie}
      unread={unread}
      banner={
        <>
          {impersonator && <ImpersonationBanner admin={impersonator} viewing={user.full_name} />}
          {user.role === 'prestataire' && <FicheAcompleter userId={user.id} />}
        </>
      }
    >
      {children}
    </AppShell>
    </MarqueProvider>
  )
}

/** Le titre de l'onglet suit la marque affichée, pas celle du déploiement. */
export async function generateMetadata() {
  const m = await activeBrand()
  return { title: m.appTitle, description: m.description }
}
