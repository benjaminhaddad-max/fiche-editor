'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { COOKIE_MARQUE } from '@/lib/brand'
import { marquesDisponibles } from '@/lib/brand/actif'
import { estMarqueServie, normalizeBrandId } from '@/lib/brand'

/**
 * Choisir la marque affichée.
 *
 * Réservé aux comptes « all ». Pour tous les autres, la marque du compte
 * fait foi et ce cookie n'est jamais relu : un ancien choix ne peut pas
 * rouvrir la facturation d'une autre école à quelqu'un qui a changé de
 * rôle entre-temps.
 */
export async function choisirMarque(fd: FormData): Promise<void> {
  await requireUser()
  // Seules ses propres écoles : le cookie ne peut pas en ouvrir une autre.
  const permises = await marquesDisponibles()
  const choisie = normalizeBrandId(String(fd.get('marque') ?? ''))
  if (!permises.includes(choisie) || !estMarqueServie(choisie)) return

  const jar = await cookies()
  jar.set(COOKIE_MARQUE, choisie, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  // Tout l'écran dépend de la marque : les compteurs du rail comme les listes.
  revalidatePath('/', 'layout')
}
