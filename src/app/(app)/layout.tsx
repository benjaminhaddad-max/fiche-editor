import { AppShell } from '@/components/layout/AppShell'
import { requireUser } from '@/lib/auth'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  return (
    <AppShell
      user={{ full_name: user.full_name, email: user.email, role: user.role }}
    >
      {children}
    </AppShell>
  )
}
