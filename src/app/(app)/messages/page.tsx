import Link from 'next/link'
import { clsx } from 'clsx'
import { NewThreadForm } from '@/components/messages/MessageForms'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireUser } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { getActiveProviders, getManagers } from '@/lib/queries'
import { getThreads } from '@/lib/threads'

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ nouveau?: string; bordereau?: string; objet?: string }>
}) {
  const { nouveau, bordereau, objet } = await searchParams
  const user = await requireUser()
  const [fils, managers, providers] = await Promise.all([
    getThreads(user.id),
    getManagers(),
    user.role === 'prestataire' ? Promise.resolve([]) : getActiveProviders(),
  ])

  const ouverts = fils.filter((f) => !f.closed_at)
  const clos = fils.filter((f) => f.closed_at)
  const afficherFormulaire = nouveau !== undefined || fils.length === 0

  return (
    <>
      <PageHeader
        title="Messages"
        description={
          user.role === 'prestataire'
            ? 'Un souci sur une prestation, un bordereau ou une facture ? Écrivez directement au manager concerné.'
            : 'Vos échanges avec les prestataires. Chaque message du prestataire vous arrive aussi par email et SMS.'
        }
        actions={
          !afficherFormulaire ? (
            <Link
              href="/messages?nouveau"
              className="inline-flex items-center rounded-lg bg-navy px-4 py-2 text-sm font-medium text-cream hover:bg-navy-light"
            >
              Nouveau message
            </Link>
          ) : undefined
        }
      />

      {afficherFormulaire && (
        <Card className="mb-6 p-5">
          <NewThreadForm
            role={user.role}
            managers={managers}
            providers={providers}
            statementId={bordereau}
            defaultSubject={objet}
          />
        </Card>
      )}

      {fils.length === 0 ? (
        <EmptyState title="Aucune conversation" />
      ) : (
        [
          ['En cours', ouverts],
          ['Résolues', clos],
        ].map(([titre, liste]) =>
          (liste as typeof fils).length === 0 ? null : (
            <section key={titre as string} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-navy">{titre as string}</h2>
              <Card className="divide-y divide-line/60 overflow-hidden">
                {(liste as typeof fils).map((f) => (
                  <Link
                    key={f.id}
                    href={`/messages/${f.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-cream-muted"
                  >
                    <div className="min-w-0">
                      <p className={clsx('truncate text-sm text-navy', f.unread && 'font-semibold')}>
                        {f.unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-gold" />}
                        {f.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {user.role === 'prestataire'
                          ? `avec ${f.manager?.full_name ?? '—'}`
                          : `${f.provider?.legal_name ?? '—'}${user.role === 'admin' ? ` · ${f.manager?.full_name ?? ''}` : ''}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{formatDate(f.last_message_at)}</span>
                  </Link>
                ))}
              </Card>
            </section>
          )
        )
      )}
    </>
  )
}
