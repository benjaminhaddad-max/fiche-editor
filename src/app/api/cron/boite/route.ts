import { NextResponse } from 'next/server'
import { releverBoite, boiteConfiguree } from '@/lib/inbound/imap'
import { rapprocherEnAttente } from '@/lib/justificatifs/rapprochement'
import { releverRecusGmail } from '@/lib/justificatifs/gmail'
import { servedBrandIds } from '@/lib/brand'
import { sousMarque } from '@/lib/brand/actif'

export const maxDuration = 300

/**
 * Relève les boîtes de dépôt des écoles servies ici (tâche planifiée), puis
 * les reçus des fournisseurs prioritaires dans la boîte de Ben, et repasse
 * au rapprochement ceux arrivés avant leur mouvement bancaire.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  try {
    // Sans boîte de dépôt, les reçus de la boîte de Ben se relèvent quand même.
    const releve = boiteConfiguree() ? await releverBoite() : { raison: 'aucune boîte de dépôt configurée' }
    const justificatifs: Record<string, unknown> = {}
    for (const id of servedBrandIds()) {
      justificatifs[id] = await sousMarque(id, async () => ({
        gmail: await releverRecusGmail({ budgetMs: 150_000 }).catch((err) => ({
          erreur: err instanceof Error ? err.message : String(err),
        })),
        rapprochement: await rapprocherEnAttente(),
      })).catch((err) => ({ erreur: err instanceof Error ? err.message : String(err) }))
    }
    return NextResponse.json({ ok: true, ...releve, justificatifs })
  } catch (err) {
    console.error('[cron boite]', err)
    return NextResponse.json({ ok: false, erreur: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
