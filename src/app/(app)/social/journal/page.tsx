import { ongletsSocial } from '@/components/social/onglets'
import { Card, EmptyState, PageHeader } from '@/components/ui/Page'
import { createServiceClient } from '@/lib/supabase/service'
import { salaries } from '@/lib/social/donnees'
import { requireEquipeSocial } from '@/lib/social/parametres'

const ACTIONS: Record<string, string> = {
  social_saisie: 'a saisi ses éléments',
  social_correction: 'a corrigé',
  social_validation: 'a validé',
  social_renvoi: 'a renvoyé pour correction',
  social_relance: 'a relancé',
  social_envoi_netpaye: 'a envoyé à Net Paye',
  social_import_salaries: 'a importé la liste Silae',
  social_fiche: 'a modifié la fiche',
  social_acces: 'a envoyé l’accès',
  social_parametres: 'a changé les paramètres',
}

/** Qui a saisi, modifié, validé et envoyé quoi (§6). */
export default async function JournalSocialPage() {
  const user = await requireEquipeSocial()
  const fiches = await salaries()
  const noms = new Map(fiches.map((s) => [s.providerId, s.nom]))
  const { data } = await createServiceClient()
    .from('inv_audit_log')
    .select('entity_type, entity_id, action, payload, created_at, auteur:inv_users!inv_audit_log_actor_id_fkey(full_name)')
    .like('action', 'social_%')
    .order('created_at', { ascending: false })
    .limit(200)
  // Le journal est commun aux écoles : on ne garde que ce qui touche les salariés d'ici, et les gestes globaux.
  const lignes = ((data ?? []) as unknown as { entity_type: string; entity_id: string; action: string; payload: Record<string, unknown>; created_at: string; auteur: { full_name: string } | null }[]).filter(
    (j) => j.entity_type !== 'provider' || noms.has(j.entity_id)
  )
  return (
    <>
      <PageHeader title="Espace Social" description="Le journal : qui a saisi, modifié, validé et envoyé quoi." tabs={ongletsSocial(user.role === 'admin')} currentTab="journal" />
      {!lignes.length ? (
        <EmptyState title="Rien encore" />
      ) : (
        <Card className="divide-y divide-line/60 text-sm">
          {lignes.map((j, i) => (
            <div key={i} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
              <p className="text-navy">
                <strong>{j.auteur?.full_name ?? 'Automatique'}</strong> {ACTIONS[j.action] ?? j.action}
                {j.entity_type === 'provider' && noms.get(j.entity_id) ? ` — ${noms.get(j.entity_id)}` : ''}
                {typeof j.payload?.periode === 'string' ? ` · ${j.payload.periode}` : typeof j.payload?.mois === 'string' ? ` · ${j.payload.mois}` : ''}
              </p>
              <p className="text-xs text-muted">{new Date(j.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</p>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
