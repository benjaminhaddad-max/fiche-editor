import { createServiceClient } from '@/lib/supabase/service'
import type { Employment } from '@/lib/types'
import { activeBrandId } from '@/lib/brand/actif'

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
    .eq('brand', (await activeBrandId()))
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

  const identite = await ouvrirIdentite(db, email)
  if ('error' in identite) return { error: identite.error }

  const { data: user, error: userError } = await db
    .from('inv_users')
    .insert({
      auth_id: identite.authId,
      email,
      full_name: p.nom,
      role: 'prestataire',
      phone: p.telephone || null,
      brand: (await activeBrandId()),
    })
    .select('id')
    .single()
  // On ne supprime plus l'identité en cas d'échec : elle peut servir à une
  // autre école, et l'effacer couperait l'accès de quelqu'un ailleurs.
  if (userError || !user) return { error: `Création du profil impossible : ${userError?.message}` }

  const { data: fiche, error: ficheError } = await db
    .from('inv_providers')
    .insert({
      user_id: user.id,
      brand: (await activeBrandId()),
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

export interface MembreTrouve {
  userId: string
  cree: boolean
}

/**
 * Retrouve ou crée un membre de l'équipe — manager ou administration.
 *
 * Le pendant de `trouverOuCreerPrestataire`, sans fiche de facturation :
 * un manager ne facture rien. Nolwenn a ajouté sa responsable pédagogique
 * depuis « Ajouter quelqu'un », le seul endroit qu'elle avait trouvé, et
 * s'est retrouvée avec une prestataire : l'écran ne savait créer que ça.
 */
export async function trouverOuCreerMembre(
  db: Db,
  p: { nom: string; email: string; telephone?: string | null; role: 'manager' | 'admin' }
): Promise<MembreTrouve | { error: string }> {
  const email = p.email.trim().toLowerCase()
  const { data: existant } = await db
    .from('inv_users')
    .select('id, role, is_active')
    .eq('brand', await activeBrandId())
    .ilike('email', email)
    .maybeSingle()

  if (existant) {
    if (existant.role === 'prestataire') {
      return { error: 'Cet email appartient déjà à un prestataire. Changez son rôle depuis Équipe.' }
    }
    if (!existant.is_active) return { error: 'Ce compte est désactivé. Réactivez-le dans Équipe.' }
    return { userId: existant.id as string, cree: false }
  }

  const identite = await ouvrirIdentite(db, email)
  if ('error' in identite) return { error: identite.error }

  const { data: user, error: userError } = await db
    .from('inv_users')
    .insert({
      auth_id: identite.authId,
      email,
      full_name: p.nom,
      role: p.role,
      phone: p.telephone || null,
      brand: await activeBrandId(),
    })
    .select('id')
    .single()
  if (userError || !user) return { error: `Création du profil impossible : ${userError?.message}` }

  return { userId: user.id as string, cree: true }
}

/**
 * L'identité de connexion de cette adresse, si elle existe déjà.
 *
 * Les comptes d'authentification sont communs à toutes les écoles : une
 * personne qui travaille pour deux d'entre elles n'en a qu'un. Chercher
 * avant de créer évite l'échec « cette adresse existe déjà » sur quelqu'un
 * que l'école en cours ne voit pas — Meryeme dirige Linova et donne des
 * cours pour Diploma, Florine enseigne chez Diploma et rejoint Medibox.
 */
export async function identiteExistante(db: Db, email: string): Promise<string | null> {
  const cherche = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) return null
    const trouve = data.users.find((u) => (u.email ?? '').toLowerCase() === cherche)
    if (trouve) return trouve.id
    if (data.users.length < 200) return null
  }
  return null
}

/**
 * Crée l'identité de connexion, ou retrouve celle qui existe déjà.
 *
 * Renvoie l'identifiant d'authentification, partagé entre les écoles.
 */
export async function ouvrirIdentite(db: Db, email: string): Promise<{ authId: string } | { error: string }> {
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true })
  if (data?.user) return { authId: data.user.id }
  const deja = await identiteExistante(db, email)
  if (deja) return { authId: deja }
  return { error: `Création du compte impossible : ${error?.message ?? 'erreur inconnue'}` }
}
