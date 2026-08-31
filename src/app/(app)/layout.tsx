import { AppShell } from '@/components/layout/AppShell'
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner'
import { requireUser } from '@/lib/auth'
import { getImpersonator } from '@/lib/impersonation'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const impersonator = await getImpersonator()

  return (
    <AppShell
      user={{ full_name: user.full_name, email: user.email, role: user.role }}
      banner={
        impersonator ? (
          <ImpersonationBanner admin={impersonator} viewing={user.full_name} />
        ) : null
      }
    >
      {children}
    </AppShell>
  )
}
