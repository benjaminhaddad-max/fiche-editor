import { createServerSupabase } from '@/lib/supabase/server'

export interface ThreadRow {
  id: string
  subject: string
  last_message_at: string
  closed_at: string | null
  provider: { legal_name: string } | null
  manager: { full_name: string } | null
  unread: boolean
}

/** Fils visibles par la personne connectée (la sécurité en base filtre). */
export async function getThreads(userId: string): Promise<ThreadRow[]> {
  const supabase = await createServerSupabase()
  const [{ data: fils }, { data: lus }] = await Promise.all([
    supabase
      .from('inv_threads')
      .select(
        `id, subject, last_message_at, closed_at,
         provider:inv_providers(legal_name),
         manager:inv_users!inv_threads_manager_id_fkey(full_name)`
      )
      .order('last_message_at', { ascending: false })
      .limit(200),
    supabase.from('inv_thread_reads').select('thread_id, read_at').eq('user_id', userId),
  ])
  const lecture = new Map((lus ?? []).map((l) => [l.thread_id as string, l.read_at as string]))
  return ((fils ?? []) as unknown as Omit<ThreadRow, 'unread'>[]).map((f) => ({
    ...f,
    unread: !lecture.has(f.id) || (lecture.get(f.id) ?? '') < f.last_message_at,
  }))
}

/** Nombre de fils non lus, pour la pastille du menu. */
export async function countUnread(userId: string): Promise<number> {
  return (await getThreads(userId)).filter((t) => t.unread && !t.closed_at).length
}
