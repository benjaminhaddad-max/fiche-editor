import { isPennylaneConfigured } from '@/lib/pennylane/client'

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
  supplier?: { name?: string | null } | null
  categories?: { label?: string | null }[] | null
}

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
  if (!isPennylaneConfigured()) return vide

  const [an, m] = mois.split('-').map(Number)
  const debut = `${mois}-01`
  const fin = new Date(Date.UTC(an, m, 0)).toISOString().slice(0, 10)
  const filtre = encodeURIComponent(
    JSON.stringify([
      { field: 'date', operator: 'gteq', value: debut },
      { field: 'date', operator: 'lteq', value: fin },
    ])
  )

  const lignes: Depense[] = []
  let curseur: string | null = null
  try {
    for (let i = 0; i < 8; i++) {
      const url = `${BASE_URL}/transactions?limit=100&filter=${filtre}${curseur ? `&cursor=${encodeURIComponent(curseur)}` : ''}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.PENNYLANE_API_TOKEN}` },
        // Une heure : la comptabilité d'un mois écoulé ne bouge plus guère,
        // et le bouton d'actualisation existe pour le reste.
        next: { revalidate: 3600 },
      })
      if (!res.ok) throw new Error(String(res.status))
      const json = (await res.json()) as { items?: Brute[]; has_more?: boolean; next_cursor?: string | null }
      for (const t of json.items ?? []) {
        const montant = Number(t.amount)
        if (montant >= 0) continue
        lignes.push({
          id: t.id,
          date: t.date,
          libelle: (t.label ?? '—').replace(/\s*\(label généré\)\s*$/, ''),
          montant: -montant,
          categorie: t.categories?.[0]?.label ?? null,
          fournisseur: t.supplier?.name ?? null,
          justificatifManquant: t.attachment_required === true && pieceAttendue(t.label ?? ''),
          pieceAttendue: pieceAttendue(t.label ?? ''),
        })
      }
      if (!json.has_more || !json.next_cursor) break
      curseur = json.next_cursor
    }
  } catch {
    return vide
  }

  // Un libellé bancaire porte le nom de l'émetteur puis une référence qui
  // change à chaque fois : on regroupe sur les deux premiers mots.
  const emetteur = (l: string) =>
    l.toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || '—'
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
