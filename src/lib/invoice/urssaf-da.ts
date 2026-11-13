/**
 * Déclaration Urssaf artistes-auteurs (règles de Nolwenn, 13/11/2026) :
 * quelles prestations ouvrent droit au régime, l'import de l'historique
 * tenu dans le tableur, et le cumul par auteur et par trimestre.
 *
 * Fichier sans dépendance : testé tel quel (urssaf-da.test.mjs).
 */

// ------------------------------------------------------------
// 1. Éligibilité
// ------------------------------------------------------------

/**
 * Seule une œuvre originale se paie en droits d'auteur : fiches, schémas,
 * QCM, création de contenu. L'actualisation compte quand elle réécrit le
 * support (œuvre dérivée, branche écrivains : urssaf.fr, 13/11/2026).
 * Cours, ED et coaching restent « à valider » : l'enseignement est exclu
 * du régime (CSS art. R382-1). Libellés Medibox : migration 56.
 */
const ELIGIBLE = /fiche|sch[ée]ma|qcm|cr[ée]ation|contenu|actualisation|r[ée]daction/i

/**
 * Le régime n'est pas exclu, mais pas évident : on avertit sans bloquer.
 * Cours, ED, coaching et tutorat sont des prestations, pas des œuvres.
 */
export const A_VALIDER_COMPTABLE = 'à valider par le comptable'

export type Eligibilite = 'eligible' | 'a_valider'

export function eligibiliteDA(categorie: string | null | undefined): Eligibilite {
  return categorie && ELIGIBLE.test(categorie) ? 'eligible' : 'a_valider'
}

/** Les catégories d'une note qui demandent l'avis du comptable, sans doublon. */
export function categoriesAValider(categories: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const c of categories) if (eligibiliteDA(c) === 'a_valider') out.add(c?.trim() || 'Sans catégorie')
  return [...out].sort((a, b) => a.localeCompare(b, 'fr'))
}

// ------------------------------------------------------------
// 2. Import de l'historique
// ------------------------------------------------------------

export interface LigneHistorique {
  trimestre: string
  date_versement: string | null
  auteur: string
  secu: string | null
  brut: number | null
  precompte: number | null
  net: number | null
  contribution: number | null
  ligne_source: Record<string, string>
}

export interface ResultatImport {
  lignes: LigneHistorique[]
  rejets: { ligne: number; raison: string }[]
  colonnes: Record<string, string | null>
}

const sansAccent = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()

/** Les en-têtes reconnus, du plus précis au plus large. */
const COLONNES: Record<keyof Omit<LigneHistorique, 'ligne_source'>, RegExp[]> = {
  trimestre: [/^trimestre$/, /^trim/, /^periode$/],
  date_versement: [/date de versement/, /date de paiement/, /^date/],
  auteur: [/^auteur$/, /^nom/, /auteur/, /prestataire/, /beneficiaire/],
  secu: [/securite sociale/, /secu/, /^nir$/, /^insee/],
  brut: [/^brut$/, /brut/, /montant brut/],
  precompte: [/total precompte/, /^precompte$/, /precompte/],
  net: [/net verse/, /^net$/, /net/],
  contribution: [/contribution/, /diffuseur/],
}

/** Découpe une ligne CSV (séparateur « ; », « , » ou tabulation ; guillemets doublés). */
function cellules(ligne: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (q) {
      if (c === '"' && ligne[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === sep) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/** « 1 234,56 € », « 1234.56 », « -12,5 » → nombre ; vide → null ; illisible → NaN. */
export function montant(v: string | undefined): number | null {
  const t = (v ?? '').replace(/[\s  €]/g, '')
  if (!t) return null
  let n = t
  if (n.includes(',') && n.includes('.')) n = n.lastIndexOf(',') > n.lastIndexOf('.') ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '')
  else n = n.replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(n) ? Math.round(Number(n) * 100) / 100 : NaN
}

/** « 15/03/2025 », « 2025-03-15 », « 15-03-2025 » → AAAA-MM-JJ ; vide → null ; illisible → undefined. */
export function dateIso(v: string | undefined): string | null | undefined {
  const t = (v ?? '').trim()
  if (!t) return null
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return undefined
}

/** « 2025-T1 », « T1 2025 », « 2025 T1 », « Q1 2025 », « 1T2025 » → « 2025-T1 ». */
export function cleTrimestre(v: string | undefined): string | null {
  const t = (v ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
  let m = t.match(/(\d{4})\s*[-/ ]?\s*[TQ]\s*([1-4])\b/)
  if (m) return `${m[1]}-T${m[2]}`
  m = t.match(/\b[TQ]\s*([1-4])\s*[-/ ]?\s*(\d{4})/) ?? t.match(/\b([1-4])\s*T\s*(\d{4})/)
  if (m) return `${m[2]}-T${m[1]}`
  return null
}

export function trimestreDeDate(iso: string): string {
  return `${iso.slice(0, 4)}-T${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`
}

/**
 * Lit le tableur exporté en CSV. Chaque valeur est reprise telle qu'écrite :
 * aucun montant n'est calculé à partir d'un autre. Le trimestre vient de sa
 * colonne, ou à défaut de la date de versement (le rattachement, pas un
 * montant). Une ligne sans auteur ou sans trimestre est rejetée, avec sa raison.
 */
export function lireHistoriqueCsv(texte: string): ResultatImport {
  const brut = texte.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lignesTexte = brut.split('\n')
  const iEntete = lignesTexte.findIndex((l) => l.trim() !== '')
  if (iEntete < 0) return { lignes: [], rejets: [{ ligne: 0, raison: 'Fichier vide.' }], colonnes: {} }
  const entete = lignesTexte[iEntete]
  const sep = [';', '\t', ','].sort((a, b) => entete.split(b).length - entete.split(a).length)[0]
  const titres = cellules(entete, sep)
  const normes = titres.map(sansAccent)

  const index: Partial<Record<keyof typeof COLONNES, number>> = {}
  const pris = new Set<number>()
  for (const cle of Object.keys(COLONNES) as (keyof typeof COLONNES)[]) {
    for (const re of COLONNES[cle]) {
      const i = normes.findIndex((n, k) => !pris.has(k) && re.test(n))
      if (i >= 0) {
        index[cle] = i
        pris.add(i)
        break
      }
    }
  }
  const colonnes = Object.fromEntries(
    (Object.keys(COLONNES) as (keyof typeof COLONNES)[]).map((k) => [k, index[k] !== undefined ? titres[index[k]!] : null])
  )

  const lignes: LigneHistorique[] = []
  const rejets: ResultatImport['rejets'] = []
  if (index.auteur === undefined) {
    rejets.push({ ligne: iEntete + 1, raison: 'Colonne « Auteur » (ou « Nom ») introuvable.' })
    return { lignes, rejets, colonnes }
  }

  for (let n = iEntete + 1; n < lignesTexte.length; n++) {
    if (!lignesTexte[n].trim()) continue
    const c = cellules(lignesTexte[n], sep)
    const val = (k: keyof typeof COLONNES) => (index[k] !== undefined ? c[index[k]!] : undefined)
    const source = Object.fromEntries(titres.map((t, k) => [t || `colonne ${k + 1}`, c[k] ?? '']))
    const auteur = (val('auteur') ?? '').trim()
    // Ligne de total du tableur : on ne l'importe pas, elle n'est pas un versement.
    if (/^(total|sous[- ]total)\b/i.test(c.find((x) => x) ?? '')) continue
    if (!auteur) {
      if (c.every((x) => !x)) continue
      rejets.push({ ligne: n + 1, raison: 'Auteur vide.' })
      continue
    }
    const d = dateIso(val('date_versement'))
    if (d === undefined) {
      rejets.push({ ligne: n + 1, raison: `Date illisible : « ${val('date_versement')} ».` })
      continue
    }
    const trimestre = cleTrimestre(val('trimestre')) ?? (d ? trimestreDeDate(d) : null)
    if (!trimestre) {
      rejets.push({ ligne: n + 1, raison: 'Ni trimestre ni date de versement.' })
      continue
    }
    const montants = {
      brut: montant(val('brut')),
      precompte: montant(val('precompte')),
      net: montant(val('net')),
      contribution: montant(val('contribution')),
    }
    const illisible = Object.entries(montants).find(([, v]) => Number.isNaN(v))
    if (illisible) {
      rejets.push({ ligne: n + 1, raison: `Montant illisible (${illisible[0]}) : « ${val(illisible[0] as keyof typeof COLONNES)} ».` })
      continue
    }
    lignes.push({
      trimestre,
      date_versement: d,
      auteur,
      secu: (val('secu') ?? '').replace(/\s/g, '') || null,
      ...montants,
      ligne_source: source,
    })
  }
  return { lignes, rejets, colonnes }
}

// ------------------------------------------------------------
// 3. Cumul par auteur et par trimestre
// ------------------------------------------------------------

export interface LigneDeclaration {
  trimestre: string
  auteur: string
  secu: string | null
  brut: number | null
  /** Une valeur par libellé du précompte ; vide pour l'historique (le tableur n'a que le total). */
  precompte: Record<string, number | null>
  totalPrecompte: number | null
  net: number | null
  contribution: number | null
  source: 'invoice' | 'historique'
  provisoire: boolean
  aValider: string[]
}

const plus = (a: number | null, b: number | null) =>
  a === null && b === null ? null : Math.round(((a ?? 0) + (b ?? 0)) * 100) / 100

/**
 * Une ligne par auteur, par trimestre et par source. Les lignes Invoice et
 * historique d'un même auteur restent séparées : on ne mélange pas un
 * montant calculé avec un montant repris du tableur.
 */
export function cumulParAuteur(lignes: LigneDeclaration[]): LigneDeclaration[] {
  const par = new Map<string, LigneDeclaration>()
  for (const l of lignes) {
    const cle = `${l.trimestre}|${l.source}|${(l.secu || l.auteur).toLowerCase()}`
    const a = par.get(cle)
    if (!a) {
      par.set(cle, { ...l, precompte: { ...l.precompte }, aValider: [...l.aValider] })
      continue
    }
    a.brut = plus(a.brut, l.brut)
    a.totalPrecompte = plus(a.totalPrecompte, l.totalPrecompte)
    a.net = plus(a.net, l.net)
    a.contribution = plus(a.contribution, l.contribution)
    for (const [k, v] of Object.entries(l.precompte)) a.precompte[k] = plus(a.precompte[k] ?? null, v)
    a.provisoire ||= l.provisoire
    a.secu ||= l.secu
    for (const c of l.aValider) if (!a.aValider.includes(c)) a.aValider.push(c)
  }
  return [...par.values()].sort(
    (x, y) => x.trimestre.localeCompare(y.trimestre) || x.auteur.localeCompare(y.auteur, 'fr') || x.source.localeCompare(y.source)
  )
}

const csvCell = (v: string | number | null) => {
  const t = v === null ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** L'export trimestriel par auteur : séparateur « ; », virgule décimale. */
export function declarationEnCsv(lignes: LigneDeclaration[], libelles: string[], declare: (t: string) => string | null): string {
  const entete = [
    'Trimestre',
    'Statut du trimestre',
    'Auteur',
    'N° sécurité sociale',
    'Source',
    'Brut',
    ...libelles,
    'Total précompte',
    'Net versé',
    'Contribution diffuseur 1,1 %',
    'Avertissement',
  ]
  const rows = lignes.map((l) => {
    const d = declare(l.trimestre)
    return [
      l.trimestre,
      d ? `déclaré le ${d}` : 'à déclarer',
      l.auteur,
      l.secu,
      l.source === 'historique' ? 'historique importé' : l.provisoire ? 'Invoice (provisoire : non payée)' : 'Invoice',
      l.brut,
      ...libelles.map((k) => l.precompte[k] ?? null),
      l.totalPrecompte,
      l.net,
      l.contribution,
      l.aValider.length ? `${l.aValider.join(', ')} : ${A_VALIDER_COMPTABLE}` : '',
    ]
  })
  return '﻿' + [entete, ...rows].map((r) => r.map(csvCell).join(';')).join('\n')
}
