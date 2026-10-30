import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { logAudit } from '@/lib/audit'
import { cycleForDate, nextCycle, todayParis } from '@/lib/cycle'
import { round2 } from '@/lib/format'
import { controlerMontant } from '@/lib/invoice/controle'
import { ibanValide } from '@/lib/iban'
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

const champ = (form: FormData | null, nom: string) => String(form?.get(nom) ?? '').trim()

function coordonneesCompletes(c: { legal_name: string; address_line1: string; postal_code: string; city: string; siret: string; iban: string }) {
  return Boolean(c.legal_name && c.address_line1 && c.postal_code && c.city) && /^\d{14}$/.test(c.siret) && ibanValide(c.iban)
}

const refus = (error: string, status = 422) => NextResponse.json({ error }, { status })

/**
 * Facture de commissions déposée sur HubDiploma.
 *
 * Pascal a déjà tranché dans le CRM : la ligne arrive validée, elle attend
 * juste le bordereau du mois. Le montant vient du CRM, le PDF sert de pièce
 * et doit dire la même chose. Aucun nom d'élève ne passe ici.
 *
 * Les commerciaux n'ont pas de compte ici, tout se passe sur HubDiploma : leur
 * fiche se crée au premier dépôt, sans connexion, avec les coordonnées saisies
 * là-bas. Elle reste ensuite, ils n'ont rien à ressaisir.
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

  const coordonnees = {
    legal_name: champ(form, 'nom'),
    address_line1: champ(form, 'adresse'),
    postal_code: champ(form, 'code_postal'),
    city: champ(form, 'ville'),
    siret: champ(form, 'siret').replace(/\s+/g, ''),
    iban: champ(form, 'iban').replace(/\s+/g, '').toUpperCase(),
  }
  const motif = email.replace(/[\\%_]/g, '\\$&')
  const { data: comptes } = await db.from('inv_users').select('id').ilike('email', motif)
  const parCompte = (comptes ?? []).length
    ? (await db
        .from('inv_providers')
        .select('id, employment_type')
        .in('user_id', (comptes ?? []).map((u) => u.id))
        .eq('brand', 'diploma')
        .maybeSingle()).data
    : null
  const parContact =
    parCompte ??
    (await db
      .from('inv_providers')
      .select('id, employment_type')
      .ilike('contact_email', motif)
      .eq('brand', 'diploma')
      .limit(1)
      .maybeSingle()).data
  // Même personne, autre email : le SIRET évite de lui faire une seconde fiche.
  const existante =
    parContact ??
    (coordonnees.siret
      ? (await db
          .from('inv_providers')
          .select('id, employment_type')
          .eq('siret', coordonnees.siret)
          .eq('brand', 'diploma')
          .limit(1)
          .maybeSingle()).data
      : null)
  if (existante && isSalaried(existante.employment_type as Employment)) {
    return refus('Tu es en paie, pas en facture : tes commissions passent par le social.')
  }
  if (!existante && !coordonneesCompletes(coordonnees)) {
    return NextResponse.json(
      { error: 'Complète tes coordonnées de facturation : on ne te les demandera qu’une fois.', code: 'coordonnees' },
      { status: 422 }
    )
  }

  const [{ data: pascal }, { data: categorie }] = await Promise.all([
    db.from('inv_users').select('id').eq('email', PASCAL_EMAIL).maybeSingle(),
    db.from('inv_categories').select('id').eq('name', CATEGORIE).eq('brand', 'diploma').maybeSingle(),
  ])
  if (!pascal || !categorie) return refus('Configuration Diploma Invoice incomplète : préviens Ben.', 500)

  const pdf = Buffer.from(await file.arrayBuffer())
  const controle = await controlerMontant(pdf, montant)
  if (controle.matches === false) return refus(controle.message ?? 'Le montant ne correspond pas.')

  const fiche =
    existante ??
    (await db
      .from('inv_providers')
      .insert({
        ...coordonnees,
        user_id: null,
        contact_email: email,
        invoice_mode: 'uploaded',
        default_manager_id: pascal.id,
        onboarding_complete: true,
        brand: 'diploma',
      })
      .select('id, employment_type')
      .single()).data
  if (!fiche) return refus('Enregistrement impossible.', 500)

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
    actorId: pascal.id,
    entityType: 'mission',
    entityId: mission.id,
    action: 'commission_depot',
    payload: { depot_id: depotId, montant, lignes: nb, controle: controle.matches },
  })

  return NextResponse.json({ ok: true, mission_id: mission.id, cycle: cycle.month, label: cycle.label, limite: cycle.declarationDeadline })
}
