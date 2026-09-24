import Anthropic from '@anthropic-ai/sdk'

export interface Encadrant {
  id: string
  email: string
  full_name: string
}

export interface Identification {
  auteur: Encadrant | null
  /** Comment on l'a retrouvé. Vide si on ne l'a pas retrouvé. */
  via: 'adresse' | 'ia' | null
  /** Ce que l'IA a compris, pour l'écrire dans le journal. */
  raison?: string
}

/**
 * Qui a envoyé cette facture sur la boîte de dépôt ?
 *
 * D'abord l'évidence : l'adresse d'expédition est celle d'un manager. Sinon
 * on demande au modèle de rapprocher — une adresse personnelle, un message
 * transféré, un nom dans l'objet. Il ne tranche que s'il est sûr : dans le
 * doute la facture attend d'être rattachée à la main, ce qui vaut mieux que
 * de l'attribuer au mauvais pôle.
 */
export async function identifierExpediteur(
  adresses: string[],
  sujet: string | null,
  equipe: Encadrant[]
): Promise<Identification> {
  const normalisees = adresses.map((a) => a.toLowerCase().trim()).filter(Boolean)

  const exact = equipe.find((u) => normalisees.includes(u.email.toLowerCase()))
  if (exact) return { auteur: exact, via: 'adresse' }
  if (!normalisees.length || !equipe.length) return { auteur: null, via: null }
  if (!process.env.ANTHROPIC_API_KEY) return { auteur: null, via: null }

  try {
    const res = await new Anthropic().messages.create({
      // Un rapprochement de noms : le modèle rapide suffit.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              email: { type: 'string', description: 'Email du manager reconnu, ou chaîne vide si aucun.' },
              certain: { type: 'boolean', description: 'Vrai seulement si le rapprochement ne fait aucun doute.' },
              raison: { type: 'string' },
            },
            required: ['email', 'certain', 'raison'],
          },
        },
      },
      messages: [
        {
          role: 'user',
          content:
            'Une facture est arrivée sur la boîte de dépôt de la société. ' +
            'Dis-moi lequel de ses managers l’a envoyée, si c’est certain.\n\n' +
            `Adresses d’expédition : ${normalisees.join(', ')}\n` +
            `Objet du message : ${sujet ?? '(sans objet)'}\n\n` +
            'Managers de la société :\n' +
            equipe.map((u) => `- ${u.full_name} <${u.email}>`).join('\n') +
            '\n\nUn prénom et un nom qui correspondent dans l’adresse personnelle suffisent. ' +
            'Une simple appartenance au même domaine ne suffit pas. ' +
            'Dans le doute, renvoie une chaîne vide et certain = false : ' +
            'mieux vaut un rattachement à la main qu’une facture imputée au mauvais pôle.',
        },
      ],
    })

    const bloc = res.content.find((b) => b.type === 'text')
    if (!bloc || bloc.type !== 'text') return { auteur: null, via: null }
    const r = JSON.parse(bloc.text) as { email: string; certain: boolean; raison: string }
    if (!r.certain || !r.email) return { auteur: null, via: null, raison: r.raison }

    const trouve = equipe.find((u) => u.email.toLowerCase() === r.email.toLowerCase())
    return trouve ? { auteur: trouve, via: 'ia', raison: r.raison } : { auteur: null, via: null, raison: r.raison }
  } catch (err) {
    console.error('[depotfactures] rapprochement', err)
    return { auteur: null, via: null }
  }
}
