import { createHash, randomBytes } from 'node:crypto'
import { modele, type CorpsContrat, type Parametres } from '@/lib/contracts/modeles'
import { renderContratPdf, type Signature } from '@/lib/contracts/pdf'
import { INVOICE_BUCKET } from '@/lib/invoice/store'
import { createServiceClient } from '@/lib/supabase/service'

const HORODATAGE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

export const cheminContrat = (providerId: string, contractId: string) =>
  `${providerId}/contrat-${contractId}.pdf`

/** Référence courte, imprimée sur le PDF et conservée en base. */
export const reference = (contractId: string) => contractId.slice(0, 8).toUpperCase()

export function nouveauJeton(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Construit le texte du contrat à partir du modèle et des informations de la
 * personne, puis le fige : c'est cette version qui sera signée.
 */
export function composer(profil: string, p: Parametres): CorpsContrat | null {
  return modele(profil)?.corps(p) ?? null
}

/** Produit le PDF et le range. Renvoie son empreinte. */
export async function rangerPdf(
  providerId: string,
  contractId: string,
  corps: CorpsContrat,
  signature: Signature | null
): Promise<{ chemin: string; empreinte: string }> {
  const pdf = await renderContratPdf(corps, signature)
  const chemin = cheminContrat(providerId, contractId)
  const db = createServiceClient()
  const { error } = await db.storage
    .from(INVOICE_BUCKET)
    .upload(chemin, pdf, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Stockage du contrat impossible : ${error.message}`)
  await db.from('inv_coaching_contracts').update({ document_path: chemin }).eq('id', contractId)
  return { chemin, empreinte: createHash('sha256').update(pdf).digest('hex') }
}

export function preuve(nom: string, email: string, ip: string | null, contractId: string): Signature {
  return {
    nom,
    email,
    date: HORODATAGE.format(new Date()),
    ip,
    reference: reference(contractId),
  }
}
