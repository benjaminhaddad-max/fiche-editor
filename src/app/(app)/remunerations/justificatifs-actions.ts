'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { deposer, rapprocherEnAttente } from '@/lib/justificatifs/rapprochement'
import { calculerEtat } from '@/lib/justificatifs/etat'
import { ecrireReglages } from '@/lib/justificatifs/reglages'

export interface ResultatJustificatif {
  ok: boolean
  message: string
}

/** Le clic « Rattacher » : le reçu part dans Pennylane, sur ce mouvement-là. */
export async function rattacherJustificatif(
  _: ResultatJustificatif | null,
  fd: FormData
): Promise<ResultatJustificatif> {
  const user = await requireRole('admin')
  const id = String(fd.get('id') ?? '')
  const transaction = Number(fd.get('transaction_id'))
  if (!id || !Number.isFinite(transaction) || transaction <= 0) return { ok: false, message: 'Mouvement manquant.' }
  const r = await deposer(id, transaction, user.id)
  if (r.ok) {
    await logAudit(null, {
      actorId: user.id,
      entityType: 'user',
      entityId: id,
      action: 'justificatif_rattache',
      payload: { transaction },
    })
  }
  revalidatePath('/remunerations')
  return r.ok ? { ok: true, message: 'Rattaché dans Pennylane.' } : { ok: false, message: r.error ?? 'Échec.' }
}

/** Un reçu qui ne justifie rien d'ici (doublon, achat perso) sort de la liste. */
export async function ignorerJustificatif(fd: FormData): Promise<void> {
  await requireRole('admin')
  const id = String(fd.get('id') ?? '')
  if (!id) return
  await createServiceClient()
    .from('inv_justificatifs')
    .update({ statut: 'ignore' })
    .eq('id', id)
    .eq('brand', await activeBrandId())
    .eq('statut', 'a_rattacher')
  revalidatePath('/remunerations')
}

/** Relance la recherche pour tous les reçus en attente, même anciens. */
export async function rechercherMouvements(): Promise<void> {
  await requireRole('admin')
  const { data } = await createServiceClient()
    .from('inv_justificatifs')
    .select('id')
    .eq('brand', await activeBrandId())
    .eq('statut', 'a_rattacher')
  if (data?.length) await rapprocherEnAttente({ ids: data.map((d) => d.id) })
  revalidatePath('/remunerations')
}

export async function recalculerEtat(fd: FormData): Promise<void> {
  await requireRole('admin')
  const mois = String(fd.get('mois') ?? '')
  if (!/^\d{4}-\d{2}$/.test(mois)) return
  await calculerEtat(mois)
  revalidatePath('/remunerations')
}

export async function enregistrerReglagesJustificatifs(fd: FormData): Promise<void> {
  const user = await requireRole('admin')
  const destinataire = String(fd.get('destinataire') ?? '').trim()
  await ecrireReglages(
    {
      depotAuto: fd.get('depot_auto') === 'on',
      miroirPennylane: fd.get('miroir') === 'on',
      releveGmail: fd.get('releve_gmail') === 'on',
      envoiEtat: fd.get('envoi_etat') === 'on',
      destinataireEtat: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinataire) ? destinataire : '',
    },
    user.id
  )
  revalidatePath('/remunerations')
}
