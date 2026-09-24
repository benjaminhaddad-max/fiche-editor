import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { activeCycle } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'
import { champsManquants } from '@/lib/profil'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Provider } from '@/lib/types'

/**
 * Le rappel qu'un nouvel arrivant voit tant que sa fiche n'est pas remplie.
 *
 * Son compte a été créé en deux secondes, avec un nom et un email : c'est à
 * lui d'ajouter son SIRET, son adresse et son IBAN. Sans eux, sa facture ne
 * peut pas être émise — autant le lui dire dès la première page, et non le
 * 2 du mois quand il faut payer.
 */
export async function FicheAcompleter({ userId }: { userId: string }) {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('inv_providers')
    .select('employment_type, legal_name, siret, address_line1, postal_code, city, iban, phone')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null

  const manque = champsManquants(data as unknown as Provider)
  if (manque.length === 0) return null

  // Sans SIRET ni IBAN, on ne peut pas émettre la facture : ce n'est plus un
  // rappel, c'est un blocage. Il se lit en rouge, avec la date butoir.
  const bloquant = !data.siret?.trim() || !data.iban?.trim()
  const cycle = activeCycle()
  const liste = manque.length === 1 ? manque[0] : `${manque.slice(0, -1).join(', ')} et ${manque.at(-1)}`

  return (
    <Link
      href="/profil"
      className={
        bloquant
          ? 'flex flex-wrap items-center justify-between gap-4 border-b border-red-300 bg-red-50 px-8 py-3.5 text-sm text-red-900 transition-colors hover:bg-red-100'
          : 'flex flex-wrap items-center justify-between gap-4 border-b border-gold/40 bg-gold/15 px-8 py-3.5 text-sm text-navy transition-colors hover:bg-gold/25'
      }
    >
      <span className="flex items-start gap-2">
        {bloquant && <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <span>
          {bloquant ? (
            <>
              <strong className="font-semibold">Vous ne pourrez pas facturer.</strong> Il manque {liste}. Sans ces
              informations, votre facture du {formatDateLong(cycle.invoiceDeadline)} ne peut pas être émise, et le
              virement du {formatDateLong(cycle.paymentDate)} ne partira pas.
            </>
          ) : (
            <>
              <strong className="font-semibold">Votre fiche n’est pas terminée.</strong> Il manque {liste}.
            </>
          )}
        </span>
      </span>
      <span
        className={
          bloquant
            ? 'inline-flex shrink-0 items-center gap-1.5 font-semibold text-red-800'
            : 'inline-flex shrink-0 items-center gap-1.5 font-semibold text-gold-dark'
        }
      >
        Compléter maintenant
        <ArrowRight size={15} />
      </span>
    </Link>
  )
}
