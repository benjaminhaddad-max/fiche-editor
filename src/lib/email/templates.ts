import { formatDate, money } from '@/lib/format'
import { COMPANY } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://facturation.diploma-sante.fr'
const INVITATION_DAYS = Number(process.env.INVITATION_DAYS ?? 30)

/** Enveloppe HTML commune : sobre, lisible dans tous les clients mail. */
function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td style="padding:24px 28px 0;">
          <p style="margin:0;font-size:13px;font-weight:600;color:#4f46e5;letter-spacing:.3px;">DIPLOMA INVOICE</p>
          <h1 style="margin:8px 0 0;font-size:19px;line-height:1.35;color:#0f172a;">${title}</h1>
        </td></tr>
        <tr><td style="padding:16px 28px 4px;font-size:14px;line-height:1.65;color:#334155;">
          ${body}
        </td></tr>
        ${
          cta
            ? `<tr><td style="padding:12px 28px 24px;">
                 <a href="${cta.href}" style="display:inline-block;background:#4f46e5;color:#ffffff;
                    text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px;">
                   ${cta.label}</a>
               </td></tr>`
            : '<tr><td style="height:16px"></td></tr>'
        }
        <tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
          ${COMPANY.name} — message automatique, merci de ne pas y répondre directement.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export const templates = {
  /**
   * Première prise de contact. Le message change selon le rôle : un
   * prestataire vient facturer, un manager vient contrôler. Leur envoyer le
   * même texte les perdrait tous les deux.
   */
  invitation: (p: { fullName: string; link: string }) => ({
    subject: 'Créez votre accès à Diploma Invoice',
    html: layout(
      'Votre espace de facturation est prêt',
      `<p style="margin:0 0 12px;">Bonjour ${p.fullName},</p>
       <p style="margin:0 0 12px;">${COMPANY.name} met à votre disposition un espace pour
          suivre vos prestations et transmettre vos factures.</p>
       <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.
          Vous compléterez ensuite vos informations de facturation — raison sociale, SIRET,
          adresse et IBAN — nécessaires pour être réglé.</p>
       <p style="margin:0;color:#64748b;font-size:13px;">Ce lien est personnel, ne fonctionne
          qu'une fois, et reste valable ${INVITATION_DAYS} jours.</p>`,
      { label: 'Créer mon accès', href: p.link }
    ),
  }),

  invitationStaff: (p: { fullName: string; link: string; isAdmin: boolean }) => ({
    subject: 'Créez votre accès à Diploma Invoice',
    html: layout(
      p.isAdmin ? 'Votre espace d’administration est prêt' : 'Votre espace de validation est prêt',
      `<p style="margin:0 0 12px;">Bonjour ${p.fullName},</p>
       <p style="margin:0 0 12px;">${COMPANY.name} centralise désormais les prestations des
          intervenants et leur facturation sur une seule plateforme.</p>
       <p style="margin:0 0 12px;">${
         p.isAdmin
           ? 'Vous y validez les prestations, suivez les factures reçues et pilotez les contrats.'
           : 'Vous y retrouvez les prestations des intervenants que vous avez sollicités, pour les valider ou les refuser avant facturation.'
       }</p>
       <p style="margin:0 0 12px;">Cliquez ci-dessous pour <strong>choisir votre mot de passe</strong>.</p>
       <p style="margin:0;color:#64748b;font-size:13px;">Ce lien est personnel et ne fonctionne qu'une fois.</p>`,
      { label: 'Créer mon accès', href: p.link }
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
       <p style="margin:0 0 12px;padding:12px 14px;background:#f8fafc;border-radius:8px;
                 border-left:3px solid #ef4444;"><strong>${p.detail}</strong><br>
         <span style="color:#64748b;">Motif : ${p.reason}</span></p>
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
       <p style="margin:0;color:#64748b;font-size:13px;">Dans les deux cas, les montants sont ceux
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
