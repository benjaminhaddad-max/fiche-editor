import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { notesAuteurs } from '@/lib/invoice/recap-auteurs'
import { cumulParAuteur, type LigneDeclaration } from '@/lib/invoice/urssaf-da'

export interface HistoriqueLigne {
  id: string
  trimestre: string
  date_versement: string | null
  auteur: string
  secu: string | null
  brut: number | null
  precompte: number | null
  net: number | null
  contribution: number | null
  import_id: string
  fichier: string | null
  imported_at: string
}

export interface Declaration {
  trimestre: string
  declared_at: string
  commentaire: string | null
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/** L'historique importé d'une année (imports retirés exclus). */
export async function historiqueDA(annee: number): Promise<HistoriqueLigne[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_da_historique')
    .select('id, trimestre, date_versement, auteur, secu, brut, precompte, net, contribution, import_id, fichier, imported_at')
    .eq('brand', await activeBrandId())
    .is('retire_at', null)
    .like('trimestre', `${annee}-T%`)
    .order('trimestre')
    .order('auteur')
  return (data ?? []).map((r) => ({
    ...r,
    brut: num(r.brut),
    precompte: num(r.precompte),
    net: num(r.net),
    contribution: num(r.contribution),
  })) as HistoriqueLigne[]
}

/** Les trimestres déclarés à l'Urssaf, par clé « 2026-T4 ». */
export async function declarationsDA(): Promise<Map<string, Declaration>> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_da_declarations')
    .select('trimestre, declared_at, commentaire')
    .eq('brand', await activeBrandId())
  return new Map((data ?? []).map((d) => [d.trimestre, d as Declaration]))
}

/** Les lignes de la déclaration d'une année : Invoice et historique, cumulées par auteur et trimestre. */
export async function declarationParAuteur(annee: number): Promise<{ lignes: LigneDeclaration[]; libelles: string[] }> {
  const [notes, histo] = await Promise.all([notesAuteurs(annee), historiqueDA(annee)])
  const libelles = notes[0]?.precompte.map((l) => l.libelle) ?? []
  const base: LigneDeclaration[] = [
    ...notes.map((n) => ({
      trimestre: n.trimestre.cle,
      auteur: n.auteur,
      secu: n.secu,
      brut: n.brut,
      precompte: Object.fromEntries(n.precompte.map((l) => [l.libelle, l.montant])),
      totalPrecompte: n.totalPrecompte,
      net: n.net,
      contribution: n.contribution,
      source: 'invoice' as const,
      provisoire: !n.payee,
      aValider: n.aValider,
    })),
    ...histo.map((h) => ({
      trimestre: h.trimestre,
      auteur: h.auteur,
      secu: h.secu,
      brut: h.brut,
      precompte: {},
      totalPrecompte: h.precompte,
      net: h.net,
      contribution: h.contribution,
      source: 'historique' as const,
      provisoire: false,
      aValider: [],
    })),
  ]
  return { lignes: cumulParAuteur(base), libelles }
}
