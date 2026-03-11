'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FileText, LogOut, Plus } from 'lucide-react'
import Link from 'next/link'

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Diploma Sante</h1>
          <p className="text-xs text-gray-500 mt-0.5">Editeur de fiches</p>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-1">
          <Link
            href="/fiches"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <FileText size={18} />
            Mes fiches
          </Link>
          <Link
            href="/fiches/new"
            className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <Plus size={18} />
            Nouvelle fiche
          </Link>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors w-full cursor-pointer"
          >
            <LogOut size={18} />
            {loggingOut ? 'Deconnexion...' : 'Se deconnecter'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}
