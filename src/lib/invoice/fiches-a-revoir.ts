import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { alertesFicheDA, manquesFicheDA, statutCalcule, type Alerte, type FicheDA } from '@/lib/invoice/fiche-da'
import { modeleEffectif } from '@/lib/invoice/net-auteur'

export interface FicheARevoir {
  id: string
  nom: string
  statut: 'complete' | 'incomplete' | 'a_valider'
  modele: number
  manques: string[]
  alertes: Alerte[]
}

/**
 * Les auteurs dont la fiche demande une action : ce qui manque, les
 * justificatifs qui expirent, les A1 qui se terminent. Lecture seule.
 */
export async function fichesAuteursARevoir(): Promise<FicheARevoir[]> {
  const db = createServiceClient()
  const { data: auteurs } = await db
    .from('inv_providers')
    .select(
      'id, legal_name, social_security_number, address_line1, postal_code, city, country, iban, tax_residence_country, da_model, a1_number, a1_issuer, a1_start, a1_end, da_profile_status'
    )
    .eq('brand', await activeBrandId())
    .eq('employment_type', 'droits_auteur')
    .order('legal_name')
  const liste = (auteurs ?? []) as (FicheDA & { id: string; legal_name: string })[]
  if (liste.length === 0) return []

  const { data: docs } = await db
    .from('inv_documents')
    .select('provider_id, kind, expires_at')
    .in('provider_id', liste.map((a) => a.id))
    .in('kind', ['residence_fiscale', 'a1'])
  const pieces = (docs ?? []) as { provider_id: string; kind: string; expires_at: string | null }[]

  return liste
    .map((a) => {
      const siennes = pieces.filter((p) => p.provider_id === a.id)
      return {
        id: a.id,
        nom: a.legal_name,
        statut: statutCalcule(a, siennes),
        modele: modeleEffectif(a).modele,
        manques: manquesFicheDA(a, siennes),
        alertes: alertesFicheDA(a, siennes),
      }
    })
    .filter((f) => f.manques.length > 0 || f.alertes.length > 0 || f.statut !== 'complete')
}
