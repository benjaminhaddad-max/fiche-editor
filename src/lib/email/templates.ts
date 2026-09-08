import { formatDate, money } from '@/lib/format'
import { COMPANY } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
const INVITATION_DAYS = Number(process.env.INVITATION_DAYS ?? 30)

/** Enveloppe HTML commune : sobre, lisible dans tous les clients mail. */
function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f7f4ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5ddc8;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td style="padding:24px 28px 0;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#a8892e;letter-spacing:.3px;">DIPLOMA INVOICE</p>
          <h1 style="margin:8px 0 0;font-size:19px;line-height:1.35;color:#0e1e35;">${title}</h1>
        </td></tr>
        <tr><td style="padding:16px 28px 4px;font-size:14px;line-height:1.65;color:#3b4c63;">
          ${body}
        </td></tr>
        ${
          cta
            ? `<tr><td style="padding:12px 28px 24px;">
                 <a href="${cta.href}" style="display:inline-block;background:#0e1e35;color:#ffffff;
                    text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px;">
                   ${cta.label}</a>
               </td></tr>`
            : '<tr><td style="height:16px"></td></tr>'
        }
        <tr><td style="padding:16px 28px 22px;border-top:1px solid #e5ddc8;font-size:12px;color:#a89e8a;">
          ${COMPANY.name} — message automatique, merci de ne pas y répondre directement.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Un renvoi de lien ne doit surtout pas porter le même objet que le
 * précédent : les messageries regroupent les objets identiques dans un seul
 * fil, et la personne rouvre alors le plus ancien — donc un lien mort. Les
 * relevés Brevo l'ont montré noir sur blanc : trois invitations le même jour,
 * seule la première ouverte. On date donc l'objet.
 */
function sujetInvitation(renewed?: boolean): string {
  if (!renewed) return 'Créez votre accès à Diploma Invoice'
  const jour = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(new Date())
  return `Votre nouveau lien Diploma Invoice — ${jour}`
}

/** Dire explicitement que les anciens messages sont périmés. */
function avertissementRemplacement(renewed?: boolean): string {
  if (!renewed) return ''
  return `<p style="margin:0 0 12px;padding:10px 12px;background:#fdf7e6;border:1px solid #e5ddc8;
     border-radius:8px;font-size:13px;color:#6b5b2a;"><strong>Utilisez ce message-ci.</strong>
     Les liens des emails précédents ne fonctionnent plus.</p>`
}

export const templates = {
  /**
   * Première prise de contact. Le message change selon le rôle : un
   * prestataire vient facturer, un manager vient contrôler. Leur envoyer le
   * même texte les perdrait tous les deux.
   */
  invitation: (p: { fullName: string; link: string; renewed?: boolean }) => ({
    subject: sujetInvitation(p.renewed),
    html: layout(
      p.renewed ? 'Voici votre nouveau lien d’accès' : 'Votre espace de facturation est prêt',
      `<p style="margin:0 0 12px;">Bonjour ${p.fullName},</p>
       ${avertissementRemplacement(p.renewed)}
       <p style="margin:0 0 12px;">${COMPANY.name} met à votre disposition un espace pour
          suivre vos prestations et transmettre vos factures.</p>
       <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.
          Vous compléterez ensuite vos informations de facturation — raison sociale, SIRET,
          adresse et IBAN — nécessaires pour être réglé.</p>
       <p style="margin:0;color:#7d8c9e;font-size:13px;">Ce lien est personnel, ne fonctionne
          qu'une fois, et reste valable ${INVITATION_DAYS} jours.</p>`,
      { label: p.renewed ? 'Ouvrir mon espace' : 'Créer mon accès', href: p.link }
    ),
  }),

  invitationStaff: (p: {
    fullName: string
    link: string
    isAdmin: boolean
    renewed?: boolean
  }) => ({
    subject: sujetInvitation(p.renewed),
    html: layout(
      p.renewed
        ? 'Voici votre nouveau lien d’accès'
        : p.isAdmin
          ? 'Votre espace d’administration est prêt'
          : 'Votre espace de validation est prêt',
      `<p style="margin:0 0 12px;">Bonjour ${p.fullName},</p>
       ${avertissementRemplacement(p.renewed)}
       <p style="margin:0 0 12px;">${COMPANY.name} centralise désormais les prestations des
          intervenants et leur facturation sur une seule plateforme.</p>
       <p style="margin:0 0 12px;">${
         p.isAdmin
           ? 'Vous y validez les prestations, suivez les factures reçues et pilotez les contrats.'
           : 'Vous y retrouvez les prestations des intervenants que vous avez sollicités, pour les valider ou les refuser avant facturation.'
       }</p>
       <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.</p>
       <p style="margin:0;color:#7d8c9e;font-size:13px;">Ce lien est personnel et ne fonctionne qu'une fois.</p>`,
      { label: p.renewed ? 'Ouvrir mon espace' : 'Créer mon accès', href: p.link }
    ),
  }),

  missionRejected: (p: {
    providerName: string
    detail: string
    reason: string
    by: string
  }) => ({
    subject: 'Une de vos prestations a été refusée',
    html: layout(
      'Prestation à corriger',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">La prestation suivante a été refusée par ${p.by} :</p>
       <p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;
                 border-left:3px solid #ef4444;"><strong>${p.detail}</strong><br>
         <span style="color:#7d8c9e;">Motif : ${p.reason}</span></p>
       <p style="margin:0;">Corrigez-la depuis votre espace, puis renvoyez-la en validation.</p>`,
      { label: 'Corriger ma prestation', href: `${APP_URL}/missions` }
    ),
  }),

  readyToInvoice: (p: { providerName: string; count: number; total: number }) => ({
    subject: `${p.count} prestation${p.count > 1 ? 's' : ''} validée${p.count > 1 ? 's' : ''} — vous pouvez facturer`,
    html: layout(
      'Vos prestations sont validées',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">${p.count} prestation${p.count > 1 ? 's ont' : ' a'} été validée${p.count > 1 ? 's' : ''},
          pour un total de <strong>${money(p.total)} HT</strong>.</p>
       <p style="margin:0 0 12px;">Rendez-vous dans votre espace pour établir votre facture :
          la plateforme peut la générer pour vous à partir de ces montants, ou vous pouvez
          déposer la vôtre si vous l'éditez avec votre propre outil.</p>
       <p style="margin:0;color:#7d8c9e;font-size:13px;">Dans les deux cas, les montants sont ceux
          validés ci-dessus : vous n'avez rien à recalculer.</p>`,
      { label: 'Établir ma facture', href: `${APP_URL}/factures/nouvelle` }
    ),
  }),

  invoiceReminder: (p: {
    providerName: string
    number: string
    total: number
    issueDate: string
  }) => ({
    subject: `Relance — votre facture ${p.number} n’a pas été transmise`,
    html: layout(
      'Votre facture est en attente d’envoi',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">Votre facture <strong>${p.number}</strong>
          (${money(p.total)}) a été créée le ${formatDate(p.issueDate)}
          mais n’a pas encore été transmise à ${COMPANY.name}.</p>
       <p style="margin:0;">Tant qu’elle n’est pas envoyée, elle ne peut pas être mise en paiement.</p>`,
      { label: 'Voir ma facture', href: `${APP_URL}/factures` }
    ),
  }),

  /** Le bordereau est arbitré : le prestataire peut facturer, avec une date. */
  statementCleared: (p: {
    providerName: string
    total: number
    deadline: string
    paymentStart: string
    reply: string | null
  }) => ({
    subject: `Votre bordereau est validé — ${money(p.total)} HT`,
    html: layout(
      'Vous pouvez établir votre facture',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       ${p.reply ? `<p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;
            border-left:3px solid #c9a84c;">${p.reply}</p>` : ''}
       <p style="margin:0 0 12px;">Votre bordereau est arrêté à <strong>${money(p.total)} HT</strong>.</p>
       <p style="margin:0 0 12px;">Votre facture doit nous parvenir <strong>avant le ${formatDate(p.deadline)}</strong>.
          Les paiements sont effectués à partir du ${formatDate(p.paymentStart)} — une facture reçue
          après cette date partira sur le cycle suivant.</p>`,
      { label: 'Voir mon bordereau', href: `${APP_URL}/bordereaux` }
    ),
  }),

  /** Relance quand la facture se fait attendre et que l'échéance approche. */
  statementReminder: (p: {
    providerName: string
    total: number
    deadline: string
    joursRestants: number
  }) => ({
    subject:
      p.joursRestants > 0
        ? `Rappel — votre facture est attendue d’ici ${p.joursRestants} jour${p.joursRestants > 1 ? 's' : ''}`
        : 'Votre facture est attendue aujourd’hui',
    html: layout(
      'Nous attendons votre facture',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">Votre bordereau de <strong>${money(p.total)} HT</strong> est validé,
          mais nous n'avons pas encore reçu votre facture.</p>
       <p style="margin:0 0 12px;">Elle est attendue <strong>${
         p.joursRestants > 0 ? `avant le ${formatDate(p.deadline)}` : `aujourd'hui`
       }</strong>. Passé ce délai, le règlement bascule sur le cycle de paiement suivant.</p>
       <p style="margin:0;">Vous pouvez la générer en deux clics depuis votre espace, ou déposer la vôtre.</p>`,
      { label: 'Établir ma facture', href: `${APP_URL}/factures/nouvelle` }
    ),
  }),

  invoiceReceived: (p: { adminName: string; providerName: string; number: string; total: number }) => ({
    subject: `Facture ${p.number} reçue — ${p.providerName}`,
    html: layout(
      'Nouvelle facture à traiter',
      `<p style="margin:0 0 12px;">Bonjour ${p.adminName},</p>
       <p style="margin:0;">${p.providerName} a transmis la facture <strong>${p.number}</strong>
          pour <strong>${money(p.total)}</strong>.</p>`,
      { label: 'Ouvrir la facture', href: `${APP_URL}/admin/factures` }
    ),
  }),
}
