'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { modeleSuggere } from '@/lib/invoice/net-auteur'
import { activeBrandId } from '@/lib/brand/actif'
import { lireHistoriqueCsv } from '@/lib/invoice/urssaf-da'

export interface DAResult {
  error?: string
  success?: string
}

const date = z
  .union([z.iso.date('Date invalide.'), z.literal('')])
  .optional()
  .transform((v) => (v ? v : null))
const texte = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null))

const FicheDA = z
  .object({
    provider_id: z.uuid(),
    tax_residence_country: texte(60),
    country: z.string().trim().min(2, 'Indiquez le pays de l’adresse.').max(60),
    // Le modèle 1 est archivé : il ne se choisit plus.
    da_model: z.enum(['auto', '2', '3', '4']),
    a1_number: texte(60),
    a1_issuer: texte(120),
    a1_start: date,
    a1_end: date,
    da_profile_status: z.enum(['', 'complete', 'incomplete', 'a_valider']).transform((v) => (v ? v : null)),
  })
  .refine((v) => !v.a1_start || !v.a1_end || v.a1_end >= v.a1_start, {
    message: 'La fin du A1 doit suivre son début.',
    path: ['a1_end'],
  })

/**
 * Enregistre la partie « droits d'auteur » de la fiche : résidence fiscale,
 * pays de l'adresse, modèle, A1, statut.
 *
 * « Automatique » pose le modèle que la résidence et le A1 appellent ; si
 * la résidence n'est pas renseignée, le modèle reste vide (lu comme le 2).
 * Ne touche à aucune note déjà émise : le modèle est figé sur chaque note
 * à sa création.
 */
export async function enregistrerFicheDA(_prev: DAResult, fd: FormData): Promise<DAResult> {
  const user = await requireRole('admin')
  const parsed = FicheDA.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { provider_id, da_model, ...reste } = parsed.data

  let modele: string | null
  let note = ''
  if (da_model === 'auto') {
    const s = modeleSuggere(reste)
    modele = s.modele ? String(s.modele) : null
    note = ` ${s.raison}`
  } else {
    modele = da_model
  }

  const db = createServiceClient()
  const { error } = await db
    .from('inv_providers')
    .update({ ...reste, da_model: modele })
    .eq('id', provider_id)
    .eq('employment_type', 'droits_auteur')
  if (error) return { error: `Enregistrement impossible : ${error.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: provider_id,
    action: 'fiche_da',
    payload: { da_model: modele, choix: da_model, statut: reste.da_profile_status },
  })
  revalidatePath(`/admin/prestataires/${provider_id}`)
  revalidatePath('/admin/droits-auteur')
  return { success: `Fiche droits d’auteur enregistrée.${note}` }
}

const MAX_PDF = 4 * 1024 * 1024

/**
 * Dépose un justificatif sur la fiche : attestation de résidence fiscale
 * ou formulaire A1, avec sa date d'expiration. Un nouveau dépôt n'efface
 * pas l'ancien : l'historique des justificatifs reste au dossier.
 */
export async function deposerJustificatifDA(_prev: DAResult, fd: FormData): Promise<DAResult> {
  const user = await requireRole('admin')
  const providerId = String(fd.get('provider_id') ?? '')
  const kind = String(fd.get('kind') ?? '')
  const expires = String(fd.get('expires_at') ?? '')
  const fichier = fd.get('file')
  if (!z.uuid().safeParse(providerId).success) return { error: 'Fiche introuvable.' }
  if (kind !== 'residence_fiscale' && kind !== 'a1') return { error: 'Choisissez le type de justificatif.' }
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: 'Date d’expiration invalide.' }
  if (!(fichier instanceof File) || fichier.size === 0) return { error: 'Choisissez le PDF du justificatif.' }
  if (!fichier.name.toLowerCase().endsWith('.pdf') && fichier.type !== 'application/pdf') {
    return { error: 'Le justificatif doit être un PDF.' }
  }
  if (fichier.size > MAX_PDF) return { error: 'Le PDF ne doit pas dépasser 4 Mo.' }

  const db = createServiceClient()
  const path = `${providerId}/${kind}-${Date.now()}.pdf`
  const { error: e1 } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(path, Buffer.from(await fichier.arrayBuffer()), { contentType: 'application/pdf' })
  if (e1) return { error: `Dépôt impossible : ${e1.message}` }

  const label = kind === 'a1' ? 'Formulaire A1' : 'Attestation de résidence fiscale'
  const { error: e2 } = await db.from('inv_documents').insert({
    provider_id: providerId,
    kind,
    label,
    path,
    filename: fichier.name,
    source: 'upload',
    uploaded_by: user.id,
    expires_at: expires || null,
  })
  if (e2) return { error: `Enregistrement impossible : ${e2.message}` }

  await logAudit(null, {
    actorId: user.id,
    entityType: 'provider',
    entityId: providerId,
    action: 'justificatif_da',
    payload: { kind, expires_at: expires || null },
  })
  revalidatePath(`/admin/prestataires/${providerId}`)
  revalidatePath('/admin/droits-auteur')
  return { success: `${label} déposé(e).` }
}

const CLE_TRIMESTRE = /^\d{4}-T[1-4]$/

/**
 * Marque un trimestre « déclaré » à l'Urssaf (ou le repasse « à déclarer »).
 * Ne touche à aucune note ni à aucun paiement : c'est un repère pour Nolwenn.
 */
export async function basculerDeclaration(_prev: DAResult, fd: FormData): Promise<DAResult> {
  const user = await requireRole('admin')
  const trimestre = String(fd.get('trimestre') ?? '')
  const declarer = fd.get('declarer') === '1'
  if (!CLE_TRIMESTRE.test(trimestre)) return { error: 'Trimestre invalide.' }
  const brand = await activeBrandId()
  const db = createServiceClient()
  const { error } = declarer
    ? await db
        .from('inv_da_declarations')
        .upsert({ brand, trimestre, declared_by: user.id, declared_at: new Date().toISOString() })
    : await db.from('inv_da_declarations').delete().eq('brand', brand).eq('trimestre', trimestre)
  if (error) return { error: `Enregistrement impossible : ${error.message}` }
  await logAudit(null, {
    actorId: user.id,
    // Le journal ne connaît que quatre types : l'action se range sous l'admin.
    entityType: 'user',
    entityId: user.id,
    action: declarer ? 'declare_trimestre_da' : 'annule_declaration_da',
    payload: { brand, trimestre },
  })
  revalidatePath('/admin/droits-auteur')
  return { success: declarer ? `${trimestre} marqué déclaré.` : `${trimestre} repassé à déclarer.` }
}

const MAX_CSV = 2 * 1024 * 1024

/**
 * Importe l'historique tenu dans le tableur (CSV). Les valeurs sont reprises
 * telles quelles, rien n'est recalculé. Les lignes illisibles sont signalées
 * et non importées.
 */
export async function importerHistoriqueDA(_prev: DAResult, fd: FormData): Promise<DAResult> {
  const user = await requireRole('admin')
  const fichier = fd.get('file')
  if (!(fichier instanceof File) || fichier.size === 0) return { error: 'Choisissez le fichier CSV.' }
  if (fichier.size > MAX_CSV) return { error: 'Le fichier ne doit pas dépasser 2 Mo.' }
  if (!/\.(csv|txt)$/i.test(fichier.name)) return { error: 'Enregistrez le tableur en CSV (Fichier > Enregistrer sous > CSV).' }

  const { lignes, rejets } = lireHistoriqueCsv(await fichier.text())
  if (lignes.length === 0) {
    return { error: `Aucune ligne importée. ${rejets.slice(0, 5).map((r) => `Ligne ${r.ligne} : ${r.raison}`).join(' ')}` }
  }
  const brand = await activeBrandId()
  const importId = crypto.randomUUID()
  const db = createServiceClient()
  const { error } = await db.from('inv_da_historique').insert(
    lignes.map((l) => ({ ...l, brand, import_id: importId, fichier: fichier.name, imported_by: user.id }))
  )
  if (error) return { error: `Import impossible : ${error.message}` }
  await logAudit(null, {
    actorId: user.id,
    entityType: 'user',
    entityId: user.id,
    action: 'import_historique_da',
    payload: { import_id: importId, fichier: fichier.name, lignes: lignes.length, rejets: rejets.length },
  })
  revalidatePath('/admin/droits-auteur')
  const r = rejets.length
    ? ` ${rejets.length} ligne(s) non importée(s) : ${rejets.slice(0, 5).map((x) => `ligne ${x.ligne} (${x.raison})`).join(', ')}${rejets.length > 5 ? '…' : ''}`
    : ''
  return { success: `${lignes.length} ligne(s) importée(s) depuis ${fichier.name}.${r}` }
}

/** Retire un import (erreur de fichier) : ses lignes restent en base, marquées retirées. */
export async function retirerImportDA(_prev: DAResult, fd: FormData): Promise<DAResult> {
  const user = await requireRole('admin')
  const importId = String(fd.get('import_id') ?? '')
  if (!z.uuid().safeParse(importId).success) return { error: 'Import introuvable.' }
  const db = createServiceClient()
  const { error } = await db
    .from('inv_da_historique')
    .update({ retire_at: new Date().toISOString() })
    .eq('import_id', importId)
    .eq('brand', await activeBrandId())
    .is('retire_at', null)
  if (error) return { error: `Retrait impossible : ${error.message}` }
  await logAudit(null, { actorId: user.id, entityType: 'user', entityId: user.id, action: 'retire_import_historique_da', payload: { import_id: importId } })
  revalidatePath('/admin/droits-auteur')
  return { success: 'Import retiré.' }
}
