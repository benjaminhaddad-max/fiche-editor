import { createServiceClient } from '@/lib/supabase/service'
import type { Employment } from '@/lib/types'

type Db = ReturnType<typeof createServiceClient>

export interface NouvellePersonne {
  nom: string
  email: string
  telephone?: string | null
  employment?: Employment
}

export interface Trouvee {
  providerId: string
  userId: string
  cree: boolean
}

/**
 * Retrouve une personne par son email, ou lui crée un compte prestataire
 * sans mot de passe : elle le choisira en ouvrant le lien qu'on lui envoie.
 *
 * Partagé par les bons de mission et les contrats : dans les deux cas, on
 * part de quelqu'un qui n'est pas encore inscrit.
 */
export async function trouverOuCreerPrestataire(
  db: Db,
  p: NouvellePersonne
): Promise<Trouvee | { error: string }> {
  const email = p.email.trim().toLowerCase()
  const { data: existant } = await db
    .from('inv_users')
    .select('id, role, is_active, provider:inv_providers!inv_providers_user_id_fkey(id)')
    .ilike('email', email)
    .maybeSingle()

  if (existant) {
    const fiche = (existant as unknown as { provider: { id: string }[] | { id: string } | null }).provider
    const id = Array.isArray(fiche) ? fiche[0]?.id : fiche?.id
    if (existant.role !== 'prestataire' || !id) return { error: 'Cet email appartient à un membre de l’équipe.' }
    if (!existant.is_active) return { error: 'Cette personne est désactivée. Réactivez-la dans Équipe.' }
    if (p.employment) await db.from('inv_providers').update({ employment_type: p.employment }).eq('id', id)
    return { providerId: id, userId: existant.id, cree: false }
  }

  const { data: auth, error: authError } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (authError || !auth.user) return { error: `Création du compte impossible : ${authError?.message}` }

  const { data: user, error: userError } = await db
    .from('inv_users')
    .insert({ auth_id: auth.user.id, email, full_name: p.nom, role: 'prestataire', phone: p.telephone || null })
    .select('id')
    .single()
  if (userError || !user) {
    await db.auth.admin.deleteUser(auth.user.id)
    return { error: `Création du profil impossible : ${userError?.message}` }
  }

  const { data: fiche, error: ficheError } = await db
    .from('inv_providers')
    .insert({
      user_id: user.id,
      legal_name: p.nom,
      invoice_prefix: 'FACT',
      phone: p.telephone || null,
      employment_type: p.employment ?? 'independant',
    })
    .select('id')
    .single()
  if (ficheError || !fiche) return { error: `Création de la fiche impossible : ${ficheError?.message}` }

  return { providerId: fiche.id, userId: user.id, cree: true }
}
