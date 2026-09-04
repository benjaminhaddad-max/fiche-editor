'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

type Etat =
  | { phase: 'verification' }
  | { phase: 'pret'; email: string }
  | { phase: 'invalide' }

/**
 * Création de l'accès à partir d'un lien d'invitation.
 *
 * Tout se passe côté navigateur, et dans cet ordre précis :
 *   1. on ferme la session en cours, quelle qu'elle soit
 *   2. on échange le jeton du lien contre une session
 *   3. on pose le mot de passe sur CETTE session
 *
 * L'étape 1 n'est pas cosmétique. Sans elle, un administrateur déjà
 * connecté qui ouvre une invitation change son propre mot de passe au lieu
 * de celui de la personne invitée — c'est arrivé.
 */
export function WelcomeClient({ tokenHash }: { tokenHash: string | null }) {
  const router = useRouter()
  const [etat, setEtat] = useState<Etat>({ phase: 'verification' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let annule = false

    async function ouvrir() {
      const supabase = createClient()
      await supabase.auth.signOut()

      if (!tokenHash) {
        if (!annule) setEtat({ phase: 'invalide' })
        return
      }

      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      })

      if (annule) return
      if (error || !data.user?.email) setEtat({ phase: 'invalide' })
      else setEtat({ phase: 'pret', email: data.user.email })
    }

    void ouvrir()
    return () => {
      annule = true
    }
  }, [tokenHash])

  async function definir(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')

    if (password.length < 10) {
      setErreur('Le mot de passe doit faire au moins 10 caractères.')
      return
    }
    if (password !== confirm) {
      setErreur('Les deux mots de passe ne correspondent pas.')
      return
    }

    setEnvoi(true)
    const supabase = createClient()

    // Dernier garde-fou : on ne modifie que si la session est bien celle du
    // lien, jamais une session résiduelle.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (etat.phase !== 'pret' || user?.email !== etat.email) {
      setErreur('Votre session a changé. Rouvrez le lien d’invitation.')
      setEnvoi(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErreur(`Enregistrement impossible : ${error.message}`)
      setEnvoi(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  if (etat.phase === 'verification') {
    return <p className="text-sm text-slate-500">Vérification de votre lien…</p>
  }

  if (etat.phase === 'invalide') {
    return (
      <>
        <h2 className="mb-1 text-base font-semibold text-slate-900">
          Lien expiré ou déjà utilisé
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Les liens d’invitation ne servent qu’une fois et expirent après un
          certain temps. Demandez-en un nouveau à votre interlocuteur Diploma Santé.
        </p>
        <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
          Aller à la page de connexion
        </Link>
      </>
    )
  }

  return (
    <>
      <h2 className="mb-1 text-base font-semibold text-slate-900">
        Bienvenue — créez votre accès
      </h2>
      <p className="mb-5 text-sm text-slate-500">
        Choisissez votre mot de passe pour <strong>{etat.email}</strong>.
      </p>

      <form onSubmit={definir} className="flex flex-col gap-4">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          label="Choisissez un mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          hint="10 caractères minimum."
          required
        />
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          label="Confirmez"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={10}
          required
        />
        {erreur && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>
        )}
        <Button type="submit" disabled={envoi} className="mt-1">
          {envoi ? 'Création…' : 'Créer mon accès'}
        </Button>
      </form>
    </>
  )
}
