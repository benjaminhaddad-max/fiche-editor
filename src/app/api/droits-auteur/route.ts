import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { notesAuteurs, notesEnCsv } from '@/lib/invoice/recap-auteurs'
import { declarationParAuteur, declarationsDA } from '@/lib/invoice/declaration-da'
import { declarationEnCsv } from '@/lib/invoice/urssaf-da'

/**
 * Export tableur des droits d'auteur d'une année, pour la déclaration Urssaf.
 * - par défaut : une ligne par auteur et par trimestre (Invoice + historique importé) ;
 * - `?trimestre=2026-T4` : ce seul trimestre ;
 * - `?vue=notes` : le détail note par note (Invoice seulement).
 */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (user?.role !== 'admin') return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
  const q = new URL(request.url).searchParams
  const trimestre = q.get('trimestre')
  if (trimestre && !/^\d{4}-T[1-4]$/.test(trimestre)) return NextResponse.json({ error: 'trimestre invalide' }, { status: 400 })
  const annee = trimestre ? Number(trimestre.slice(0, 4)) : Number(q.get('annee') ?? new Date().getFullYear())
  if (!Number.isInteger(annee) || annee < 2020 || annee > 2100)
    return NextResponse.json({ error: 'année invalide' }, { status: 400 })

  let csv: string
  let nom: string
  if (q.get('vue') === 'notes') {
    const notes = (await notesAuteurs(annee)).filter((n) => !trimestre || n.trimestre.cle === trimestre)
    csv = notesEnCsv(notes)
    nom = `droits-auteur-notes-${trimestre ?? annee}`
  } else {
    const [{ lignes, libelles }, decl] = await Promise.all([declarationParAuteur(annee), declarationsDA()])
    const fr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })
    csv = declarationEnCsv(
      lignes.filter((l) => !trimestre || l.trimestre === trimestre),
      libelles,
      (t) => (decl.get(t) ? fr(decl.get(t)!.declared_at) : null)
    )
    nom = `urssaf-droits-auteur-${trimestre ?? annee}`
  }
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nom}.csv"`,
    },
  })
}
