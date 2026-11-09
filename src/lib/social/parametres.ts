import { redirect } from 'next/navigation'
import { activeBrand, activeBrandId } from '@/lib/brand/actif'
import { requireUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'
import type { AppUser } from '@/lib/types'
import { completerCalendrier, type CalendrierSocial } from './calendrier'
import { VARIABLES, type VariableSilae } from './types'

/**
 * Les réglages de l'Espace Social, par école, modifiables dans l'admin.
 *
 * Les codes Silae proposés sont ceux que Net Paye a déjà transmis (codes
 * d'absences du 2 novembre) : congés payés 300, congé sans solde 632,
 * maladie non professionnelle 100. Les autres (transport, heures sup,
 * mutuelle, net vacataires) restent vides tant que Nicolas ne les a pas
 * donnés : l'export les laisse vides et le signale.
 */
export type CodesSilae = Record<VariableSilae, string>

export const CODES_DEFAUT: CodesSilae = {
  conges_payes: '300',
  sans_solde: '632',
  arret_maladie: '100',
  heures_sup: '',
  transport: '',
  mutuelle_dispense: '',
  mutuelle_changement: '',
  net_vacataire: '',
}

export interface ParametresSocial {
  calendrier: CalendrierSocial
  codes: CodesSilae
  /** Les adresses de qui gère la paie (en plus des administrateurs). */
  equipe: string[]
  /** Qui reçoit le fichier chez Net Paye. Vide : l'envoi ne part pas. */
  netpayeEmail: string
  netpayeNom: string
}

export async function lireParametres(): Promise<ParametresSocial> {
  const marque = await activeBrand()
  const { data } = await createServiceClient()
    .from('inv_social_settings')
    .select('*')
    .eq('brand', marque.id)
    .maybeSingle()
  const codes = { ...CODES_DEFAUT, ...((data?.codes as Partial<CodesSilae> | undefined) ?? {}) }
  for (const v of VARIABLES) codes[v.cle] = String(codes[v.cle] ?? '').trim()
  const equipe = ((data?.equipe as string[] | undefined) ?? []).filter(Boolean)
  return {
    calendrier: completerCalendrier(data?.calendrier),
    codes,
    // Tant que personne n'a réglé l'équipe, c'est l'interlocutrice paie de
    // l'école (Shirel pour Diploma) qui la compose.
    equipe: equipe.length ? equipe : marque.payrollContact ? [marque.payrollContact.email] : [],
    netpayeEmail: (data?.netpaye_email as string | null) ?? '',
    netpayeNom: (data?.netpaye_nom as string | null) ?? 'Net Paye',
  }
}

export async function ecrireParametres(p: Partial<ParametresSocial>, par: string): Promise<string | null> {
  const ligne: Record<string, unknown> = {
    brand: await activeBrandId(),
    updated_at: new Date().toISOString(),
    updated_by: par,
  }
  if (p.calendrier) ligne.calendrier = p.calendrier
  if (p.codes) ligne.codes = p.codes
  if (p.equipe) ligne.equipe = p.equipe
  if (p.netpayeEmail !== undefined) ligne.netpaye_email = p.netpayeEmail || null
  if (p.netpayeNom !== undefined) ligne.netpaye_nom = p.netpayeNom || null
  const { error } = await createServiceClient().from('inv_social_settings').upsert(ligne, { onConflict: 'brand' })
  return error ? error.message : null
}

/** Cette personne gère-t-elle la paie ? Les administrateurs, et l'équipe réglée. */
export async function gereLeSocial(user: Pick<AppUser, 'role' | 'email'>): Promise<boolean> {
  if (user.role === 'admin') return true
  if (user.role !== 'manager') return false
  const { equipe } = await lireParametres()
  return equipe.map((e) => e.toLowerCase()).includes(user.email.toLowerCase())
}

/** Garde des pages de l'Espace Social côté gestion. */
export async function requireEquipeSocial(): Promise<AppUser> {
  const user = await requireUser()
  if (!(await gereLeSocial(user))) redirect('/')
  return user
}
