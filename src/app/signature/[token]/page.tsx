import { notFound } from 'next/navigation'
import { Logo } from '@/components/ui/Logo'
import { SignatureForm } from '@/components/contracts/SignatureForm'
import type { CorpsContrat } from '@/lib/contracts/modeles'
import { formatDateLong } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'

export const metadata = { title: 'Signer mon contrat — Diploma Invoice' }

/**
 * Page publique de signature : la personne arrive par le lien reçu, sans
 * compte ni mot de passe. C'est le jeton du lien qui fait l'authentification.
 */
export default async function SignaturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createServiceClient()
  const { data } = await db
    .from('inv_coaching_contracts')
    .select('id, title, body, start_date, end_date, signed_at, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(full_name))')
    .eq('signature_token', token)
    .maybeSingle()

  if (!data) notFound()
  const corps = data.body as CorpsContrat | null
  const nom =
    (data as unknown as { provider: { legal_name: string; user: { full_name: string } | null } | null }).provider?.user
      ?.full_name ?? ''

  return (
    <div className="min-h-screen bg-cream px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Logo className="justify-center" />
          <p className="mt-3 text-sm text-muted">Signature de votre contrat</p>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(14,30,53,0.06)]">
          <h1 className="font-display text-xl font-semibold text-navy">{corps?.intitule ?? data.title}</h1>
          <p className="mt-1 text-sm text-muted">
            Prend effet le {formatDateLong(data.start_date)}
            {data.end_date ? `, jusqu’au ${formatDateLong(data.end_date)}` : ''}.
          </p>

          {corps && (
            <ul className="mt-4 flex flex-col gap-1.5 rounded-lg bg-cream-muted px-4 py-3 text-sm text-navy/80">
              {corps.resume.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          )}

          <a
            href={`/api/signature/${token}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-navy hover:bg-cream-muted"
          >
            Lire le contrat en entier (PDF)
          </a>

          <div className="mt-6 border-t border-line pt-6">
            <SignatureForm token={token} nom={nom} dejaSigne={Boolean(data.signed_at)} />
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          En signant, vous acceptez l’ensemble des articles du contrat. Votre nom, la date, l’heure et votre adresse
          IP sont conservés comme preuve de signature, et imprimés sur le document.
        </p>
      </div>
    </div>
  )
}
