import Link from 'next/link'
import { NewUserForm } from '@/components/admin/NewUserForm'
import { UsersTable, type EquipeRow } from '@/components/admin/UsersTable'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { money } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import type { AppUser, Employment } from '@/lib/types'
import { createUserAccount } from '../actions'

interface Fiche {
  id: string
  user_id: string | null
  legal_name: string
  employment_type: Employment
  onboarding_complete: boolean
  phone: string | null
  contact_email: string | null
  siret: string | null
  tags: string[]
}

export default async function EquipePage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; nouveau?: string }>
}) {
  const { onglet, nouveau } = await searchParams
  const me = await requireRole('manager', 'admin')
  const admin = me.role === 'admin'
  const db = createServiceClient()

  const [{ data: users }, { data: fiches }, { data: factures }] = await Promise.all([
    db.from('inv_users').select('*').order('full_name'),
    db.from('inv_providers').select('id, user_id, legal_name, employment_type, onboarding_complete, phone, contact_email, siret, tags'),
    db.from('inv_invoices').select('provider_id, total_ttc'),
  ])

  const parUser = new Map(((fiches ?? []) as Fiche[]).filter((f) => f.user_id).map((f) => [f.user_id!, f]))
  const rows: EquipeRow[] = ((users ?? []) as (AppUser & { phone: string | null })[]).map((u) => {
    const f = parUser.get(u.id)
    return {
      ...u,
      phone: u.role === 'prestataire' ? (f?.phone ?? u.phone) : u.phone,
      providerId: f?.id ?? null,
      employment: f?.employment_type ?? null,
      onboarding: f?.onboarding_complete,
      tags: f?.tags ?? [],
    }
  })
  const sansCompte = ((fiches ?? []) as Fiche[]).filter((f) => !f.user_id)
  const facture = new Map<string, number>()
  for (const i of factures ?? []) facture.set(i.provider_id, (facture.get(i.provider_id) ?? 0) + Number(i.total_ttc))

  const groupes = {
    prestataires: rows.filter((r) => r.is_active && r.role === 'prestataire' && r.employment !== 'vacataire' && r.employment !== 'alternant'),
    salaries: rows.filter((r) => r.is_active && r.role === 'prestataire' && (r.employment === 'vacataire' || r.employment === 'alternant')),
    equipe: rows.filter((r) => r.is_active && r.role !== 'prestataire'),
    desactives: rows.filter((r) => !r.is_active),
  }
  const ongletsOuverts = admin ? ['fournisseurs', ...Object.keys(groupes)] : ['prestataires', 'salaries', 'equipe']
  const courant = onglet && ongletsOuverts.includes(onglet) ? onglet : 'prestataires'
  // Tous les comptes actifs, pour pouvoir relancer au-delà de l'onglet ouvert.
  const actifs = rows.filter((r) => r.is_active && r.id !== me.id).map((r) => ({ id: r.id, full_name: r.full_name }))

  return (
    <>
      <PageHeader
        title="Équipe"
        description={
          admin
            ? 'Toutes les personnes : prestataires, salariés, managers, fournisseurs sans compte. Cochez plusieurs lignes pour inviter en une fois.'
            : 'Tous les prestataires de la plateforme, quel que soit leur pôle ou leur manager.'
        }
        actions={
          admin ? (
            <Link href={`/admin/equipe?onglet=${courant}&nouveau`} className="ds-header-action">
              Ajouter une personne
            </Link>
          ) : undefined
        }
        currentTab={courant!}
        tabs={[
          { key: 'prestataires', label: 'Prestataires', href: '/admin/equipe', count: groupes.prestataires.length },
          { key: 'salaries', label: 'Vacataires et alternants', href: '/admin/equipe?onglet=salaries', count: groupes.salaries.length },
          { key: 'equipe', label: 'Managers et admins', href: '/admin/equipe?onglet=equipe', count: groupes.equipe.length },
          // Les fournisseurs sans compte et les comptes fermés relèvent de
          // l'administration : un manager n'a rien à y faire.
          ...(admin
            ? [
                { key: 'fournisseurs', label: 'Fournisseurs sans compte', href: '/admin/equipe?onglet=fournisseurs', count: sansCompte.length },
                { key: 'desactives', label: 'Désactivés', href: '/admin/equipe?onglet=desactives' },
              ]
            : []),
        ]}
      />

      {admin && nouveau !== undefined && (
        <div className="mb-6">
          <NewUserForm action={createUserAccount} />
        </div>
      )}

      {courant === 'fournisseurs' ? (
        sansCompte.length === 0 ? (
          <EmptyState
            title="Aucun fournisseur sans compte"
            description="Ils sont créés automatiquement à partir des factures diverses déposées ou reçues par email."
          />
        ) : (
          <Card className="divide-y divide-line/60 overflow-hidden">
            {sansCompte.map((f) => (
              <Link key={f.id} href={`/admin/prestataires/${f.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-cream-muted">
                <span>
                  <span className="text-sm font-medium text-navy">{f.legal_name}</span>
                  <span className="block text-xs text-muted">
                    {[f.siret && `SIRET ${f.siret}`, f.contact_email].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
                <span className="text-sm text-navy/70">{money(facture.get(f.id) ?? 0)}</span>
              </Link>
            ))}
          </Card>
        )
      ) : groupes[courant as keyof typeof groupes].length === 0 ? (
        <EmptyState title="Personne ici" />
      ) : (
        <UsersTable users={groupes[courant as keyof typeof groupes]} meId={me.id} plateforme={admin ? actifs : []} admin={admin} />
      )}
    </>
  )
}
