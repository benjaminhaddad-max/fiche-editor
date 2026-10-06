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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Les factures déjà en comptabilité qui portent le même montant.
 *
 * Une même prestation peut arriver deux fois : par la plateforme et par la
 * boîte de dépôt, ou par une société de portage qui facture en direct pour
 * quelqu'un qui déclare aussi ses heures ici. Le montant est ce qui se
 * répète — on le signale avant de valider, pas après le virement.
 *
 * On ne décide rien : on pose la question. Deux prestations à 50 € le même
 * mois n'ont rien d'anormal, et c'est à l'œil humain de trancher.
 */
export async function chercherDoublons(
  candidats: { id: string; provider: string; total_ttc: number; issue_date: string }[],
  /** Au-delà, deux montants égaux n'ont plus de rapport entre eux. */
  jours = 21
): Promise<Map<string, Doublon[]>> {
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

  const centimes = (n: number) => Math.round(n * 100)
  const parMontant = new Map<number, typeof recentes>()
  for (const f of recentes) {
    const c = centimes(Number(f.amount))
    parMontant.set(c, [...(parMontant.get(c) ?? []), f])
  }

  const jour = (d: string) => new Date(`${d}T12:00:00Z`).getTime()
  for (const c of candidats) {
    const memes = parMontant.get(centimes(Number(c.total_ttc))) ?? []
    // Celle qu'on regarde est peut-être déjà passée : son propre nom ne
    // compte pas comme un doublon d'elle-même.
    const nomCandidat = norm(c.provider)
    const trouves = memes.filter((f) => {
      // Un montant identique à trois mois d'écart est une coïncidence : les
      // montants ronds se répètent. On ne regarde que la même quinzaine, là
      // où une prestation peut vraiment arriver deux fois.
      if (Math.abs(jour(f.date) - jour(c.issue_date)) > jours * 864e5) return false
      const nom = norm(f.supplier?.name ?? f.label)
      return !nomCandidat || !nom.includes(nomCandidat)
    })
    if (trouves.length === 0) continue
    out.set(
      c.id,
      trouves.slice(0, 3).map((f) => ({
        date: f.date,
        montant: Number(f.amount),
        libelle: (f.supplier?.name ?? f.label ?? 'facture sans libellé').replace(/\s*\(label généré\)\s*$/, ''),
        payee: f.paid === true || f.payment_status === 'paid' || f.payment_status === 'paid_offline',
      }))
    )
  }
  return out
}
