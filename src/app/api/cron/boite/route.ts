import { NextResponse } from 'next/server'
import { releverBoite, boiteConfiguree } from '@/lib/inbound/imap'

export const maxDuration = 300

/** Relève depotfactures@diploma-sante.fr (tâche planifiée). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorisé' }, { status: 401 })
  }
  if (!boiteConfiguree()) return NextResponse.json({ ok: false, raison: 'boîte non configurée' })
  try {
    return NextResponse.json({ ok: true, ...(await releverBoite()) })
  } catch (err) {
    console.error('[cron boite]', err)
    return NextResponse.json({ ok: false, erreur: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
