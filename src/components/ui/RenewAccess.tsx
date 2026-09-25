'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

/**
 * Demande d'un nouveau lien d'accès.
 *
 * Un lien mort est la panne la plus fréquente : les anciens messages restent
 * dans la boîte de réception, et c'est celui-là qu'on rouvre. Plutôt que de
 * renvoyer la personne vers un interlocuteur, on lui rend la main ici.
 */
type Etat = 'envoye' | 'inconnu' | 'ferme' | 'attendez' | 'echec'

export function RenewAccess({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail)
  const [envoi, setEnvoi] = useState(false)
  const [etat, setEtat] = useState<Etat | null>(null)

  async function demander(e: React.FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setEtat(null)
    const r = await fetch('/api/invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renew', email }),
    })
      .then((x) => x.json() as Promise<{ etat?: Etat }>)
      .catch(() => ({ etat: 'echec' as Etat }))
    setEnvoi(false)
    setEtat(r.etat ?? 'echec')
  }

  if (etat === 'envoye') {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
        Un nouveau lien vient de partir vers <strong>{email}</strong>. Ouvrez le message le plus récent — les
        précédents ne fonctionnent plus. Pensez à regarder vos indésirables.
      </p>
    )
  }

  if (etat) {
    const messages: Record<Exclude<Etat, 'envoye'>, string> = {
      inconnu: `Aucun compte n’est enregistré avec l’adresse ${email}. Vérifiez la saisie, ou essayez l’adresse à laquelle vous aviez reçu l’invitation.`,
      ferme: 'Ce compte a été désactivé. Écrivez à votre interlocuteur chez Diploma Santé.',
      attendez: 'Un lien vient déjà de partir il y a moins de deux minutes. Regardez votre boîte, il arrive.',
      echec: 'L’envoi a échoué. Réessayez dans un instant.',
    }
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          {messages[etat]}
        </p>
        <button
          type="button"
          onClick={() => setEtat(null)}
          className="cursor-pointer text-sm font-medium text-gold-dark hover:underline"
        >
          Essayer une autre adresse
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={demander} className="flex flex-col gap-3">
      <Input
        id="renew-email"
        label="Votre adresse email"
        type="email"
        autoComplete="email"
        placeholder="vous@exemple.fr"
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        required
      />
      <Button type="submit" disabled={envoi}>
        {envoi ? 'Envoi…' : 'M’envoyer un nouveau lien'}
      </Button>
    </form>
  )
}
