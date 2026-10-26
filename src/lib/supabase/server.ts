import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { COOKIE_MARQUE } from '@/lib/brand'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  // L'école regardée voyage avec la requête. Les règles de sécurité s'en
  // servent pour départager les profils de quelqu'un qui travaille pour
  // plusieurs écoles. Elle n'ouvre aucun droit : seule l'identité déjà
  // authentifiée compte, cet en-tête ne fait que choisir parmi ses propres
  // profils.
  const marque = cookieStore.get(COOKIE_MARQUE)?.value ?? ''

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: marque ? { 'x-marque': marque } : {} },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}
