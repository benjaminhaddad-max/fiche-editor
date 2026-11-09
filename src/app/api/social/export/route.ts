import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { tableauDuMois } from '@/lib/social/donnees'
import { gereLeSocial, lireParametres } from '@/lib/social/parametres'
import { csvSilae, lignesSilae } from '@/lib/social/saisie'
import type { GroupeSocial } from '@/lib/social/types'

/**
 * Le fichier d'import Silae (§7, phase 1) d'un mois et d'un groupe :
 * Matricule / Code / Valeur / Date début / Date fin, des seules saisies
 * validées (ou déjà transmises, pour relire ce qui est parti). Rien de ce
 * qui n'est pas validé n'y entre.
 */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user || !(await gereLeSocial(user))) return NextResponse.json({ error: 'non autorisé' }, { status: 403 })
  const url = new URL(request.url)
  const mois = url.searchParams.get('mois') ?? ''
  const groupe = (url.searchParams.get('groupe') ?? 'fixes') as GroupeSocial
  if (!/^\d{4}-\d{2}$/.test(mois) || !['fixes', 'vacataires'].includes(groupe)) {
    return NextResponse.json({ error: 'paramètres invalides' }, { status: 400 })
  }
  const { codes } = await lireParametres()
  const lignes = (await tableauDuMois(mois, groupe))
    .filter((l) => l.saisie.status === 'valide' || l.saisie.status === 'transmis')
    .flatMap((l) => lignesSilae(l.salarie, l.saisie, l.netMissions, codes))
  return new NextResponse('﻿' + csvSilae(lignes), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="silae-${groupe}-${mois}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
