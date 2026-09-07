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
  ClipboardList,
  FileUp,
  Receipt,
  ScrollText,
  Tags,
  KeyRound,
  UserCircle,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
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
        { href: '/bordereaux', label: 'Mes bordereaux', icon: ClipboardList, prefix: true },
        { href: '/factures', label: 'Mes factures', icon: Receipt },
        { href: '/factures/deposer', label: 'Déposer une facture', icon: FileUp, prefix: true },
        { href: '/profil', label: 'Mes informations', icon: UserCircle },
      ],
    },
  ],
  manager: [
    {
      section: 'Validation',
      items: [
        { href: '/validation', label: 'À valider', icon: CheckSquare },
        { href: '/validation/bordereaux', label: 'Bordereaux', icon: ClipboardList },
        { href: '/validation/historique', label: 'Historique', icon: FileText },
      ],
    },
  ],
  admin: [
    {
      section: 'Pilotage',
      items: [
        { href: '/admin', label: 'Tableau de bord', icon: LayoutDashboard },
        { href: '/admin/prestations', label: 'Toutes les prestations', icon: ListChecks },
        { href: '/validation', label: 'Prestations à valider', icon: CheckSquare },
        { href: '/validation/bordereaux', label: 'Bordereaux', icon: ClipboardList },
        { href: '/admin/factures', label: 'Factures', icon: Receipt, prefix: true },
        { href: '/admin/contrats', label: 'Contrats de coaching', icon: ScrollText, prefix: true },
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
  banner,
  children,
}: {
  user: { full_name: string; email: string; role: Role }
  banner?: React.ReactNode
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
      <aside className="flex w-64 shrink-0 flex-col bg-navy text-cream/70">
        <div className="ds-accent-bar h-1" />
        <div className="border-b border-white/10 px-6 py-5">
          <Logo tone="light" />
          <p className="ds-eyebrow mt-2 text-gold/70">Diploma Santé</p>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV[user.role].map((group) => (
            <div key={group.section} className="mb-5">
              <p className="ds-eyebrow px-3 pb-2 text-cream/40">{group.section}</p>
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
                          ? 'bg-gold font-medium text-navy'
                          : 'hover:bg-white/5 hover:text-cream'
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
                ? 'bg-gold font-medium text-navy'
                : 'text-cream/60 hover:bg-white/5 hover:text-cream'
            )}
          >
            <KeyRound size={17} />
            Mon compte
          </Link>

          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-cream">{user.full_name}</p>
            <p className="truncate text-xs text-cream/50">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-cream/60 transition-colors hover:bg-white/5 hover:text-cream disabled:opacity-50"
          >
            <LogOut size={17} />
            {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-auto bg-cream">
        {banner}
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
