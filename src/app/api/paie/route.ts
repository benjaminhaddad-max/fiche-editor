import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { cycleForMonth } from '@/lib/cycle'
import { lignesPaie } from '@/lib/paie'

/** Export CSV des éléments de paie d'un mois, pour le service social. */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (user?.role !== 'admin') return NextResponse.json({ error: 'non autorisé' }, { status: 403 })

  const mois = new URL(request.url).searchParams.get('mois') ?? ''
  if (!/^\d{4}-\d{2}$/.test(mois)) return NextResponse.json({ error: 'mois invalide' }, { status: 400 })
  const cycle = cycleForMonth(mois)
  const lignes = (await lignesPaie(cycle.periodStart, cycle.periodEnd, { avecEnvoyees: true })).filter((l) =>
    ['approved', 'invoiced'].includes(l.status)
  )

  const champ = (v: string | number) => {
    const s = typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const entete = ['Salarié', 'Statut', 'Type', 'Date', 'Désignation', 'Catégorie', 'Quantité', 'Prix unitaire', 'Montant', 'Manager']
  const corps = lignes.map((l) =>
    [
      l.personne,
      l.statut,
      l.kind === 'bonus' ? 'Bonus' : 'Prestation',
      l.date.split('-').reverse().join('/'),
      l.detail,
      l.categorie,
      l.quantity,
      l.unit,
      l.total,
      l.manager,
    ]
      .map(champ)
      .join(';')
  )
  // BOM : Excel ouvre alors le fichier en UTF-8, accents compris.
  const csv = '﻿' + [entete.join(';'), ...corps].join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="paie-${mois}.csv"`,
    },
  })
}
