'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import {
  Building2,
  CheckSquare,
  FileText,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Receipt,
  Tags,
  KeyRound,
  UserCircle,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABEL } from '@/lib/labels'
import type { Role } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number | string }>
  /** Actif meme sur les sous-routes (ex: /missions/new). */
  prefix?: boolean
}

const NAV: Record<Role, { section: string; items: NavItem[] }[]> = {
  prestataire: [
    {
      section: 'Mon activité',
      items: [
        { href: '/missions', label: 'Mes prestations', icon: ListChecks, prefix: true },
        { href: '/factures', label: 'Mes factures', icon: Receipt, prefix: true },
        { href: '/profil', label: 'Mes informations', icon: UserCircle },
      ],
    },
  ],
  manager: [
    {
      section: 'Validation',
      items: [
        { href: '/validation', label: 'À valider', icon: CheckSquare },
        { href: '/validation/historique', label: 'Historique', icon: FileText },
      ],
    },
  ],
  admin: [
    {
      section: 'Pilotage',
      items: [
        { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
        { href: '/validation', label: 'Prestations à valider', icon: CheckSquare },
        { href: '/admin/factures', label: 'Factures', icon: Receipt, prefix: true },
      ],
    },
    {
      section: 'Paramètres',
      items: [
        { href: '/admin/prestataires', label: 'Prestataires', icon: Building2, prefix: true },
        { href: '/admin/categories', label: 'Catégories de missions', icon: Tags },
        { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
      ],
    },
  ],
}

export function AppShell({
  user,
  children,
}: {
  user: { full_name: string; email: string; role: Role }
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function isActive(item: NavItem) {
    return item.prefix ? pathname.startsWith(item.href) : pathname === item.href
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 text-slate-300">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-base font-bold tracking-tight text-white">Diploma Invoice</p>
          <p className="mt-0.5 text-xs text-slate-400">Diploma Santé</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV[user.role].map((group) => (
            <div key={group.section} className="mb-5">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {group.section}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive(item)
                          ? 'bg-brand-600 font-medium text-white'
                          : 'hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <Icon size={17} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link
            href="/compte"
            className={clsx(
              'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              pathname === '/compte'
                ? 'bg-brand-600 font-medium text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            )}
          >
            <KeyRound size={17} />
            Mon compte
          </Link>

          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
            <p className="truncate text-xs text-slate-400">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <LogOut size={17} />
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto bg-slate-50">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
