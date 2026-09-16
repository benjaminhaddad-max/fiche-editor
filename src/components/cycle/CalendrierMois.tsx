import { CalendarDays } from 'lucide-react'
import { clsx } from 'clsx'
import { activeCycle, phaseOf, todayParis, type CyclePhase } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'

type Public = 'prestataire' | 'salarie' | 'manager'

interface Etape {
  phase: CyclePhase
  quand: string
  quoi: string
}

function etapes(pour: Public, c: ReturnType<typeof activeCycle>): Etape[] {
  const du = (a: string, b: string) => `du ${formatDateLong(a)} au ${formatDateLong(b)}`
  const le = (a: string) => `le ${formatDateLong(a)}`

  if (pour === 'manager') {
    return [
      { phase: 'declaration', quand: `jusqu’au ${formatDateLong(c.declarationDeadline)}`, quoi: 'Les prestataires déclarent. Vous pouvez déclarer pour eux et envoyer des bons de mission.' },
      { phase: 'verification', quand: du(c.reviewStart, c.reviewEnd), quoi: 'Vous vérifiez, corrigez et complétez les prestations de vos prestataires.' },
      { phase: 'facturation', quand: le(c.statementDate), quoi: `Le bordereau global part à chaque prestataire. Factures attendues jusqu’au ${formatDateLong(c.invoiceDeadline)}.` },
      { phase: 'paiement', quand: le(c.paymentDate), quoi: 'Paiement des factures reçues.' },
    ]
  }
  if (pour === 'salarie') {
    return [
      { phase: 'declaration', quand: `jusqu’au ${formatDateLong(c.declarationDeadline)}`, quoi: 'Déclarez vos prestations et vos bonus du mois.' },
      { phase: 'verification', quand: du(c.reviewStart, c.reviewEnd), quoi: 'Votre manager vérifie ; il vous écrit si quelque chose ne va pas.' },
      { phase: 'facturation', quand: le(c.statementDate), quoi: 'Les éléments validés partent au service paie. Vous n’avez pas de facture à faire.' },
    ]
  }
  return [
    { phase: 'declaration', quand: `jusqu’au ${formatDateLong(c.declarationDeadline)}`, quoi: 'Déclarez vos prestations du mois. Passé cette date, seul votre manager peut en ajouter.' },
    { phase: 'verification', quand: du(c.reviewStart, c.reviewEnd), quoi: 'Vos managers vérifient. Rien à faire de votre côté, sauf s’ils vous écrivent.' },
    { phase: 'facturation', quand: `${le(c.statementDate)} → ${formatDateLong(c.invoiceDeadline)}`, quoi: 'Vous recevez votre bordereau : générez ou déposez votre facture sous 2 jours.' },
    { phase: 'paiement', quand: le(c.paymentDate), quoi: 'Paiement, par virement (le 3, ou le premier jour ouvré qui suit).' },
  ]
}

const ORDRE: CyclePhase[] = ['declaration', 'verification', 'facturation', 'paiement', 'termine']

/** Les dates du mois, écrites en toutes lettres, avec l'étape du jour en évidence. */
export function CalendrierMois({ pour }: { pour: Public }) {
  const today = todayParis()
  const cycle = activeCycle(today)
  const actuelle = phaseOf(cycle, today)
  const rang = ORDRE.indexOf(actuelle)

  return (
    <div className="mb-6 rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(14,30,53,0.04)]">
      <div className="mb-4 flex items-center gap-2">
        <CalendarDays size={17} className="text-gold-dark" />
        <p className="text-sm font-semibold text-navy">
          Calendrier de {cycle.label}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {etapes(pour, cycle).map((e) => {
          const i = ORDRE.indexOf(e.phase)
          const enCours = e.phase === actuelle
          const passee = i < rang
          return (
            <li
              key={e.phase}
              className={clsx(
                'rounded-lg border px-3.5 py-3',
                enCours ? 'border-gold bg-gold/10' : 'border-line',
                passee && 'opacity-55'
              )}
            >
              <p className={clsx('text-xs font-semibold', enCours ? 'text-gold-dark' : 'text-navy')}>
                {enCours ? 'Maintenant · ' : passee ? 'Terminé · ' : ''}
                {e.quand}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-navy/70">{e.quoi}</p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
