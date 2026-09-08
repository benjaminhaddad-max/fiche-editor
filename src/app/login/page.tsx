'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { RenewAccess } from '@/components/ui/RenewAccess'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oubli, setOubli] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou mot de passe incorrect.')
      setLoading(false)
      return
    }

    // La destination depend du role : / redirige vers le bon espace.
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="justify-center" />
          <p className="mt-3 text-sm text-muted">
            Prestations et facturation — Diploma Santé
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-4 rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(14,30,53,0.06)]"
        >
          <Input
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="vous@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>

        {oubli ? (
          <div className="mt-4 rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(14,30,53,0.06)]">
            <h2 className="mb-1 text-base font-semibold text-navy">Recevoir un nouveau lien</h2>
            <p className="mb-4 text-sm text-muted">
              Il vous permettra de choisir un mot de passe, que vous ayez oublié le vôtre ou
              que votre lien d’invitation ne fonctionne plus.
            </p>
            <RenewAccess defaultEmail={email} />
          </div>
        ) : (
          <p className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setOubli(true)}
              className="font-medium text-gold-dark hover:underline"
            >
              Mot de passe oublié ou lien expiré ?
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
