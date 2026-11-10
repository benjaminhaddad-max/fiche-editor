import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { notesAuteurs, notesEnCsv } from '@/lib/invoice/recap-auteurs'

/** Export tableur des notes de droits d'auteur d'une année, pour la déclaration Urssaf. */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (user?.role !== 'admin') return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
  const annee = Number(new URL(request.url).searchParams.get('annee') ?? new Date().getFullYear())
  if (!Number.isInteger(annee) || annee < 2020 || annee > 2100)
    return NextResponse.json({ error: 'année invalide' }, { status: 400 })
  const csv = notesEnCsv(await notesAuteurs(annee))
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="droits-auteur-${annee}.csv"`,
    },
  })
}
