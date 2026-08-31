import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Trace une action de validation. Best-effort : on ne fait jamais echouer
 * une validation metier parce que le journal n'a pas pu s'ecrire.
 */
export async function logAudit(
  supabase: SupabaseClient,
  entry: {
    actorId: string
    entityType: 'mission' | 'invoice' | 'provider' | 'user'
    entityId: string
    action: string
    payload?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from('inv_audit_log').insert({
    actor_id: entry.actorId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    payload: entry.payload ?? {},
  })
  if (error) console.error('[audit]', entry.action, error.message)
}
