import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { cycleForMonth } from '@/lib/cycle'
import { elementsDuMois } from '@/lib/paie/elements'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import type { Employment } from '@/lib/types'

/** Export des éléments variables, à reprendre dans Silae. */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user || user.role === 'prestataire') {
    return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
  }
  const mois = new URL(request.url).searchParams.get('mois') ?? ''
  if (!/^\d{4}-\d{2}$/.test(mois)) return NextResponse.json({ error: 'mois invalide' }, { status: 400 })

  const lignes = await elementsDuMois(cycleForMonth(mois))
  const champ = (v: string | number | boolean | null) => {
    if (v === null) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'oui' : 'non') : v
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const entete = [
    'Salarié', 'Statut', 'Renseigné', 'Heures supplémentaires', 'Congés payés (j)',
    'Congés sans solde (j)', 'Dates des congés', 'Transport', 'Montant transport',
    'Justificatif fourni', 'Mutuelle', 'Remarque',
  ]
  const corps = lignes.map((l) =>
    [
      l.nom,
      EMPLOYMENT_LABEL[l.statut as Employment],
      l.rempli,
      l.heuresSup,
      l.congesPayes,
      l.congesSansSolde,
      l.detailConges,
      l.transport,
      l.montantTransport,
      Boolean(l.justificatifId),
      l.mutuelle === 'adherent' ? 'adhérent' : l.mutuelle === 'refus' ? 'refus' : 'non précisé',
      l.commentaire,
    ]
      .map(champ)
      .join(';')
  )
  const csv = '﻿' + [entete.join(';'), ...corps].join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="elements-paie-${mois}.csv"`,
    },
  })
}
