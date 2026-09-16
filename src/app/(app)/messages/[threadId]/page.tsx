import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { ReplyForm } from '@/components/messages/MessageForms'
import { Card, PageHeader } from '@/components/ui/Page'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { clore, marquerLu } from '../actions'

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

export default async function ThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params
  const user = await requireUser()
  const supabase = await createServerSupabase()

  const { data: fil } = await supabase
    .from('inv_threads')
    .select(
      `id, subject, closed_at, statement_id,
       provider:inv_providers(legal_name),
       manager:inv_users!inv_threads_manager_id_fkey(full_name)`
    )
    .eq('id', threadId)
    .maybeSingle()
  if (!fil) notFound()

  const { data: messages } = await supabase
    .from('inv_messages')
    .select('id, body, created_at, author_id, author:inv_users!inv_messages_author_id_fkey(full_name, role)')
    .eq('thread_id', threadId)
    .order('created_at')

  await marquerLu(threadId)

  const f = fil as unknown as {
    id: string
    subject: string
    closed_at: string | null
    statement_id: string | null
    provider: { legal_name: string } | null
    manager: { full_name: string } | null
  }
  const liste = (messages ?? []) as unknown as {
    id: string
    body: string
    created_at: string
    author_id: string
    author: { full_name: string; role: string } | null
  }[]

  return (
    <>
      <Link href="/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy">
        <ArrowLeft size={15} />
        Messages
      </Link>
      <PageHeader
        title={f.subject}
        description={`${f.provider?.legal_name ?? '—'} · ${f.manager?.full_name ?? '—'}${f.closed_at ? ' · résolu' : ''}`}
        actions={
          !f.closed_at ? (
            <form action={clore}>
              <input type="hidden" name="thread_id" value={f.id} />
              <SubmitButton variant="secondary" size="sm" pendingLabel="…">
                Marquer comme résolu
              </SubmitButton>
            </form>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        {liste.map((m) => {
          const moi = m.author_id === user.id
          return (
            <div key={m.id} className={clsx('flex', moi ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[75%] rounded-xl px-4 py-3 text-sm',
                  moi ? 'bg-navy text-cream' : 'border border-line bg-white text-navy'
                )}
              >
                <p className={clsx('mb-1 text-xs', moi ? 'text-cream/70' : 'text-muted')}>
                  {moi ? 'Vous' : m.author?.full_name} · {HEURE.format(new Date(m.created_at))}
                </p>
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      <Card className="p-4">
        <ReplyForm threadId={f.id} />
      </Card>
    </>
  )
}
