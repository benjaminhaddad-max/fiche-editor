import { formatDate } from '@/lib/format'
import { estAuteur, isSalaried } from '@/lib/types'
import { nirFormate } from '@/lib/nir'
import { EMPLOYMENT_LABEL } from '@/lib/labels'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui/Page'
import { FicheFacturationForm } from '@/components/admin/FicheFacturationForm'
import { ProviderAdminForm } from '@/components/admin/ProviderAdminForm'
import { requireRole } from '@/lib/auth'
import { getManagers } from '@/lib/queries'
import { formaterIban, ibanValide } from '@/lib/iban'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Provider } from '@/lib/types'
import { updateProviderAdmin } from '../../actions'

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>
}) {
  const { providerId } = await params
  const me = await requireRole('manager', 'admin')
  const admin = me.role === 'admin'
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('inv_providers')
    .select('*, user:inv_users!inv_providers_user_id_fkey(full_name, email)')
    .eq('id', providerId)
    .maybeSingle()

  if (!data) notFound()
  const provider = data as Provider & { user: { full_name: string; email: string } | null }
  const managers = await getManagers()
  const auteur = estAuteur(provider.employment_type)
  const salarie = isSalaried(provider.employment_type)
  const facture = !auteur && !salarie

  const identity: [string, string | null][] = [
    // En tête, parce que c'est lui qu'on vient vérifier. Sans cette ligne,
    // on lisait « Forme juridique : Auto-entrepreneur » un peu plus bas et
    // on croyait que le statut était retombé dessus.
    ['Statut', EMPLOYMENT_LABEL[provider.employment_type] ?? provider.employment_type],
    // Ce qui ne concerne pas le statut ne s'affiche pas : un auteur n'a ni
    // SIRET ni TVA, et les voir marqués « non renseigné » en orange laissait
    // croire qu'il manquait quelque chose pour le payer.
    ...(facture
      ? ([
          ['Forme juridique', provider.legal_form],
          ['SIRET', provider.siret],
          ['N° TVA', provider.vat_number],
          [
            'Régime TVA',
            provider.vat_regime === 'franchise'
              ? 'Sans TVA — franchise en base'
              : provider.vat_regime === 'exonere'
                ? 'Sans TVA — exonéré (formation professionnelle)'
                : 'Assujetti 20 %',
          ],
        ] as [string, string | null][])
      : []),
    ...(auteur || salarie
      ? ([
          ['Date de naissance', provider.birth_date ? formatDate(provider.birth_date) : null],
          ['N° de sécurité sociale', provider.social_security_number ? nirFormate(provider.social_security_number) : null],
        ] as [string, string | null][])
      : []),
    [
      'Adresse',
      [provider.address_line1, provider.postal_code, provider.city]
        .filter(Boolean)
        .join(', ') || null,
    ],
    [
      'IBAN',
      provider.iban
        ? `${formaterIban(provider.iban)}${ibanValide(provider.iban) ? '' : ' — clé de contrôle fausse, à faire corriger'}`
        : null,
    ],
    ['Téléphone', provider.phone],
  ]

  return (
    <>
      <Link
        href="/admin/equipe"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-navy"
      >
        <ArrowLeft size={15} />
        Équipe
      </Link>

      <PageHeader
        title={provider.legal_name}
        description={
          provider.user
            ? `${provider.user.full_name} · ${provider.user.email}`
            : `Fournisseur sans compte${provider.contact_email ? ` · ${provider.contact_email}` : ''}`
        }
      />

      <Card className="mb-6 p-6">
        <h2 className="mb-1 text-sm font-semibold text-navy">Fiche de facturation</h2>
        <p className="mb-4 text-xs text-muted">
          Renseignée par la personne elle-même. Corrigez-la ici quand elle n’y arrive pas.
        </p>
        <FicheFacturationForm provider={provider} admin={admin} email={provider.user?.email ?? null} />
      </Card>

      <Card className="mb-6 p-6">
        <h2 className="mb-4 text-sm font-semibold text-navy">Ce qui est enregistré aujourd’hui</h2>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {identity.map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-32 shrink-0 text-muted">{label}</dt>
              <dd
                className={
                  !value || (label === 'IBAN' && !ibanValide(provider.iban)) ? 'text-amber-600' : 'text-navy'
                }
              >
                {value ?? 'non renseigné'}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Préfixe de facture, identifiant Pennylane, statut : c'est le
          paramétrage comptable, il reste à l'administration. */}
      {admin && <ProviderAdminForm action={updateProviderAdmin} provider={provider} managers={managers} />}
    </>
  )
}
