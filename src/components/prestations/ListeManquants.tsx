'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { AlertTriangle, MailWarning, PenLine, Send } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import { money } from '@/lib/format'
import { porterEcheance } from '@/app/(app)/missions/actions'
import { relancerUn, type RelanceUnResultat } from '@/app/(app)/validation/manquants/actions'
import type { Manquant } from '@/lib/manquants'

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const moisLong = (m: string) => MOIS.format(new Date(`${m}-01T12:00:00Z`))

/**
 * Une ligne par personne, et sur chaque ligne le geste qui la débloque.
 *
 * L'ordre des gestes n'est pas décoratif : porter une échéance ne demande
 * rien à personne, relancer demande à l'intéressé, déclarer à sa place
 * demande au manager. On propose donc le moins coûteux d'abord.
 */
function Ligne({ m }: { m: Manquant }) {
  const [etat, relancer] = useActionState<RelanceUnResultat | null, FormData>(relancerUn, null)

  return (
    <div className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-navy">{m.nom}</p>
        <p className="mt-0.5 text-xs text-muted">
          {EMPLOYMENT_LABEL[m.employment]}
          {m.responsable && ` · ${m.responsable}`}
          {m.dernierMois && ` · dernière déclaration en ${moisLong(m.dernierMois)}`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {m.jamaisVenu && (
            <Badge className="bg-stone-50 text-stone-700 ring-stone-200">Jamais connecté</Badge>
          )}
          {m.manque.length > 0 && (
            <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
              <AlertTriangle size={11} className="mr-1" />
              Manque {m.manque.join(', ')}
            </Badge>
          )}
          {m.injoignable && (
            <Badge className="bg-rose-50 text-rose-800 ring-rose-200">
              <MailWarning size={11} className="mr-1" />
              Adresse à corriger
            </Badge>
          )}
        </div>
        {etat?.message && <p className="mt-1.5 text-xs text-emerald-700">{etat.message}</p>}
        {etat?.error && <p className="mt-1.5 text-xs text-rose-700">{etat.error}</p>}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {m.echeance && (
          <form action={porterEcheance}>
            <input type="hidden" name="instalment_id" value={m.echeance.id} />
            <SubmitButton size="sm" pendingLabel="…">
              Porter {money(m.echeance.montant)}
            </SubmitButton>
          </form>
        )}
        <form action={relancer}>
          <input type="hidden" name="user_id" value={m.userId} />
          <SubmitButton size="sm" variant="secondary" pendingLabel="Envoi…" disabled={Boolean(m.injoignable)}>
            <Send size={14} className="mr-1.5" />
            {m.jamaisVenu ? 'Renvoyer ses accès' : 'Relancer'}
          </SubmitButton>
        </form>
        <Link
          href="/validation/declarer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy hover:border-gold/50 hover:bg-cream-muted"
        >
          <PenLine size={14} />
          Déclarer
        </Link>
      </div>
    </div>
  )
}

export function ListeManquants({ titre, aide, gens }: { titre: string; aide: string; gens: Manquant[] }) {
  if (gens.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="font-display text-base font-semibold text-navy">
        {titre} <span className="font-sans text-sm font-normal text-muted">({gens.length})</span>
      </h2>
      <p className="mt-0.5 mb-2 text-sm text-muted">{aide}</p>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        {gens.map((m) => (
          <Ligne key={m.userId} m={m} />
        ))}
      </div>
    </section>
  )
}
