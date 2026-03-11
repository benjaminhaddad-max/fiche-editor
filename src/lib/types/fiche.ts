export interface FicheMetadata {
  annee: string
  faculte: string
  matiere: string
  numero: number
  titre: string
}

export interface Fiche extends FicheMetadata {
  id: string
  user_id: string
  content: Record<string, unknown>
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
}

export interface FicheListItem {
  id: string
  matiere: string
  numero: number
  titre: string
  status: 'draft' | 'published'
  updated_at: string
}

export interface FicheUser {
  id: string
  auth_id: string
  email: string
  name: string
  role: 'professor' | 'admin'
  created_at: string
}

export interface PlanItem {
  number: number
  title: string
  subtitle: string
}
