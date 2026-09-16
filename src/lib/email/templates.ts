import { formatDate, formatDateLong, money } from '@/lib/format'
import type { BillingCycle } from '@/lib/cycle'
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
    subject: `Relance — il manque le PDF de votre facture ${p.number}`,
    html: layout(
      'Votre facture attend son PDF',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">Votre facture <strong>${p.number}</strong>
          (${money(p.total)}) a été créée le ${formatDate(p.issueDate)}
          mais vous n’avez pas encore déposé votre PDF.</p>
       <p style="margin:0;">Dès qu’il est déposé, la facture part automatiquement à ${COMPANY.name}
          et peut être mise en paiement.</p>`,
      { label: 'Déposer mon PDF', href: `${APP_URL}/factures` }
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

  // ---------- Bons de mission ----------

  orderSent: (p: {
    providerName: string
    managerName: string
    title: string
    total: number
    start: string
    end: string
    conditions: string | null
    tarif: string
  }) => ({
    subject: `Bon de mission — ${p.title}`,
    html: layout(
      'Une mission vous est proposée',
      `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
       <p style="margin:0 0 12px;">${p.managerName} vous propose la mission suivante :</p>
       <p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;border-left:3px solid #c9a84c;">
         <strong>${p.title}</strong><br>
         du ${formatDate(p.start)} au ${formatDate(p.end)}<br>
         ${p.tarif} — <strong>${money(p.total)} HT</strong>
         ${p.conditions ? `<br><span style="color:#7d8c9e;">${p.conditions}</span>` : ''}
       </p>
       <p style="margin:0;">Acceptez-la ou refusez-la depuis votre espace. Une fois acceptée,
          elle sera ajoutée à vos prestations à la fin de la mission, sans rien ressaisir.</p>`,
      { label: 'Répondre', href: `${APP_URL}/missions?onglet=bons` }
    ),
  }),

  /** Un bon de mission pour quelqu'un qui n'a pas encore de compte. */
  orderInvitation: (p: {
    name: string
    managerName: string
    title: string
    total: number
    start: string
    end: string
    tarif: string
    conditions: string | null
    link: string
  }) => ({
    subject: `${p.managerName} vous propose une mission — ${p.title}`,
    html: layout(
      'Une mission vous est proposée',
      `<p style="margin:0 0 12px;">Bonjour ${p.name},</p>
       <p style="margin:0 0 12px;">${p.managerName}, de ${COMPANY.name}, vous propose la mission suivante :</p>
       <p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;border-left:3px solid #c9a84c;">
         <strong>${p.title}</strong><br>
         du ${formatDate(p.start)} au ${formatDate(p.end)}<br>
         ${p.tarif} — <strong>${money(p.total)} HT</strong>
         ${p.conditions ? `<br><span style="color:#7d8c9e;">${p.conditions}</span>` : ''}
       </p>
       <p style="margin:0 0 12px;">Pour l’accepter, créez votre espace prestataire : il suffit de choisir un mot de passe.
          Vous y retrouverez ensuite vos missions et vos factures.</p>
       <p style="margin:0;color:#7d8c9e;font-size:13px;">Ce lien est personnel et reste valable ${INVITATION_DAYS} jours.</p>`,
      { label: 'Créer mon compte et répondre', href: p.link }
    ),
  }),

  orderAnswered: (p: {
    managerName: string
    providerName: string
    title: string
    accepted: boolean
    note: string | null
  }) => ({
    subject: `${p.providerName} a ${p.accepted ? 'accepté' : 'refusé'} : ${p.title}`,
    html: layout(
      p.accepted ? 'Bon de mission accepté' : 'Bon de mission refusé',
      `<p style="margin:0 0 12px;">Bonjour ${p.managerName},</p>
       <p style="margin:0 0 12px;">${p.providerName} a <strong>${p.accepted ? 'accepté' : 'refusé'}</strong>
          la mission « ${p.title} ».</p>
       ${p.note ? `<p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;">${p.note}</p>` : ''}`,
      { label: 'Voir mes bons de mission', href: `${APP_URL}/bons-de-mission` }
    ),
  }),

  orderDue: (p: { managerName: string; providerName: string; title: string; end: string; id: string }) => ({
    subject: `Mission terminée ? ${p.title} — ${p.providerName}`,
    html: layout(
      'La mission devait se terminer',
      `<p style="margin:0 0 12px;">Bonjour ${p.managerName},</p>
       <p style="margin:0 0 12px;">La mission « <strong>${p.title}</strong> » confiée à ${p.providerName}
          devait se terminer le ${formatDate(p.end)}.</p>
       <p style="margin:0;">Confirmez qu’elle a été réalisée comme prévu, ou ajustez la quantité et le
          montant : elle rejoindra alors automatiquement les prestations déclarées.</p>`,
      { label: 'Clôturer la mission', href: `${APP_URL}/bons-de-mission/${p.id}` }
    ),
  }),

  // ---------- Messagerie ----------

  messageReceived: (p: {
    recipientName: string
    authorName: string
    subject: string
    excerpt: string
    href: string
  }) => ({
    subject: `Message de ${p.authorName} — ${p.subject}`,
    html: layout(
      'Vous avez un nouveau message',
      `<p style="margin:0 0 12px;">Bonjour ${p.recipientName},</p>
       <p style="margin:0 0 12px;">${p.authorName} vous a écrit à propos de « ${p.subject} » :</p>
       <p style="margin:0 0 12px;padding:12px 14px;background:#fbf8f1;border-radius:8px;border-left:3px solid #c9a84c;">${p.excerpt}</p>
       <p style="margin:0;color:#7d8c9e;font-size:13px;">Répondez depuis la plateforme : l’échange reste attaché au dossier.</p>`,
      { label: 'Répondre', href: `${APP_URL}${p.href}` }
    ),
  }),

  // ---------- Calendrier mensuel ----------

  monthCalendar: (p: { name: string; public: 'prestataire' | 'salarie' | 'manager'; cycle: BillingCycle }) => {
    const c = p.cycle
    const ligne = (quand: string, quoi: string) =>
      `<tr><td style="padding:6px 12px 6px 0;white-space:nowrap;vertical-align:top;font-weight:600;color:#0e1e35;">${quand}</td>
           <td style="padding:6px 0;vertical-align:top;">${quoi}</td></tr>`
    const lignes =
      p.public === 'manager'
        ? [
            ligne(`jusqu’au ${formatDateLong(c.declarationDeadline)}`, 'les prestataires déclarent ; vous pouvez déclarer pour eux et envoyer des bons de mission'),
            ligne(`${formatDate(c.reviewStart)} → ${formatDate(c.reviewEnd)}`, 'vous vérifiez, corrigez et complétez leurs prestations'),
            ligne(formatDateLong(c.statementDate), `envoi du bordereau global ; factures jusqu’au ${formatDateLong(c.invoiceDeadline)}`),
            ligne(formatDateLong(c.paymentDate), 'paiement'),
          ]
        : p.public === 'salarie'
          ? [
              ligne(`jusqu’au ${formatDateLong(c.declarationDeadline)}`, 'déclarez vos prestations et vos bonus'),
              ligne(`${formatDate(c.reviewStart)} → ${formatDate(c.reviewEnd)}`, 'vérification par votre manager'),
              ligne(formatDateLong(c.statementDate), 'transmission au service paie — aucune facture à faire'),
            ]
          : [
              ligne(`jusqu’au ${formatDateLong(c.declarationDeadline)}`, 'déclarez vos prestations du mois'),
              ligne(`${formatDate(c.reviewStart)} → ${formatDate(c.reviewEnd)}`, 'vérification par vos managers'),
              ligne(formatDateLong(c.statementDate), 'vous recevez votre bordereau'),
              ligne(`jusqu’au ${formatDateLong(c.invoiceDeadline)}`, 'générez ou déposez votre facture'),
              ligne(formatDateLong(c.paymentDate), 'paiement'),
            ]
    return {
      subject: `Calendrier de ${c.label} — Diploma Invoice`,
      html: layout(
        `Le calendrier de ${c.label}`,
        `<p style="margin:0 0 12px;">Bonjour ${p.name},</p>
         <p style="margin:0 0 12px;">Voici les dates à retenir ce mois-ci :</p>
         <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">${lignes.join('')}</table>`,
        { label: 'Ouvrir Diploma Invoice', href: APP_URL }
      ),
    }
  },

  declarationReminder: (p: { name: string; deadline: string; label: string }) => ({
    subject: `Dernier jour pour déclarer vos prestations de ${p.label} : ${formatDateLong(p.deadline)}`,
    html: layout(
      'Pensez à déclarer vos prestations',
      `<p style="margin:0 0 12px;">Bonjour ${p.name},</p>
       <p style="margin:0 0 12px;">Vos prestations de ${p.label} doivent être déclarées
          <strong>au plus tard le ${formatDateLong(p.deadline)}</strong>.</p>
       <p style="margin:0;">Après cette date, seul votre manager pourra en ajouter.</p>`,
      { label: 'Déclarer mes prestations', href: `${APP_URL}/missions/new` }
    ),
  }),

  reviewReminder: (p: { name: string; count: number; total: number; reviewEnd: string; label: string }) => ({
    subject: `Vérification de ${p.label} : ${p.count} prestation${p.count > 1 ? 's' : ''} à valider avant le ${formatDate(p.reviewEnd)}`,
    html: layout(
      'À vous de vérifier',
      `<p style="margin:0 0 12px;">Bonjour ${p.name},</p>
       <p style="margin:0 0 12px;">La période de déclaration de ${p.label} est close.
          <strong>${p.count} prestation${p.count > 1 ? 's' : ''}</strong> (${money(p.total)} HT) attendent votre validation.</p>
       <p style="margin:0;">Vous avez jusqu’au <strong>${formatDateLong(p.reviewEnd)}</strong> pour valider, corriger
          ou compléter : le bordereau global part le lendemain.</p>`,
      { label: 'Vérifier les prestations', href: `${APP_URL}/validation` }
    ),
  }),

  statementSent: (p: {
    providerName: string
    total: number
    lines: number
    label: string
    deadline: string
    paymentDate: string
    salaried: boolean
  }) => ({
    subject: p.salaried
      ? `Vos éléments de ${p.label} sont transmis à la paie`
      : `Votre bordereau de ${p.label} — ${money(p.total)} HT — facture avant le ${formatDate(p.deadline)}`,
    html: layout(
      p.salaried ? 'Vos éléments sont transmis' : 'Votre bordereau est prêt',
      p.salaried
        ? `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
           <p style="margin:0;">Vos ${p.lines} élément${p.lines > 1 ? 's' : ''} validé${p.lines > 1 ? 's' : ''} de ${p.label}
              (${money(p.total)}) sont transmis au service paie. Vous n’avez rien d’autre à faire.</p>`
        : `<p style="margin:0 0 12px;">Bonjour ${p.providerName},</p>
           <p style="margin:0 0 12px;">Votre bordereau de ${p.label} réunit <strong>${p.lines} prestation${p.lines > 1 ? 's' : ''}</strong>,
              tous pôles confondus, pour <strong>${money(p.total)} HT</strong>.</p>
           <p style="margin:0 0 12px;">Générez votre facture en un clic, ou déposez la vôtre,
              <strong>au plus tard le ${formatDateLong(p.deadline)}</strong>.</p>
           <p style="margin:0;">Paiement le ${formatDateLong(p.paymentDate)}. Une facture reçue plus tard partira au cycle suivant.
              Un point à discuter ? Écrivez à votre manager depuis votre bordereau.</p>`,
      { label: p.salaried ? 'Voir mes prestations' : 'Établir ma facture', href: `${APP_URL}${p.salaried ? '/missions' : '/factures'}` }
    ),
  }),

  // ---------- Factures diverses ----------

  miscInvoiceFiled: (p: { name: string; supplier: string; number: string; total: number; created: boolean }) => ({
    subject: `Facture ${p.number} de ${p.supplier} bien reçue`,
    html: layout(
      'Facture enregistrée',
      `<p style="margin:0 0 12px;">Bonjour ${p.name},</p>
       <p style="margin:0 0 12px;">La facture <strong>${p.number}</strong> de ${p.supplier}
          (${money(p.total)} TTC) est enregistrée dans les factures validées.</p>
       ${p.created ? '<p style="margin:0;color:#7d8c9e;font-size:13px;">Ce fournisseur n’existait pas : sa fiche a été créée à partir de la facture.</p>' : ''}`,
      { label: 'Voir les factures', href: `${APP_URL}/admin/factures?onglet=validees` }
    ),
  }),

  inboundRefused: (p: { reason: string }) => ({
    subject: 'Votre facture n’a pas pu être enregistrée',
    html: layout(
      'Facture non enregistrée',
      `<p style="margin:0 0 12px;">Bonjour,</p>
       <p style="margin:0;">${p.reason}</p>`
    ),
  }),
}
