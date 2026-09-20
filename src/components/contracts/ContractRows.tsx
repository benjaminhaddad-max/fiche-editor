'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { CheckCircle2, Clock, FileText, Search, X } from 'lucide-react'
import { money } from '@/lib/format'

export type EtatSignature = 'signe' | 'envoye' | 'depose' | 'manquant'

export interface LigneContrat {
  id: string
  personne: string
  intitule: string
  pole: string
  poleLabel: string
  montant: number
  base: string
  periode: string
  echeancesOuvertes: number
  echeancesTotal: number
  responsable: string
  signature: EtatSignature
  signatureDetail: string
  statut: string
  statutLabel: string | null
}

const SIGNATURE: Record<EtatSignature, { label: string; classe: string; icone: typeof CheckCircle2 }> = {
  signe: { label: 'Signé', classe: 'text-emerald-700', icone: CheckCircle2 },
  envoye: { label: 'En attente', classe: 'text-amber-700', icone: Clock },
  depose: { label: 'Déposé', classe: 'text-navy/70', icone: FileText },
  manquant: { label: 'À signer', classe: 'text-red-700', icone: Clock },
}

const FILTRES: { cle: string; label: string; garde: (l: LigneContrat) => boolean }[] = [
  { cle: 'tous', label: 'Tous', garde: () => true },
  { cle: 'signe', label: 'Signés', garde: (l) => l.signature === 'signe' || l.signature === 'depose' },
  { cle: 'envoye', label: 'En attente de signature', garde: (l) => l.signature === 'envoye' },
  { cle: 'manquant', label: 'Sans contrat signé', garde: (l) => l.signature === 'manquant' },
]

/**
 * Les contrats en lignes : une par contrat, rangées par pôle, filtrables au
 * clavier. Une liste sert à retrouver quelqu'un et à repérer ce qui manque —
 * le détail vit sur la page du contrat.
 */
export function ContractRows({ lignes, grouper }: { lignes: LigneContrat[]; grouper: boolean }) {
  const [recherche, setRecherche] = useState('')
  const [filtre, setFiltre] = useState('tous')

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const garde = FILTRES.find((f) => f.cle === filtre)!.garde
    return lignes.filter(
      (l) =>
        garde(l) &&
        (!q ||
          l.personne.toLowerCase().includes(q) ||
          l.intitule.toLowerCase().includes(q) ||
          l.poleLabel.toLowerCase().includes(q) ||
          l.responsable.toLowerCase().includes(q))
    )
  }, [lignes, recherche, filtre])

  const groupes = useMemo(() => {
    if (!grouper) return [{ cle: '', label: '', lignes: visibles }]
    const ordre: string[] = []
    const parPole = new Map<string, LigneContrat[]>()
    for (const l of visibles) {
      if (!parPole.has(l.pole)) {
        parPole.set(l.pole, [])
        ordre.push(l.pole)
      }
      parPole.get(l.pole)!.push(l)
    }
    return ordre.map((p) => ({ cle: p, label: parPole.get(p)![0].poleLabel, lignes: parPole.get(p)! }))
  }, [visibles, grouper])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un nom, un intitulé, un responsable…"
            className="field pl-9"
          />
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-stone hover:text-navy"
              aria-label="Effacer la recherche"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTRES.map((f) => {
            const nombre = lignes.filter(f.garde).length
            return (
              <button
                key={f.cle}
                type="button"
                onClick={() => setFiltre(f.cle)}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  filtre === f.cle
                    ? 'border-navy bg-navy text-cream'
                    : 'border-line bg-white text-navy/70 hover:border-gold/40 hover:text-navy'
                )}
              >
                {f.label}
                <span className={clsx('ml-1.5 font-normal', filtre === f.cle ? 'text-cream/60' : 'text-muted')}>
                  {nombre}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <p className="font-display text-base font-semibold text-navy">Aucun contrat ne correspond</p>
          <p className="mt-1 text-sm text-muted">Changez de filtre ou effacez la recherche.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(14,30,53,0.04)]">
          {/* Une fenêtre étroite fait défiler le tableau plutôt que de couper une colonne. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-cream-muted">
                  <th className="ds-eyebrow px-4 py-2.5 text-left">Personne</th>
                  <th className="ds-eyebrow px-4 py-2.5 text-right">Montant</th>
                  <th className="ds-eyebrow hidden px-4 py-2.5 text-center xl:table-cell">Échéances</th>
                  <th className="ds-eyebrow hidden px-4 py-2.5 text-left xl:table-cell">Responsable</th>
                  <th className="ds-eyebrow px-4 py-2.5 text-left">Contrat</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <GroupeLignes key={g.cle} groupe={g} grouper={grouper} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function GroupeLignes({
  groupe,
  grouper,
}: {
  groupe: { cle: string; label: string; lignes: LigneContrat[] }
  grouper: boolean
}) {
  const total = groupe.lignes.reduce((s, l) => s + l.montant, 0)
  return (
    <>
      {grouper && (
        <tr className="border-y border-line bg-cream-deep/45">
          <td colSpan={2} className="px-4 py-2">
            <span className="font-display text-[13px] font-semibold text-navy">{groupe.label}</span>
            <span className="ml-2 text-xs text-muted">{groupe.lignes.length}</span>
          </td>
          <td colSpan={3} className="px-4 py-2 text-right text-xs font-medium text-navy/70">
            {total > 0 ? money(total) : ''}
          </td>
        </tr>
      )}
      {groupe.lignes.map((l) => {
        const sig = SIGNATURE[l.signature]
        const Icone = sig.icone
        return (
          <tr key={l.id} className="group border-b border-line/70 last:border-0 hover:bg-cream-muted">
            <td className="px-4 py-3">
              <Link href={`/admin/contrats/${l.id}`} className="block">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-navy group-hover:text-gold-dark">{l.personne}</span>
                  {l.statutLabel && (
                    <span className="rounded-full bg-cream-deep px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-stone">
                      {l.statutLabel}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{l.intitule}</span>
              </Link>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
              <span className="font-display block font-semibold text-navy">
                {l.montant > 0 ? money(l.montant) : '—'}
              </span>
              <span className="block text-[11px] text-muted">{l.base}</span>
            </td>
            <td className="hidden whitespace-nowrap px-4 py-3 text-center text-xs text-muted xl:table-cell">
              {l.echeancesTotal > 0 ? `${l.echeancesOuvertes} / ${l.echeancesTotal}` : '—'}
            </td>
            <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted xl:table-cell">
              {l.responsable || '—'}
            </td>
            <td className="whitespace-nowrap px-4 py-3">
              <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium', sig.classe)}>
                <Icone size={13} />
                {sig.label}
              </span>
              {l.signatureDetail && <span className="mt-0.5 block text-[11px] text-stone">{l.signatureDetail}</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}
