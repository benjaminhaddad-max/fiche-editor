import { Card } from '@/components/ui/Page'
import { GRILLES } from '@/lib/contracts/commissions'
import { money } from '@/lib/format'

/** La grille de commissionnement sous les yeux, au moment de saisir. */
export function GrilleCommissions() {
  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm font-medium text-navy">
        Grille de commissionnement de la cellule commerciale
      </summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {GRILLES.map((g) => (
          <Card key={g.cle} className="overflow-hidden">
            <div className="border-b border-line bg-cream-muted px-4 py-2.5">
              <p className="text-sm font-semibold text-navy">{g.titre}</p>
              <p className="mt-0.5 text-xs text-muted">{g.precision}</p>
            </div>
            <ul className="divide-y divide-line/60 text-sm">
              {g.lignes.map((l) => (
                <li key={l.formation} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-navy/80">{l.formation}</span>
                  <span className={l.montant === null ? 'text-xs text-muted' : 'font-semibold text-navy'}>
                    {l.montant === null ? 'non commissionné' : money(l.montant)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Closers et télépros touchent les mêmes montants. La grille est fixe pour les alternants, revue selon les
        performances pour les freelances.
      </p>
    </details>
  )
}
