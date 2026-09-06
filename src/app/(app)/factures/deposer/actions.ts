'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireProvider } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { lireFacture } from '@/lib/invoice/extract'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export interface DepotResult {
  error?: string
  avertissement?: string
}

const MAX_PDF = 10 * 1024 * 1024

/**
 * Le prestataire dépose une facture complémentaire. On en lit les lignes
 * pour qu'il puisse désigner un responsable par ligne.
 *
 * Rien n'est créé comme prestation à ce stade : la lecture automatique
 * propose, elle ne décide pas. Un PDF mal lu ne doit pas pouvoir entrer
 * seul dans le circuit de paiement.
 */
export async function deposerFacture(
  _prev: DepotResult,
  formData: FormData
): Promise<DepotResult> {
  const { user, provider } = await requireProvider()
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Sélectionnez le PDF de votre facture.' }
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return { error: 'Le fichier doit être un PDF.' }
  }
  if (file.size > MAX_PDF) return { error: 'Le PDF ne doit pas dépasser 10 Mo.' }

  const bytes = Buffer.from(await file.arrayBuffer())
  const batch = randomUUID()
  const chemin = `${provider.id}/depots/${batch}.pdf`

  const service = createServiceClient()
  const { error: stockage } = await service.storage
    .from(INVOICE_BUCKET)
    .upload(chemin, bytes, { contentType: 'application/pdf', upsert: true })
  if (stockage) return { error: `Dépôt impossible : ${stockage.message}` }

  let lecture
  try {
    lecture = await lireFacture(bytes)
  } catch (err) {
    console.error('[deposerFacture]', err)
    return {
      error:
        'Le document n’a pas pu être lu automatiquement. Vérifiez qu’il s’agit bien ' +
        'd’un PDF de facture lisible, ou saisissez vos prestations une par une.',
    }
  }

  if (lecture.lignes.length === 0) {
    return {
      error:
        lecture.avertissement ??
        'Aucune ligne de prestation n’a été trouvée dans ce document.',
    }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('inv_import_lines').insert(
    lecture.lignes.map((l, i) => ({
      provider_id: provider.id,
      batch_id: batch,
      source_file: file.name,
      source_path: chemin,
      description: l.description.slice(0, 500),
      quantity: l.quantity,
      unit_amount_ht: l.unit_amount_ht,
      total_ht: l.total_ht,
      line_date: l.line_date,
      raw: { ...l, numero: lecture.numero },
      sort_order: i + 1,
    }))
  )
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: batch,
    action: 'depot_facture',
    payload: { fichier: file.name, lignes: lecture.lignes.length },
  })

  revalidatePath('/factures/deposer')
  redirect(`/factures/deposer/${batch}`)
}

export interface AffectationResult {
  error?: string
}

/**
 * Le prestataire a désigné un responsable et une catégorie par ligne :
 * chaque ligne devient une prestation soumise à SON responsable.
 */
export async function confirmerLignes(
  _prev: AffectationResult,
  formData: FormData
): Promise<AffectationResult> {
  const { user, provider } = await requireProvider()
  const batch = String(formData.get('batch_id') ?? '')
  if (!batch) return { error: 'Dépôt introuvable.' }

  const supabase = await createServerSupabase()
  const { data: lignes } = await supabase
    .from('inv_import_lines')
    .select('*')
    .eq('batch_id', batch)
    .eq('provider_id', provider.id)
    .eq('status', 'extracted')
    .order('sort_order')

  if (!lignes?.length) return { error: 'Aucune ligne à confirmer.' }

  const manquantes: string[] = []
  const aCreer: { ligne: (typeof lignes)[number]; manager: string; categorie: string }[] = []

  for (const l of lignes) {
    const garder = formData.get(`garder_${l.id}`) === 'on'
    if (!garder) continue
    const manager = String(formData.get(`manager_${l.id}`) ?? '')
    const categorie = String(formData.get(`categorie_${l.id}`) ?? '')
    if (!manager || !categorie) {
      manquantes.push(l.description.slice(0, 60))
      continue
    }
    aCreer.push({ ligne: l, manager, categorie })
  }

  if (manquantes.length) {
    return {
      error: `Indiquez un responsable et une catégorie pour : ${manquantes.join(' · ')}`,
    }
  }
  if (!aCreer.length) return { error: 'Sélectionnez au moins une ligne à transmettre.' }

  const maintenant = new Date().toISOString()
  for (const { ligne, manager, categorie } of aCreer) {
    const { data: mission, error } = await supabase
      .from('inv_missions')
      .insert({
        provider_id: provider.id,
        manager_id: manager,
        category_id: categorie,
        detail: ligne.description,
        start_date: ligne.line_date ?? maintenant.slice(0, 10),
        end_date: ligne.line_date,
        pricing_type: 'forfait_mission',
        quantity: Number(ligne.quantity ?? 1) || 1,
        unit_amount_ht: Number(ligne.unit_amount_ht ?? ligne.total_ht),
        total_ht: Number(ligne.total_ht),
        status: 'submitted',
        origin: 'provider',
        submitted_at: maintenant,
      })
      .select('id')
      .single()

    if (error) return { error: `Transmission impossible : ${error.message}` }

    await supabase
      .from('inv_import_lines')
      .update({ status: 'confirmed', manager_id: manager, category_id: categorie, mission_id: mission.id })
      .eq('id', ligne.id)
  }

  // Les lignes non retenues sont écartées, pas laissées en suspens.
  await supabase
    .from('inv_import_lines')
    .update({ status: 'discarded' })
    .eq('batch_id', batch)
    .eq('status', 'extracted')

  await logAudit(supabase, {
    actorId: user.id,
    entityType: 'invoice',
    entityId: batch,
    action: 'depot_confirme',
    payload: { lignes: aCreer.length },
  })

  revalidatePath('/missions')
  redirect('/missions')
}
