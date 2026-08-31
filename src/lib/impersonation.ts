import { cookies } from 'next/headers'

/**
 * Nom de l'administrateur qui a pris la main sur un compte.
 * Sert uniquement à afficher le bandeau et à tracer : la session réelle,
 * elle, est bien celle du compte visité.
 */
export const IMPERSONATION_COOKIE = 'inv_impersonated_by'

export async function getImpersonator(): Promise<string | null> {
  const store = await cookies()
  return store.get(IMPERSONATION_COOKIE)?.value ?? null
}
