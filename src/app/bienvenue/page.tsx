import { WelcomeClient } from './WelcomeClient'

/**
 * Page d'arrivée des comptes invités. La vérification du jeton se fait dans
 * le navigateur : c'est le seul endroit où l'on peut garantir que la session
 * en cours a bien été fermée avant d'en ouvrir une nouvelle.
 */
export default async function BienvenuePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>
}) {
  const { token_hash } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Diploma Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">
            Prestations et facturation — Diploma Santé
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <WelcomeClient tokenHash={token_hash ?? null} />
        </div>
      </div>
    </div>
  )
}
