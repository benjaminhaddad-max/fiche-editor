import { appelPennylane, isPennylaneConfigured } from '@/lib/pennylane/client'
import { activeBrand } from '@/lib/brand/actif'

/**
 * Les mouvements dont aucune facture n'existera jamais.
 *
 * Un virement d'approvisionnement entre nos propres comptes, un prélèvement
 * URSSAF, une échéance de prêt : il n'y a pas de pièce à réclamer, et les
 * compter parmi les justificatifs manquants noyait les vrais oublis. Sur
 * l'exercice, ils font à eux seuls mille deux cents lignes sur mille quatre
 * cent soixante-quatre.
 */
const SANS_PIECE_ATTENDUE = [
  /\bVIR\b/i,
  /VIREMENT/i,
  /PRELEVEMENT EUROPEEN/i,
  /\bPRLV\b/i,
  /URSSAF/i,
  /ECHEANCE PRET/i,
  /\bDGFIP\b/i,
  /IMPOT/i,
  /COTISATION/i,
  /REMISE CHEQUE/i,
  /FRAIS BANCAIRES/i,
  /COMMISSION D INTERVENTION/i,
  // Les frais de change que Swan prélève à côté de chaque paiement en
  // devise : deux cent quarante-cinq lignes en octobre 2026, toutes
  // justifiées par le reçu du paiement lui-même.
  /Card transaction in foreign currency/i,
  /FRAIS PAIEMENT HORS ZONE/i,
  /\bCHQ IMP\b/i,
  /NET PAYE/i,
]

export const pieceAttendue = (libelle: string): boolean =>
  !SANS_PIECE_ATTENDUE.some((r) => r.test(libelle))

export interface Depense {
  id: number
  date: string
  libelle: string
  montant: number
  categorie: string | null
  fournisseur: string | null
  /** Pennylane réclame un justificatif et n'en a pas reçu. */
  justificatifManquant: boolean
  /** Un virement interne ou une cotisation n'a pas de facture à produire. */
  pieceAttendue: boolean
  porteur?: string | null
}

/** Un émetteur qui revient : la même facture manque dix fois, pas une. */
export interface SourceRecurrente {
  cle: string
  nombre: number
  total: number
  categorie: string | null
}

export interface MoisDepenses {
  lignes: Depense[]
  /** Les émetteurs dont il manque le justificatif, du plus fréquent au moins. */
  sources: SourceRecurrente[]
  total: number
  parCategorie: { label: string; total: number; nombre: number }[]
  sansCategorie: number
  sansJustificatif: number
  /** La comptabilité n'a pas répondu : on ne dit rien plutôt que zéro. */
  indisponible: boolean
}

const BASE_URL = process.env.PENNYLANE_API_URL ?? 'https://app.pennylane.com/api/external/v2'

interface Brute {
  id: number
  date: string
  label: string | null
  amount: string
  attachment_required?: boolean
  supplier?: { id?: number | null; name?: string | null } | null
  categories?: { label?: string | null }[] | null
  created_at?: string | null
  pro_account_expense?: {
    employee?: { first_name?: string | null; last_name?: string | null } | null
    card_masked_number?: string | null
  } | null
}

/** Un mouvement sortant tel que le reste du code le lit. */
export interface Mouvement {
  id: number
  date: string
  libelle: string
  montant: number
  categorie: string | null
  fournisseur: string | null
  fournisseurId: number | null
  /** Le porteur de la carte, quand le paiement vient d'une carte pro. */
  porteur: string | null
  /** Les quatre derniers chiffres de la carte pro. */
  carte: string | null
  /** L'heure où la banque a vu passer le paiement. */
  creeLe: string | null
  justificatifManquant: boolean
  pieceAttendue: boolean
}

/**
 * Les sorties du compte entre deux dates, toutes pages lues.
 *
 * Octobre 2026 compte mille huit cent soixante-dix-neuf mouvements : la
 * limite de huit pages qui tenait jusqu'ici n'en lisait que huit cents, et
 * l'écran annonçait deux fois moins de justificatifs manquants qu'il n'y en
 * avait. On lit jusqu'à cinquante pages ; au-delà, on le dit plutôt que de
 * rendre un compte faux.
 */
export async function lireMouvements(debut: string, fin: string, opts: { cache?: number } = {}): Promise<Mouvement[]> {
  const filtre = encodeURIComponent(
    JSON.stringify([
      { field: 'date', operator: 'gteq', value: debut },
      { field: 'date', operator: 'lteq', value: fin },
    ])
  )
  const out: Mouvement[] = []
  let curseur: string | null = null
  for (let i = 0; ; i++) {
    if (i >= 50) throw new Error('Plus de cinq mille mouvements sur la période : lecture interrompue.')
    const url = `${BASE_URL}/transactions?limit=100&filter=${filtre}${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`
    const res = await appelPennylane(url, {
      headers: { Authorization: `Bearer ${process.env.PENNYLANE_API_TOKEN}` },
      ...(opts.cache === 0 ? { cache: 'no-store' as const } : { next: { revalidate: opts.cache ?? 3600 } }),
    })
    if (!res.ok) throw new Error(`Pennylane ${res.status}`)
    const json = (await res.json()) as { items?: Brute[]; has_more?: boolean; next_cursor?: string | null }
    for (const t of json.items ?? []) {
      const montant = Number(t.amount)
      if (montant >= 0) continue
      const attendue = pieceAttendue(t.label ?? '')
      const e = t.pro_account_expense?.employee
      out.push({
        id: t.id,
        date: t.date,
        libelle: (t.label ?? '—').replace(/\s*\(label généré\)\s*$/, ''),
        montant: -montant,
        categorie: t.categories?.[0]?.label ?? null,
        fournisseur: t.supplier?.name ?? null,
        fournisseurId: t.supplier?.id ?? null,
        porteur: e ? [e.first_name, e.last_name].filter(Boolean).join(' ') || null : null,
        carte: t.pro_account_expense?.card_masked_number?.slice(-4) ?? null,
        creeLe: t.created_at ?? null,
        justificatifManquant: t.attachment_required === true && attendue,
        pieceAttendue: attendue,
      })
    }
    if (!json.has_more || !json.next_cursor) break
    curseur = json.next_cursor
  }
  return out
}

/**
 * Un libellé bancaire porte le nom de l'émetteur puis une référence qui
 * change à chaque fois : on regroupe sur les deux premiers mots.
 */
export const emetteur = (l: string) =>
  l.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || '—'

/**
 * Ce qui est sorti du compte sur un mois, tel que la banque l'a vu.
 *
 * Les factures disent ce qu'on doit ; les mouvements disent ce qu'on a payé.
 * Les deux ne coïncident jamais tout à fait — un virement groupé, un
 * prélèvement sans facture, une facture réglée le mois suivant — et c'est
 * justement l'écart qu'on veut voir.
 *
 * On lit mois par mois : l'exercice entier représente deux mille cinq cents
 * mouvements, soit vingt-cinq appels. Personne n'attend ça au chargement
 * d'une page.
 */
/**
 * Les dépenses du mois, pour l'école qui tient sa comptabilité ici.
 *
 * Il n'y a qu'un Pennylane, celui de Diploma Santé. Une autre école qui
 * arriverait sur cet écran y lirait les mouvements bancaires de Diploma —
 * c'est ce qui est arrivé à Meryeme.
 */
export async function depensesDuMois(mois: string): Promise<MoisDepenses> {
  const vide: MoisDepenses = {
    lignes: [],
    sources: [],
    total: 0,
    parCategorie: [],
    sansCategorie: 0,
    sansJustificatif: 0,
    indisponible: true,
  }
  // Une école qui ne tient pas sa comptabilité ici n'a rien à y lire.
  if (!isPennylaneConfigured() || !(await activeBrand()).comptabilite) return vide

  const [an, m] = mois.split('-').map(Number)
  const debut = `${mois}-01`
  const fin = new Date(Date.UTC(an, m, 0)).toISOString().slice(0, 10)

  let lignes: Depense[]
  try {
    // Une heure : la comptabilité d'un mois écoulé ne bouge plus guère,
    // et le bouton d'actualisation existe pour le reste.
    lignes = await lireMouvements(debut, fin)
  } catch {
    return vide
  }

  const sourcesMap = new Map<string, SourceRecurrente>()
  for (const l of lignes.filter((x) => x.justificatifManquant)) {
    const k = emetteur(l.libelle)
    const c = sourcesMap.get(k) ?? { cle: k, nombre: 0, total: 0, categorie: l.categorie }
    sourcesMap.set(k, { ...c, nombre: c.nombre + 1, total: c.total + l.montant, categorie: c.categorie ?? l.categorie })
  }

  const par = new Map<string, { total: number; nombre: number }>()
  for (const l of lignes) {
    const k = l.categorie ?? '—'
    const c = par.get(k) ?? { total: 0, nombre: 0 }
    par.set(k, { total: c.total + l.montant, nombre: c.nombre + 1 })
  }

  return {
    lignes: lignes.sort((a, b) => b.date.localeCompare(a.date) || b.montant - a.montant),
    sources: [...sourcesMap.values()].sort((a, b) => b.nombre - a.nombre || b.total - a.total),
    total: lignes.reduce((s, l) => s + l.montant, 0),
    parCategorie: [...par.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.total - a.total),
    sansCategorie: lignes.filter((l) => !l.categorie).reduce((s, l) => s + l.montant, 0),
    sansJustificatif: lignes.filter((l) => l.justificatifManquant).length,
    indisponible: false,
  }
}
