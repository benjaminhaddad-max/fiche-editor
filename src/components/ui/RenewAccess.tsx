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
export function RenewAccess({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [email, setEmail] = useState(defaultEmail)
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState(false)

  async function demander(e: React.FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    await fetch('/api/invitation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renew', email }),
    }).catch(() => {})
    setEnvoi(false)
    setEnvoye(true)
  }

  if (envoye) {
    return (
      <p className="rounded-lg border border-line bg-cream px-3 py-3 text-sm text-navy">
        Si <strong>{email}</strong> correspond à un compte, un nouveau lien vient d’y être
        envoyé. Ouvrez le message le plus récent — les précédents ne fonctionnent plus.
      </p>
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
