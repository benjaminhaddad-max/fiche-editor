import { isPennylaneConfigured, listSupplierInvoices } from '@/lib/pennylane/client'

/** Une facture déjà passée en comptabilité, au même montant. */
export interface Doublon {
  date: string
  montant: number
  libelle: string
  /** « déjà réglée » pèse plus lourd que « en attente ». */
  payee: boolean
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(label genere\)/g, '')
    .replace(/^facture\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Les mots d'un nom, assez longs pour vouloir dire quelque chose. */
const mots = (s: string) => norm(s).split(' ').filter((m) => m.length >= 3)

/**
 * Est-ce la même personne ?
 *
 * Pennylane écrit « Facture GALBOIS Salomé - 2026-23 », la plateforme
 * « Salomé Galbois » : l'ordre change, le numéro traîne derrière. On
 * compare donc les mots, pas la chaîne — deux mots communs suffisent, et un
 * seul lorsque le nom n'en compte qu'un.
 */
function memeNom(a: string, b: string): boolean {
  const ma = mots(a)
  const mb = mots(b)
  if (ma.length === 0 || mb.length === 0) return false
  const communs = ma.filter((m) => mb.includes(m)).length
  return communs >= Math.min(2, ma.length, mb.length)
}

/**
 * Les factures déjà en comptabilité, au même montant et au même nom.
 *
 * Une même prestation peut arriver deux fois : par la plateforme et par la
 * boîte de dépôt, ou par une société de portage qui facture en direct pour
 * quelqu'un qui déclare aussi ses heures ici. Ce qui trahit le doublon,
 * c'est le couple nom + montant — un montant seul ne dit rien, les montants
 * ronds se répètent d'une personne à l'autre toute l'année.
 *
 * On ne décide rien : on pose la question, avec la ligne d'en face et sa
 * date, et c'est l'œil humain qui tranche.
 */
export async function chercherDoublons(
  candidats: { id: string; provider: string; total_ttc: number; issue_date: string; pennylaneId?: number | null }[],
  opts: {
    /** Les autres factures de la plateforme : deux des siennes au même
     *  montant ne se voient pas dans Pennylane tant qu'aucune n'y est. */
    plateforme?: { id: string; provider: string; total_ttc: number; issue_date: string }[]
    /** Au-delà, deux factures de même montant relèvent de deux mois de travail. */
    jours?: number
  } = {}
): Promise<Map<string, Doublon[]>> {
  const jours = opts.jours ?? 60
  const out = new Map<string, Doublon[]>()
  if (!isPennylaneConfigured() || candidats.length === 0) return out

  let recentes: Awaited<ReturnType<typeof listSupplierInvoices>>
  try {
    recentes = await listSupplierInvoices({ pages: 3 })
  } catch {
    // Une comptabilité injoignable ne doit pas empêcher de travailler : sans
    // réponse, on n'affirme rien plutôt que de rassurer à tort.
    return out
  }

  type Reference = {
    id: number | string
    date: string
    amount: string | number
    nom: string
    payee: boolean
    source: 'compta' | 'plateforme'
  }
  const references: Reference[] = [
    ...recentes.map((f) => ({
      id: f.id,
      date: f.date,
      amount: f.amount,
      nom: f.supplier?.name ?? f.label ?? '',
      payee: f.paid === true || f.payment_status === 'paid' || f.payment_status === 'paid_offline',
      source: 'compta' as const,
    })),
    ...(opts.plateforme ?? []).map((f) => ({
      id: f.id,
      date: f.issue_date,
      amount: f.total_ttc,
      nom: f.provider,
      payee: false,
      source: 'plateforme' as const,
    })),
  ]

  const centimes = (n: number) => Math.round(n * 100)
  const parMontant = new Map<number, Reference[]>()
  for (const f of references) {
    const c = centimes(Number(f.amount))
    parMontant.set(c, [...(parMontant.get(c) ?? []), f])
  }

  const jour = (d: string) => new Date(`${d}T12:00:00Z`).getTime()
  for (const c of candidats) {
    const memes = parMontant.get(centimes(Number(c.total_ttc))) ?? []
    const trouves = memes.filter((f) => {
      // Celle qu'on regarde est peut-être déjà passée : elle n'est pas son
      // propre doublon, ni côté compta ni côté plateforme.
      if (f.id === c.id) return false
      if (c.pennylaneId && f.id === c.pennylaneId) return false
      if (Math.abs(jour(f.date) - jour(c.issue_date)) > jours * 864e5) return false
      return memeNom(c.provider, f.nom)
    })
    if (trouves.length === 0) continue
    out.set(
      c.id,
      trouves.slice(0, 3).map((f) => ({
        date: f.date,
        montant: Number(f.amount),
        libelle:
          (f.nom || 'facture sans libellé').replace(/\s*\(label généré\)\s*$/, '') +
          (f.source === 'plateforme' ? ' — déjà sur la plateforme' : ''),
        payee: f.payee,
      }))
    )
  }
  return out
}
