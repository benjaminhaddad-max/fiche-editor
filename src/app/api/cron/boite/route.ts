import { NextResponse } from 'next/server'
import { releverBoite, boiteConfiguree } from '@/lib/inbound/imap'
import { rapprocherEnAttente } from '@/lib/justificatifs/rapprochement'
import { servedBrandIds } from '@/lib/brand'
import { sousMarque } from '@/lib/brand/actif'

export const maxDuration = 300

/**
 * Relève les boîtes de dépôt des écoles servies ici (tâche planifiée), puis
 * repasse au rapprochement les reçus arrivés avant leur mouvement bancaire.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  if (!boiteConfiguree()) return NextResponse.json({ ok: false, raison: 'aucune boîte configurée' })
  try {
    const releve = await releverBoite()
    const justificatifs: Record<string, unknown> = {}
    for (const id of servedBrandIds()) {
      justificatifs[id] = await sousMarque(id, () => rapprocherEnAttente()).catch((err) => ({
        erreur: err instanceof Error ? err.message : String(err),
      }))
    }
    return NextResponse.json({ ok: true, ...releve, justificatifs })
  } catch (err) {
    console.error('[cron boite]', err)
    return NextResponse.json({ ok: false, erreur: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
