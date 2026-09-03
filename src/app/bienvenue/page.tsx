import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { WelcomeForm } from './WelcomeForm'
import { setPassword } from './actions'

/**
 * Page d'arrivée des comptes invités : la personne choisit elle-même son
 * mot de passe. Le lien porte un jeton à usage unique, qu'on échange ici
 * contre une session avant d'afficher le formulaire.
 */
export default async function BienvenuePage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>
}) {
  const { token_hash } = await searchParams
  const supabase = await createServerSupabase()

  if (token_hash) {
    await supabase.auth.verifyOtp({ token_hash, type: 'recovery' })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

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
          {user ? (
            <>
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Bienvenue — créez votre accès
              </h2>
              <p className="mb-5 text-sm text-slate-500">
                Choisissez votre mot de passe. Vous pourrez ensuite compléter vos
                informations de facturation et déposer vos factures.
              </p>
              <WelcomeForm action={setPassword} email={user.email ?? ''} />
            </>
          ) : (
            <>
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Lien expiré ou déjà utilisé
              </h2>
              <p className="mb-5 text-sm text-slate-500">
                Les liens d’invitation ne servent qu’une fois et expirent après
                quelques jours. Demandez-en un nouveau à votre interlocuteur Diploma
                Santé.
              </p>
              <Link
                href="/login"
                className="text-sm font-medium text-brand-600 hover:underline"
              >
                Aller à la page de connexion
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
