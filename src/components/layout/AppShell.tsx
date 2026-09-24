'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import {
  ClipboardList,
  Menu,
  X,
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

interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Le menu de Diploma Lab : des rubriques en petites capitales dorées, et sous
 * chacune des entrées en pastille blanche avec leur icône encadrée. Le moins
 * d'entrées possible : chaque page regroupe ses vues en onglets. Un salarié
 * n'a pas de facturation ; un fournisseur sans compte n'a pas d'espace.
 */
function navFor(role: Role, salarie: boolean, unread: number): NavGroup[] {
  const echanges: NavGroup = {
    label: 'Échanges',
    items: [{ href: '/messages', label: 'Messages', icon: MessageSquare, prefixes: ['/messages'], badge: unread }],
  }

  if (role === 'prestataire') {
    return [
      { label: 'Mon activité', items: [{ href: '/missions', label: 'Prestations', icon: ListChecks, prefixes: ['/missions'] }] },
      {
        label: 'Ma rémunération',
        items: salarie
          ? [{ href: '/elements-paie', label: 'Mes éléments de paie', icon: Wallet, prefixes: ['/elements-paie'] }]
          : [{ href: '/factures', label: 'Facturation', icon: Receipt, prefixes: ['/factures', '/bordereaux'] }],
      },
      {
        label: 'Mon dossier',
        items: [
          { href: '/documents', label: 'Mes documents', icon: ScrollText, prefixes: ['/documents', '/contrats'] },
          { href: '/profil', label: 'Mes informations', icon: UserCircle, prefixes: ['/profil'] },
        ],
      },
      echanges,
    ]
  }

  const activite: NavGroup = {
    label: 'Activité',
    items: [
      { href: '/validation', label: 'Prestations', icon: ListChecks, prefixes: ['/validation'] },
      { href: '/bons-de-mission', label: 'Bons de mission', icon: ClipboardList, prefixes: ['/bons-de-mission'] },
    ],
  }

  if (role === 'manager') {
    return [
      activite,
      {
        label: 'Rémunérations',
        items: [
          {
            href: '/remunerations',
            label: 'Rémunérations',
            icon: Wallet,
            prefixes: ['/remunerations', '/paie-du-mois', '/factures-diverses'],
          },
        ],
      },
      {
        label: 'Dossiers',
        items: [
          { href: '/admin/contrats', label: 'Contrats', icon: ScrollText, prefixes: ['/admin/contrats'] },
          { href: '/admin/equipe', label: 'Équipe', icon: Users, prefixes: ['/admin/equipe'] },
        ],
      },
      echanges,
    ]
  }

  return [
    activite,
    {
      label: 'Rémunérations',
      items: [
        {
          href: '/remunerations',
          label: 'Rémunérations',
          icon: Wallet,
          prefixes: ['/remunerations', '/admin/factures', '/admin/paie', '/paie-du-mois'],
        },
      ],
    },
    {
      label: 'Dossiers',
      items: [
        { href: '/admin/contrats', label: 'Contrats', icon: ScrollText, prefixes: ['/admin/contrats'] },
        { href: '/admin/equipe', label: 'Équipe', icon: Users, prefixes: ['/admin/equipe', '/admin/prestataires'] },
      ],
    },
    echanges,
  ]
}

/** Initiales pour la pastille du bas de menu. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean)
  if (!mots.length) return '?'
  return (mots[0][0] + (mots[1]?.[0] ?? '')).toUpperCase()
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
  // Sur un écran étroit, le menu se replie : à 375 px il occupait les trois
  // quarts de la largeur et le contenu passait en colonne d'un mot.
  const [menuOuvert, setMenuOuvert] = useState(false)

  // Changer de page referme le menu, sinon il reste devant le contenu.
  const [vue, setVue] = useState(pathname)
  if (vue !== pathname) {
    setVue(pathname)
    if (menuOuvert) setMenuOuvert(false)
  }

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
      {/* Voile derrière le menu déplié, pour le refermer d'un geste. */}
      {menuOuvert && (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setMenuOuvert(false)}
          className="fixed inset-0 z-30 bg-navy/40 lg:hidden"
        />
      )}

      <aside
        className={clsx(
          'flex w-[17rem] shrink-0 flex-col border-r border-line bg-cream-muted',
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:transition-transform',
          menuOuvert ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
      >
        <div className="ds-rail-header-slot">
          <div className="ds-rail-header">
            <Logo tone="light" size="rail" className="relative z-[1]" />
            <button
              type="button"
              onClick={() => setMenuOuvert(false)}
              aria-label="Fermer le menu"
              className="relative z-[1] ml-auto rounded-lg border border-cream/20 p-1.5 text-cream/80 lg:hidden"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <nav className="ds-rail-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {navFor(user.role, salarie, unread).map((groupe) => (
            <div key={groupe.label} className="mb-4 last:mb-0">
              <p className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gold-dark">
                {groupe.label}
              </p>
              <div className="space-y-1">
                {groupe.items.map((item) => (
                  <RailLink key={item.href} item={item} active={isActive(item)} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 px-3 pb-4 pt-2">
          <div className="mb-3 h-px bg-line" />
          <div className="space-y-1">
            {user.role === 'admin' && (
              <RailLink
                item={{ href: '/admin/categories', label: 'Catégories', icon: Tags }}
                active={pathname === '/admin/categories'}
              />
            )}
            <RailLink item={{ href: '/compte', label: 'Mon compte', icon: KeyRound }} active={pathname === '/compte'} />
          </div>

          <div className="mt-3 rounded-xl border border-line bg-white p-2.5 shadow-[0_2px_8px_-4px_rgba(11,22,40,0.08)]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gradient-to-br from-cream-deep to-cream text-[11px] font-bold text-gold-dark">
                {initiales(user.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-navy">{user.full_name}</span>
                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-dark">
                  {ROLE_LABEL[user.role]}
                </span>
              </span>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                title="Se déconnecter"
                aria-label="Se déconnecter"
                className="shrink-0 rounded-lg border border-line p-1.5 text-muted transition-colors hover:border-gold/40 hover:text-navy disabled:opacity-50"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-cream">
        {/* Barre d'ouverture du menu, seulement quand il est replié. */}
        <div className="ds-panel-header-slot flex items-center gap-3 border-b border-line bg-cream-muted px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuOuvert(true)}
            aria-label="Ouvrir le menu"
            className="rounded-lg border border-line bg-white p-2 text-navy"
          >
            <Menu size={18} />
          </button>
          <Logo size="sm" />
        </div>

        {banner}
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  )
}

/**
 * Une entrée de menu façon Diploma Lab : pastille blanche quand elle est
 * active, filet doré collé au bord gauche, icône dans son cadre.
 */
function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={clsx(
        'group relative flex items-center gap-2.5 rounded-xl border px-2 py-2.5 text-[13px] font-semibold leading-snug transition-all duration-150',
        active
          ? 'border-line bg-white text-navy shadow-[0_2px_10px_-4px_rgba(11,22,40,0.14)]'
          : 'border-transparent text-navy/90 hover:border-line/80 hover:bg-cream-deep/60 hover:text-navy'
      )}
    >
      {active && (
        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-gradient-to-b from-gold-light to-gold" />
      )}
      <span
        className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all duration-150',
          active
            ? 'border-gold/45 bg-cream-deep text-gold-dark'
            : 'border-line bg-white text-navy/70 group-hover:border-gold/35 group-hover:text-navy'
        )}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {!!item.badge && (
        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold leading-none text-navy">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  )
}
