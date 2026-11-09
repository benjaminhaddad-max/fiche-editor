import { activeBrandId } from '@/lib/brand/actif'
import { createServiceClient } from '@/lib/supabase/service'
import type { Employment } from '@/lib/types'
import { memePersonne, type LigneImport } from './fichier'
import { EMPLOI_DU_PROFIL, profilDeLEmploi, type ProfilSocial } from './types'

/**
 * Rattacher la liste des salariés de Silae aux fiches d'Invoice (§3).
 *
 * Silae est la source de vérité. Pour chaque matricule, dans l'ordre :
 *   1. une fiche porte déjà ce matricule → on la met à jour ;
 *   2. un compte a la même adresse → on rattache sa fiche (ou on lui en crée une) ;
 *   3. une seule fiche ou un seul compte porte le même nom → idem ;
 *   4. sinon → une fiche salarié est créée, sans compte (l'accès part ensuite).
 *
 * Deux garde-fous :
 *   - une fiche d'indépendant n'est jamais basculée en salarié : la
 *     personne perdrait ses factures. C'est signalé, Shirel tranche ;
 *   - une fiche d'Invoice absente de la liste n'est jamais supprimée :
 *     elle est signalée (§3 : « alerte, pas de suppression automatique »).
 */

export interface ResultatImport {
  mis_a_jour: string[]
  rattaches: string[]
  crees: string[]
  conflits: string[]
  absents_de_silae: string[]
  profil_a_verifier: string[]
}

interface Fiche {
  id: string
  user_id: string | null
  legal_name: string
  employment_type: Employment
  silae_matricule: string | null
  social_profile: ProfilSocial | null
  user: { full_name: string; email: string } | null
}

export async function importerSalaries(lignes: LigneImport[], appliquer: boolean): Promise<ResultatImport> {
  const db = createServiceClient()
  const brand = await activeBrandId()
  const [{ data: fiches }, { data: comptes }] = await Promise.all([
    db
      .from('inv_providers')
      .select(
        'id, user_id, legal_name, employment_type, silae_matricule, social_profile, user:inv_users!inv_providers_user_id_fkey(full_name, email)'
      )
      .eq('brand', brand),
    // Les comptes transverses (direction, « all ») comptent aussi : Ben est salarié de Diploma.
    db.from('inv_users').select('id, full_name, email, role, is_active').in('brand', [brand, 'all']).eq('is_active', true),
  ])
  const toutes = (fiches ?? []) as unknown as Fiche[]
  // Une fiche par compte, toutes écoles confondues (user_id est unique).
  const { data: liees } = await db.from('inv_providers').select('user_id').not('user_id', 'is', null)
  const avecFiche = new Set((liees ?? []).map((f) => f.user_id as string))
  const sansFiche = (comptes ?? []).filter((c) => !avecFiche.has(c.id as string)) as {
    id: string
    full_name: string
    email: string
    role: string
  }[]

  const r: ResultatImport = { mis_a_jour: [], rattaches: [], crees: [], conflits: [], absents_de_silae: [], profil_a_verifier: [] }
  const vus = new Set<string>()

  for (const l of lignes) {
    const nomFiche = (f: Fiche) => [f.legal_name, f.user?.full_name ?? ''].filter(Boolean)
    let fiche = toutes.find((f) => f.silae_matricule === l.matricule)
    let compte: (typeof sansFiche)[number] | undefined
    if (!fiche && l.email) {
      fiche = toutes.find((f) => f.user?.email?.toLowerCase() === l.email)
      if (!fiche) compte = sansFiche.find((c) => c.email.toLowerCase() === l.email)
    }
    if (!fiche && !compte) {
      const parNom = toutes.filter((f) => !f.silae_matricule && nomFiche(f).some((n) => memePersonne(n, l.nom)))
      const comptesParNom = sansFiche.filter((c) => memePersonne(c.full_name, l.nom))
      if (parNom.length + comptesParNom.length > 1) {
        r.conflits.push(`${l.nom} (${l.matricule}) : plusieurs fiches portent ce nom, à rattacher à la main.`)
        continue
      }
      fiche = parNom[0]
      compte = comptesParNom[0]
    }

    if (fiche) {
      vus.add(fiche.id)
      if (fiche.employment_type === 'independant' || fiche.employment_type === 'droits_auteur') {
        r.conflits.push(
          `${l.nom} (${l.matricule}) : sa fiche « ${fiche.legal_name} » est en ${fiche.employment_type === 'independant' ? 'indépendant' : 'droits d’auteur'} — elle n’est pas basculée en salarié.`
        )
        continue
      }
      const profil = l.profil ?? fiche.social_profile ?? profilDeLEmploi(fiche.employment_type) ?? 'fixe'
      if (!l.profil && !fiche.social_profile && !profilDeLEmploi(fiche.employment_type)) r.profil_a_verifier.push(l.nom)
      const maj: Record<string, unknown> = { silae_matricule: l.matricule, social_profile: profil }
      if (l.entree) maj.social_entry_date = l.entree
      if (l.sortie) maj.social_exit_date = l.sortie
      if (l.profil) maj.employment_type = EMPLOI_DU_PROFIL[l.profil]
      if (appliquer) {
        const { error } = await db.from('inv_providers').update(maj).eq('id', fiche.id)
        if (error) {
          r.conflits.push(`${l.nom} (${l.matricule}) : ${error.message}`)
          continue
        }
      }
      ;(fiche.silae_matricule === l.matricule ? r.mis_a_jour : r.rattaches).push(`${l.nom} → ${fiche.legal_name}`)
      continue
    }

    // Pas de fiche : on en crée une, rattachée au compte s'il existe (un
    // manager comme Ilan ou Jennifer est aussi salarié).
    const profil: ProfilSocial = l.profil ?? 'fixe'
    if (!l.profil) r.profil_a_verifier.push(l.nom)
    if (appliquer) {
      const { data, error } = await db
        .from('inv_providers')
        .insert({
          brand,
          user_id: compte?.id ?? null,
          legal_name: compte?.full_name ?? l.nom,
          contact_email: compte?.email ?? l.email,
          employment_type: EMPLOI_DU_PROFIL[profil],
          social_profile: profil,
          silae_matricule: l.matricule,
          social_entry_date: l.entree,
          social_exit_date: l.sortie,
        })
        .select('id')
        .single()
      if (error || !data) {
        r.conflits.push(`${l.nom} (${l.matricule}) : création impossible — ${error?.message}`)
        continue
      }
      vus.add(data.id as string)
    }
    ;(compte ? r.rattaches : r.crees).push(compte ? `${l.nom} → compte de ${compte.full_name}` : l.nom)
  }

  // Présent dans Invoice, absent de Silae : on le dit, on ne supprime rien.
  for (const f of toutes) {
    if (f.social_profile && !vus.has(f.id) && !lignes.some((l) => l.matricule === f.silae_matricule)) {
      r.absents_de_silae.push(f.user?.full_name ?? f.legal_name)
    }
  }
  return r
}
