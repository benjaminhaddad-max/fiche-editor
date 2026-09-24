import Link from 'next/link'
import { ArrowRight, CalendarClock, CheckCircle2, PencilLine } from 'lucide-react'
import { cycleForDate, cycleForMonth, providerCanDeclare, todayParis } from '@/lib/cycle'
import { formatDate, formatDateLong, money, round2 } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

/** Le mois d'une date, en toutes lettres. */
function moisDe(date: string): string {
  return cycleForMonth(date.slice(0, 7)).label
}

/**
 * Où en est le prestataire, en trois phrases.
 *
 * Ce qui est déjà réglé — et donc ce qu'il ne doit surtout pas refacturer.
 * Ce qui est déjà inscrit pour ce mois-ci, en distinguant ce qu'il a écrit
 * lui-même de ce que son manager a mis à son nom. Et ce qui l'attend : la
 * prochaine échéance de son contrat, et la date avant laquelle déclarer.
 *
 * Sans ce panneau, il ouvre sa page sans savoir s'il a été payé, si son
 * manager a déjà saisi quelque chose, ni ce qu'il lui reste à faire.
 */
export async function EtatDuMois({ providerId }: { providerId: string }) {
  const db = createServiceClient()
  const today = todayParis()
  const mois = cycleForDate(today)

  const [{ data: factures }, { data: missions }, { data: echeances }] = await Promise.all([
    db
      .from('inv_invoices')
      .select('id, number, total_ttc, status, paid_at, period_start, issue_date')
      .eq('provider_id', providerId)
      .order('issue_date', { ascending: false })
      .limit(6),
    db
      .from('inv_missions')
      .select('id, total_ht, status, origin, start_date')
      .eq('provider_id', providerId)
      .gte('start_date', mois.periodStart)
      .lte('start_date', mois.periodEnd),
    db
      .from('inv_contract_instalments')
      .select('label, due_date, amount_ht, contract:inv_coaching_contracts!inner(provider_id, status)')
      .eq('contract.provider_id', providerId)
      .eq('contract.status', 'active')
      .is('mission_id', null)
      .gt('due_date', today)
      .order('due_date')
      .limit(1),
  ])

  const payees = (factures ?? []).filter((f) => f.status === 'paid')
  const derniere = payees[0]
  const enAttente = (factures ?? []).filter((f) => f.status !== 'paid' && f.status !== 'cancelled')

  const duMois = missions ?? []
  const parMoi = duMois.filter((m) => m.origin === 'provider')
  const parAutrui = duMois.filter((m) => m.origin !== 'provider')
  const total = round2(duMois.reduce((s, m) => s + Number(m.total_ht), 0))
  const prochaine = (echeances ?? [])[0]

  const peutDeclarer = providerCanDeclare(today, today)

  return (
    <div className="mb-6 grid gap-3 md:grid-cols-3">
      {/* 1 — ce qui est derrière */}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="ds-eyebrow flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-emerald-600" />
          Déjà réglé
        </p>
        {derniere ? (
          <>
            <p className="font-display mt-2 text-[22px] font-semibold text-navy">{money(Number(derniere.total_ttc))}</p>
            <p className="mt-1 text-xs text-muted">
              Facture {derniere.number}
              {derniere.period_start ? ` de ${moisDe(derniere.period_start)}` : ''}, réglée
              {derniere.paid_at ? ` le ${formatDate(derniere.paid_at)}` : ''}.
            </p>
            <p className="mt-1.5 text-xs text-navy/70">
              {enAttente.length === 0
                ? 'Rien de plus à facturer sur les mois passés.'
                : `${enAttente.length} facture(s) encore en cours de traitement.`}
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-2 text-[22px] font-semibold text-stone">—</p>
            <p className="mt-1 text-xs text-muted">Aucune facture réglée pour l’instant.</p>
          </>
        )}
      </div>

      {/* 2 — ce qui est déjà inscrit ce mois-ci */}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="ds-eyebrow flex items-center gap-1.5">
          <PencilLine size={13} className="text-gold-dark" />
          Inscrit pour {mois.label}
        </p>
        <p className="font-display mt-2 text-[22px] font-semibold text-navy">
          {duMois.length ? money(total) : '—'}
        </p>
        {duMois.length ? (
          <p className="mt-1 text-xs text-muted">
            {parMoi.length > 0 && `${parMoi.length} ligne(s) de vous`}
            {parMoi.length > 0 && parAutrui.length > 0 && ' · '}
            {parAutrui.length > 0 && `${parAutrui.length} inscrite(s) par votre manager`}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">Rien n’a encore été inscrit, ni par vous ni par votre manager.</p>
        )}
        <p className="mt-1.5 text-xs text-navy/70">
          {peutDeclarer
            ? `À déclarer avant le ${formatDateLong(mois.declarationDeadline)}.`
            : 'Les déclarations de ce mois sont closes : demandez à votre manager.'}
        </p>
      </div>

      {/* 3 — ce qui vient */}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="ds-eyebrow flex items-center gap-1.5">
          <CalendarClock size={13} className="text-navy/60" />
          Prochaine échéance
        </p>
        {prochaine ? (
          <>
            <p className="font-display mt-2 text-[22px] font-semibold text-navy">
              {money(Number(prochaine.amount_ht))}
            </p>
            <p className="mt-1 text-xs text-muted">
              {prochaine.label} — {formatDateLong(prochaine.due_date)}.
            </p>
            <p className="mt-1.5 text-xs text-navy/70">
              Prévue par votre contrat : elle s’ajoutera d’elle-même, sans rien saisir.
            </p>
          </>
        ) : (
          <>
            <p className="font-display mt-2 text-[22px] font-semibold text-stone">—</p>
            <p className="mt-1 text-xs text-muted">Aucun forfait de contrat à venir.</p>
            <p className="mt-1.5 text-xs text-navy/70">
              Vous êtes payé à ce que vous déclarez : pensez à tout inscrire.
            </p>
          </>
        )}
      </div>

      {peutDeclarer && (
        <Link
          href="/missions/new"
          className="flex items-center justify-between gap-3 rounded-xl border border-gold/45 bg-gold/10 px-4 py-3 text-sm text-navy transition-colors hover:bg-gold/15 md:col-span-3"
        >
          <span>
            <strong className="font-semibold">Une mission à ajouter ?</strong> Rendez-vous, inscriptions, journée
            porte ouverte, cours, enregistrement — à l’heure, à la journée ou à la mission, autant de lignes que
            nécessaire.
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-gold-dark">
            Déclarer
            <ArrowRight size={15} />
          </span>
        </Link>
      )}
    </div>
  )
}
