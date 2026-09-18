'use server'

import { headers } from 'next/headers'
import { logAudit } from '@/lib/audit'
import type { CorpsContrat } from '@/lib/contracts/modeles'
import { preuve, rangerPdf, reference } from '@/lib/contracts/signature'
import { deliver } from '@/lib/email/notify'
import { templates } from '@/lib/email/templates'
import { createServiceClient } from '@/lib/supabase/service'

export interface SignatureResult {
  error?: string
  signed?: boolean
}

/**
 * Signature en ligne d'un contrat.
 *
 * La valeur de cette signature tient au faisceau de preuves conservé : le
 * lien personnel reçu par email, le nom saisi, l'horodatage, l'adresse IP,
 * et l'empreinte du PDF signé. Tout est écrit en base et imprimé sur le
 * document lui-même.
 */
export async function signerContrat(_prev: SignatureResult, fd: FormData): Promise<SignatureResult> {
  const jeton = String(fd.get('token') ?? '')
  const nom = String(fd.get('nom') ?? '').trim()
  const accepte = fd.get('accepte') === 'on'
  if (!jeton) return { error: 'Lien invalide.' }
  if (nom.length < 3) return { error: 'Écrivez votre nom et votre prénom.' }
  if (!accepte) return { error: 'Cochez la case pour signer.' }

  const db = createServiceClient()
  const { data: c } = await db
    .from('inv_coaching_contracts')
    .select('id, provider_id, title, body, signed_at, manager_id, provider:inv_providers(legal_name, user:inv_users!inv_providers_user_id_fkey(id, full_name, email))')
    .eq('signature_token', jeton)
    .maybeSingle()
  if (!c) return { error: 'Ce lien n’est plus valable.' }
  if (c.signed_at) return { error: 'Ce contrat est déjà signé.', signed: true }

  const corps = c.body as CorpsContrat | null
  if (!corps) return { error: 'Ce contrat est indisponible. Prévenez votre interlocuteur.' }

  const entetes = await headers()
  const ip = (entetes.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const agent = entetes.get('user-agent')?.slice(0, 300) ?? null
  const signataire = (c as unknown as {
    provider: { legal_name: string; user: { id: string; full_name: string; email: string } | null } | null
  }).provider
  const email = signataire?.user?.email ?? ''

  const signature = preuve(nom, email, ip, c.id)
  const { empreinte } = await rangerPdf(c.provider_id, c.id, corps, signature)

  const { data: maj } = await db
    .from('inv_coaching_contracts')
    .update({
      signed_at: new Date().toISOString(),
      signer_name: nom,
      signer_email: email,
      signer_ip: ip,
      signer_agent: agent,
      document_hash: empreinte,
      // Le lien ne doit plus servir une fois le contrat signé.
      signature_token: null,
    })
    .eq('id', c.id)
    .is('signed_at', null)
    .select('id')
  if (!maj?.length) return { error: 'Ce contrat vient d’être signé.', signed: true }

  const app = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  if (signataire?.user) {
    await deliver({
      to: { email, name: signataire.user.full_name },
      ...templates.contractSigned({
        name: signataire.user.full_name,
        signerName: nom,
        intitule: corps.intitule,
        date: signature.date,
        reference: reference(c.id),
        forSigner: true,
        link: `${app}/contrats`,
      }),
      template: 'contract_signed',
      entityType: 'provider',
      entityId: c.id,
      providerId: c.provider_id,
    })
  }

  // Le manager qui l'a envoyé, et l'administration.
  const { data: equipe } = await db
    .from('inv_users')
    .select('id, email, full_name, role')
    .or(`id.eq.${c.manager_id},role.eq.admin`)
    .eq('is_active', true)
  for (const u of equipe ?? []) {
    await deliver({
      to: { email: u.email, name: u.full_name },
      ...templates.contractSigned({
        name: u.full_name,
        signerName: signataire?.user?.full_name ?? nom,
        intitule: corps.intitule,
        date: signature.date,
        reference: reference(c.id),
        forSigner: false,
        link: `${app}/admin/contrats`,
      }),
      template: 'contract_signed_notice',
      entityType: 'provider',
      entityId: c.id,
      providerId: c.provider_id,
    })
  }

  await logAudit(null, {
    actorId: signataire?.user?.id ?? c.manager_id,
    entityType: 'provider',
    entityId: c.id,
    action: 'contrat_signe',
    payload: { nom, ip, empreinte },
  })

  return { signed: true }
}
