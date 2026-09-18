'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import {
  ClipboardList,
  FileUp,
  KeyRound,
  ListChecks,
  LogOut,
  MessageSquare,
  Receipt,
  ScrollText,
  Tags,
  UserCircle,
  Users,
  Wallet,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/ui/Logo'
import { ROLE_LABEL } from '@/lib/labels'
import type { Role } from '@/lib/types'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number | string }>
  /** Actif aussi sur les sous-routes et sur ces autres chemins. */
  prefixes?: string[]
  badge?: number
}

/**
 * Le moins d'entrées possible : chaque page regroupe ses vues en onglets.
 * Un salarié n'a pas de facturation ; un fournisseur sans compte n'a pas
 * d'espace du tout.
 */
function navFor(role: Role, salarie: boolean, unread: number): NavItem[] {
  const messages: NavItem = { href: '/messages', label: 'Messages', icon: MessageSquare, prefixes: ['/messages'], badge: unread }
  if (role === 'prestataire') {
    return [
      { href: '/missions', label: 'Prestations', icon: ListChecks, prefixes: ['/missions'] },
      ...(salarie
        ? [{ href: '/elements-paie', label: 'Mes éléments de paie', icon: Wallet, prefixes: ['/elements-paie'] }]
        : [{ href: '/factures', label: 'Facturation', icon: Receipt, prefixes: ['/factures', '/bordereaux'] }]),
      { href: '/documents', label: 'Mes documents', icon: ScrollText, prefixes: ['/documents', '/contrats'] },
      messages,
      { href: '/profil', label: 'Mes informations', icon: UserCircle, prefixes: ['/profil'] },
    ]
  }
  const communs: NavItem[] = [
    { href: '/validation', label: 'Prestations', icon: ListChecks, prefixes: ['/validation'] },
    { href: '/bons-de-mission', label: 'Bons de mission', icon: ClipboardList, prefixes: ['/bons-de-mission'] },
    { href: '/paie-du-mois', label: 'Éléments de paie', icon: Wallet, prefixes: ['/paie-du-mois'] },
  ]
  if (role === 'manager') {
    return [
      ...communs,
      { href: '/admin/contrats', label: 'Contrats', icon: ScrollText, prefixes: ['/admin/contrats'] },
      { href: '/factures-diverses', label: 'Déposer une facture', icon: FileUp, prefixes: ['/factures-diverses'] },
      messages,
    ]
  }
  return [
    ...communs,
    { href: '/admin/factures', label: 'Factures', icon: Receipt, prefixes: ['/admin/factures'] },
    { href: '/admin/paie', label: 'Paie', icon: Wallet, prefixes: ['/admin/paie'] },
    { href: '/admin/contrats', label: 'Contrats', icon: ScrollText, prefixes: ['/admin/contrats'] },
    { href: '/admin/equipe', label: 'Équipe', icon: Users, prefixes: ['/admin/equipe', '/admin/prestataires'] },
    messages,
  ]
}

export function AppShell({
  user,
  banner,
  salarie = false,
  unread = 0,
  children,
}: {
  user: { full_name: string; email: string; role: Role }
  banner?: React.ReactNode
  salarie?: boolean
  unread?: number
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    // Portée locale : se déconnecter ici ne doit pas fermer les sessions
    // ouvertes ailleurs — et surtout pas celles du compte visité quand un
    // administrateur a pris la main.
    await createClient().auth.signOut({ scope: 'local' })
    router.push('/login')
    router.refresh()
  }

  function isActive(item: NavItem) {
    return (item.prefixes ?? [item.href]).some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-cream-muted">
        <div className="ds-rail-header flex items-center px-4 py-4">
          <Logo tone="light" />
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-0.5">
            {navFor(user.role, salarie, unread).map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive(item)
                      ? 'bg-navy font-medium text-cream shadow-sm'
                      : 'text-navy/70 hover:bg-cream-deep hover:text-navy'
                  )}
                >
                  <Icon size={17} />
                  <span className="flex-1">{item.label}</span>
                  {!!item.badge && (
                    <span className="rounded-full bg-gold px-1.5 py-px text-[11px] font-semibold text-navy">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-line p-3">
          {user.role === 'admin' && (
            <Link
              href="/admin/categories"
              className={clsx(
                'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                pathname === '/admin/categories'
                  ? 'bg-navy font-medium text-cream'
                  : 'text-navy/70 hover:bg-cream-deep hover:text-navy'
              )}
            >
              <Tags size={17} />
              Catégories
            </Link>
          )}
          <Link
            href="/compte"
            className={clsx(
              'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              pathname === '/compte'
                ? 'bg-navy font-medium text-cream'
                : 'text-navy/70 hover:bg-cream-deep hover:text-navy'
            )}
          >
            <KeyRound size={17} />
            Mon compte
          </Link>

          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium text-navy">{user.full_name}</p>
            <p className="truncate text-xs text-muted">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-cream-deep hover:text-navy disabled:opacity-50"
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
