import { activeBrand } from '@/lib/brand/actif'
import { deliver } from '@/lib/email/notify'
import { sendSms } from '@/lib/email/sms'
import { templates } from '@/lib/email/templates'
import { formatDateLong } from '@/lib/format'
import { createServiceClient } from '@/lib/supabase/service'
import { etapes } from './calendrier'
import { tableauDuMois } from './donnees'
import { lireParametres } from './parametres'
import { aRepondu } from './saisie'
import type { GroupeSocial } from './types'

const libelleMois = (m: string) =>
  new Date(`${m}-15T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Demande ou relance les salariés qui n'ont pas répondu, par email et SMS
 * selon les canaux réglés. « Rien à signaler » compte comme une réponse :
 * ceux-là ne reçoivent plus rien.
 *
 * `seulement` restreint à quelques fiches (relance cochée par Shirel).
 */
export async function demanderElements(
  groupe: GroupeSocial,
  period: string,
  relance: boolean,
  seulement?: string[]
): Promise<{ envoyes: number; sansCompte: string[] }> {
  const { calendrier } = await lireParametres()
  const lignes = (await tableauDuMois(period, groupe)).filter(
    (l) => !aRepondu(l.saisie) && (!seulement || seulement.includes(l.salarie.providerId))
  )
  const cloture = etapes(groupe, period, calendrier).find((e) => e.cle === 'cloture')!
  const quand = `le ${formatDateLong(cloture.date)}${cloture.heure >= 24 ? ' au soir' : ` à ${cloture.heure} h`}`
  const label = libelleMois(period)
  const marque = await activeBrand()
  const app = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
  const db = createServiceClient()
  const sansCompte: string[] = []
  let envoyes = 0

  for (const l of lignes) {
    const s = l.salarie
    if (!s.email) {
      sansCompte.push(s.nom)
      continue
    }
    if (calendrier.email) {
      await deliver({
        to: { email: s.email, name: s.nom },
        ...(await templates()).socialDemande({ name: s.nom, label, cloture: quand, relance, vacataire: s.profil === 'vacataire' }),
        template: relance ? 'social_relance' : 'social_demande',
        entityType: 'provider',
        entityId: s.providerId,
        providerId: s.providerId,
      })
    }
    if (calendrier.sms) {
      await sendSms(
        s.telephone,
        `${marque.company.name} : ${relance ? 'il manque' : 'merci de renseigner'} vos éléments de paie de ${label}, avant ${quand}. ${app}/elements-paie`
      )
    }
    await db
      .from('inv_payroll_inputs')
      .upsert({ provider_id: s.providerId, period, reminded_at: new Date().toISOString() }, { onConflict: 'provider_id,period' })
    envoyes++
  }
  return { envoyes, sansCompte }
}
