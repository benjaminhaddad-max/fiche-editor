import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { cycleForDate, nextCycle, todayParis } from '@/lib/cycle'
import { round2 } from '@/lib/format'
import { controlerMontant } from '@/lib/invoice/controle'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'
import { isSalaried, type Employment } from '@/lib/types'

export const maxDuration = 60

/** Vercel plafonne le corps d'une requête à 4,5 Mo. */
const MAX_PDF_BYTES = 4 * 1024 * 1024
const PASCAL_EMAIL = 'pascal@diploma-sante.fr'
const CATEGORIE = 'Commercial - Télépro / Closers Internes'

function secretValide(recu: string): boolean {
  const secret = process.env.COMMISSIONS_DEPOT_SECRET
  if (!secret) return false
  const attendu = Buffer.from(`Bearer ${secret}`)
  const donne = Buffer.from(recu)
  return attendu.length === donne.length && timingSafeEqual(attendu, donne)
}

const refus = (error: string, status = 422) => NextResponse.json({ error }, { status })

/**
 * Facture de commissions déposée sur HubDiploma.
 *
 * Pascal a déjà tranché dans le CRM : la ligne arrive validée, elle attend
 * juste le bordereau du mois. Le montant vient du CRM, le PDF sert de pièce
 * et doit dire la même chose. Aucun nom d'élève ne passe ici.
 *
 * Après la clôture des déclarations (L−3), la ligne part sur le mois suivant :
 * le bordereau du mois en cours est déjà en vérification.
 */
export async function POST(request: Request) {
  if (!secretValide(request.headers.get('authorization') ?? '')) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  const depotId = String(form?.get('depot_id') ?? '')
  const email = String(form?.get('email') ?? '').trim()
  const montant = round2(Number(form?.get('montant_ht')))
  const nb = Number(form?.get('nb_lignes'))
  const file = form?.get('file')
  if (!/^[0-9a-f-]{36}$/i.test(depotId) || !email || !(montant > 0) || !(nb > 0)) {
    return refus('Dépôt incomplet.', 400)
  }
  if (!(file instanceof File) || file.size === 0) return refus('Sélectionne le PDF de ta facture.', 400)
  if (file.size > MAX_PDF_BYTES) return refus('Le PDF ne doit pas dépasser 4 Mo.', 400)

  const db = createServiceClient()

  // Le CRM renvoie le même dépôt après une coupure : on répond sans rien refaire.
  const { data: deja } = await db
    .from('inv_missions')
    .select('id, start_date')
    .eq('commission_depot_id', depotId)
    .maybeSingle()
  if (deja) {
    const cycle = cycleForDate(deja.start_date)
    return NextResponse.json({ ok: true, mission_id: deja.id, cycle: cycle.month, label: cycle.label, limite: cycle.declarationDeadline })
  }

  const { data: comptes } = await db
    .from('inv_users')
    .select('id')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
  const { data: fiche } = await db
    .from('inv_providers')
    .select('id, user_id, employment_type')
    .in('user_id', (comptes ?? []).map((u) => u.id))
    .eq('brand', 'diploma')
    .maybeSingle()
  if (!fiche) return refus('Pas de compte Diploma Invoice à ton adresse email : préviens Ben.')
  if (isSalaried(fiche.employment_type as Employment)) {
    return refus('Tu es en paie, pas en facture : tes commissions passent par le social.')
  }

  const [{ data: pascal }, { data: categorie }] = await Promise.all([
    db.from('inv_users').select('id').eq('email', PASCAL_EMAIL).maybeSingle(),
    db.from('inv_categories').select('id').eq('name', CATEGORIE).eq('brand', 'diploma').maybeSingle(),
  ])
  if (!pascal || !categorie) return refus('Configuration Diploma Invoice incomplète : préviens Ben.', 500)

  const pdf = Buffer.from(await file.arrayBuffer())
  const controle = await controlerMontant(pdf, montant)
  if (controle.matches === false) return refus(controle.message ?? 'Le montant ne correspond pas.')

  const today = todayParis()
  const courant = cycleForDate(today)
  const cycle = today <= courant.declarationDeadline ? courant : nextCycle(courant)
  const date = today <= courant.declarationDeadline ? today : cycle.periodStart

  const path = `${fiche.id}/commissions/${depotId}.pdf`
  const { error: stockage } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true })
  if (stockage) return refus(`Dépôt impossible : ${stockage.message}`, 500)

  const now = new Date().toISOString()
  const { data: mission, error } = await db
    .from('inv_missions')
    .insert({
      provider_id: fiche.id,
      manager_id: pascal.id,
      category_id: categorie.id,
      detail: `Commissions ${cycle.label} — ${nb} inscription${nb > 1 ? 's' : ''} (HubDiploma, validé par Pascal)`,
      start_date: date,
      end_date: date,
      pricing_type: 'forfait_mission',
      quantity: 1,
      unit_amount_ht: montant,
      total_ht: montant,
      status: 'manager_approved',
      origin: 'provider',
      submitted_at: now,
      manager_approved_at: now,
      manager_approved_by: pascal.id,
      commission_depot_id: depotId,
      commission_pdf_path: path,
      commission_pdf_name: file.name.slice(0, 200),
      commission_ai_check: controle,
    })
    .select('id')
    .single()
  if (error || !mission) {
    console.error('[commissions:depot]', error?.message)
    await db.storage.from(INVOICE_BUCKET).remove([path])
    return refus('Enregistrement impossible.', 500)
  }

  await logAudit(null, {
    actorId: fiche.user_id,
    entityType: 'mission',
    entityId: mission.id,
    action: 'commission_depot',
    payload: { depot_id: depotId, montant, lignes: nb, controle: controle.matches },
  })

  return NextResponse.json({ ok: true, mission_id: mission.id, cycle: cycle.month, label: cycle.label, limite: cycle.declarationDeadline })
}
