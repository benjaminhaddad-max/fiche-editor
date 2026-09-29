'use client'

import { useState } from 'react'
import { Logo } from '@/components/ui/Logo'
import { createClient } from '@/lib/supabase/client'

/**
 * « Votre compte est sur l'autre plateforme. »
 *
 * Les deux écoles partagent la base d'authentification : un mot de passe
 * juste ne prouve donc pas qu'on frappe à la bonne porte. Sans cet écran,
 * la personne entrait « avec succès » puis se faisait renvoyer de page en
 * page jusqu'à un écran blanc.
 *
 * On garde la session ouverte tant que cet écran est affiché. La refermer
 * tout de suite paraissait plus propre, mais le middleware renvoie à la
 * connexion dès qu'il n'y a plus de session : le message s'affichait puis
 * disparaissait aussitôt, et on retombait sur le formulaire sans avoir rien
 * pu lire. La déconnexion attend donc qu'on la demande.
 */
export function AutreEcole({ ecole, site }: { ecole: string; site: string }) {
  const [sortie, setSortie] = useState(false)

  async function changerDeCompte() {
    setSortie(true)
    await createClient().auth.signOut()
    // Rechargement franc plutôt que navigation interne : la session vient
    // de disparaître, le routeur travaillerait sur un état périmé.
    window.location.href = '/login'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm text-center">
        <Logo size="lg" className="mx-auto" />
        <div className="mt-8 rounded-xl border border-line bg-white p-6">
          <p className="text-sm text-navy">
            Ce compte est rattaché à <strong>{ecole}</strong>.
          </p>
          <p className="mt-2 text-sm text-muted">
            C’est une autre plateforme, avec ses propres prestations et ses propres factures.
          </p>
          <a
            href={site}
            className="mt-5 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-cream hover:bg-navy/90"
          >
            Aller sur {site.replace('https://', '')}
          </a>
        </div>
        <button
          type="button"
          onClick={changerDeCompte}
          disabled={sortie}
          className="mt-4 cursor-pointer text-xs text-muted hover:text-navy disabled:opacity-50"
        >
          {sortie ? 'Déconnexion…' : 'Me connecter avec un autre compte'}
        </button>
      </div>
    </div>
  )
}
