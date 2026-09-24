import { Logo } from '@/components/ui/Logo'
import { WelcomeClient } from './WelcomeClient'

/**
 * Page d'arrivée des comptes invités. La vérification du jeton se fait dans
 * le navigateur : c'est le seul endroit où l'on peut garantir que la session
 * en cours a bien été fermée avant d'en ouvrir une nouvelle.
 */
export default async function BienvenuePage({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string; suite?: string }>
}) {
  const { invitation, suite } = await searchParams
  // Seule une adresse interne est acceptée comme suite : pas de redirection ouverte.
  const destination = suite && /^\/[a-z-]/.test(suite) && !suite.startsWith('//') ? suite : '/'

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo size="lg" className="mx-auto" />
          <p className="mt-3 text-sm text-muted">
            Prestations et facturation — Diploma Santé
          </p>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(14,30,53,0.06)]">
          <WelcomeClient invitation={invitation ?? null} destination={destination} />
        </div>
      </div>
    </div>
  )
}
