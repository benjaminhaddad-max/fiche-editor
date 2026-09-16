import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Trace une action. Best-effort : on ne fait jamais echouer une action
 * metier parce que le journal n'a pas pu s'ecrire.
 *
 * L'ecriture passe par la cle de service, quel que soit le client fourni :
 * la securite en base refuse l'insertion aux prestataires, et la creation
 * comme l'envoi de leurs factures disparaissaient du journal sans bruit.
 * L'auteur, lui, vient toujours d'un controle serveur (requireRole,
 * requireProvider) — jamais d'une saisie.
 */
export async function logAudit(
  _supabase: SupabaseClient | null,
  entry: {
    actorId: string
    entityType: 'mission' | 'invoice' | 'provider' | 'user'
    entityId: string
    action: string
    payload?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await createServiceClient().from('inv_audit_log').insert({
    actor_id: entry.actorId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    payload: entry.payload ?? {},
  })
  if (error) console.error('[audit]', entry.action, error.message)
}
