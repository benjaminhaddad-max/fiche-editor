import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { BillingCycle } from '@/lib/cycle'
import { formatDateLong } from '@/lib/format'

/**
 * Les deux modes d'emploi joints aux emails du mois.
 *
 * Ils tiennent sur une page, avec les vraies dates du mois en cours plutôt
 * que des « L−3 » : quelqu'un qui découvre la plateforme ne doit avoir ni
 * à traduire, ni à chercher ailleurs.
 */

const NAVY = '#0e1e35'
const OR = '#8B6914'
const GRIS = '#5b6b7d'

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 44, paddingHorizontal: 46, fontSize: 10, color: NAVY, lineHeight: 1.5 },
  marque: { fontSize: 8, letterSpacing: 1.4, color: OR, marginBottom: 6 },
  titre: { fontSize: 20, lineHeight: 1.25, marginBottom: 5 },
  sousTitre: { fontSize: 10, color: GRIS, marginBottom: 20 },
  section: { marginTop: 16, marginBottom: 6, fontSize: 11, color: NAVY },
  filet: { borderBottomWidth: 1.5, borderBottomColor: OR, width: 34, marginBottom: 9 },
  etape: { flexDirection: 'row', marginBottom: 9 },
  puce: { width: 17, fontSize: 11, color: OR },
  corps: { flex: 1 },
  fort: { fontSize: 10.5 },
  gris: { color: GRIS },
  encart: { backgroundColor: '#fbf8f1', borderLeftWidth: 2.5, borderLeftColor: OR, padding: 10, marginTop: 14 },
  ligneDate: { flexDirection: 'row', marginBottom: 5 },
  quand: { width: 158, fontSize: 9.5 },
  quoi: { flex: 1, fontSize: 9.5, color: GRIS },
  pied: { position: 'absolute', bottom: 26, left: 46, right: 46, fontSize: 8, color: GRIS, textAlign: 'center' },
})

function Etape({ n, titre, texte }: { n: number; titre: string; texte: string }) {
  return (
    <View style={s.etape} wrap={false}>
      <Text style={s.puce}>{n}.</Text>
      <View style={s.corps}>
        <Text style={s.fort}>{titre}</Text>
        <Text style={s.gris}>{texte}</Text>
      </View>
    </View>
  )
}

function Date({ quand, quoi }: { quand: string; quoi: string }) {
  return (
    <View style={s.ligneDate}>
      <Text style={s.quand}>{quand}</Text>
      <Text style={s.quoi}>{quoi}</Text>
    </View>
  )
}

function Entete({ titre, sous }: { titre: string; sous: string }) {
  return (
    <>
      <Text style={s.marque}>DIPLOMA INVOICE</Text>
      <Text style={s.titre}>{titre}</Text>
      <Text style={s.sousTitre}>{sous}</Text>
    </>
  )
}

/** Mode d'emploi d'un prestataire qui facture. */
function GuideIndependant({ c }: { c: BillingCycle }) {
  return (
    <Document title="Diploma Invoice — votre mode d’emploi">
      <Page size="A4" style={s.page}>
        <Entete titre="Comment ça marche, de votre côté" sous={`Quatre choses à faire, et rien d’autre. Exemple sur ${c.label}.`} />

        <Text style={s.section}>Une fois pour toutes</Text>
        <View style={s.filet} />
        <Etape
          n={1}
          titre="Complétez votre fiche"
          texte="Votre nom, votre adresse, votre SIRET et votre IBAN. Sans eux, votre facture ne peut pas être émise. Un bandeau doré vous le rappelle tant qu’il manque quelque chose."
        />

        <Text style={s.section}>Chaque mois</Text>
        <View style={s.filet} />
        <Etape
          n={2}
          titre="Déclarez ce que vous avez fait"
          texte="Une ligne par prestation, comme sur une facture. Vous écrivez librement ce que vous avez fait, la formation concernée, le manager qui vous l’a confiée, et la quantité — à l’heure, à la journée ou à la mission. Ajoutez autant de lignes que nécessaire."
        />
        <Etape
          n={3}
          titre="Votre manager vérifie"
          texte="Vous n’avez rien à faire pendant ces trois jours. S’il corrige une ligne, vous en êtes prévenu."
        />
        <Etape
          n={4}
          titre="Votre facture est prête"
          texte="Vous recevez un bordereau qui réunit toutes vos missions du mois. Un clic, et votre facture est générée, déjà remplie. Si vous préférez la vôtre, déposez-la."
        />

        <Text style={s.section}>Les dates de {c.label}</Text>
        <View style={s.filet} />
        <Date quand={`jusqu’au ${formatDateLong(c.declarationDeadline)}`} quoi="vous déclarez vos prestations" />
        <Date quand={`du ${formatDateLong(c.reviewStart)} au ${formatDateLong(c.reviewEnd)}`} quoi="vos managers vérifient" />
        <Date quand={formatDateLong(c.statementDate)} quoi="vous recevez votre bordereau" />
        <Date quand={`jusqu’au ${formatDateLong(c.invoiceDeadline)}`} quoi="vous générez ou déposez votre facture" />
        <Date quand={formatDateLong(c.paymentDate)} quoi="paiement par virement" />

        <View style={s.encart}>
          <Text style={s.fort}>Vous avez oublié une mission d’un mois passé ?</Text>
          <Text style={s.gris}>
            Déclarez-la quand même : cochez « Rattrapage » et choisissez le mois concerné. Elle sera payée avec
            celles du mois en cours.
          </Text>
        </View>

        <View style={s.encart}>
          <Text style={s.fort}>Une question ?</Text>
          <Text style={s.gris}>
            Écrivez à votre manager depuis l’onglet Messages : la conversation reste attachée à votre dossier.
          </Text>
        </View>

        <Text style={s.pied} fixed>
          Diploma Invoice — facturation.diploma-sante.fr
        </Text>
      </Page>
    </Document>
  )
}

/** Mode d'emploi d'un salarié : pas de facture, des éléments de paie. */
function GuideSalarie({ c }: { c: BillingCycle }) {
  return (
    <Document title="Diploma Invoice — votre mode d’emploi">
      <Page size="A4" style={s.page}>
        <Entete
          titre="Comment ça marche, de votre côté"
          sous={`Vous êtes sous contrat : aucune facture à faire. Exemple sur ${c.label}.`}
        />

        <Text style={s.section}>Une fois pour toutes</Text>
        <View style={s.filet} />
        <Etape
          n={1}
          titre="Complétez votre fiche"
          texte="Votre adresse et votre téléphone. Pas de SIRET ni d’IBAN à renseigner : vous êtes payé en salaire, votre dossier est au service paie."
        />

        <Text style={s.section}>Chaque mois</Text>
        <View style={s.filet} />
        <Etape
          n={2}
          titre="Déclarez ce que vous avez fait"
          texte="Une ligne par prestation : ce que vous avez fait, la formation concernée, le manager qui vous l’a confiée, et la quantité — à l’heure, à la journée ou à la mission. Cochez « bonus » pour une prime."
        />
        <Etape
          n={3}
          titre="Votre manager vérifie"
          texte="Il corrige ou complète si besoin. Vous n’avez rien à faire pendant ces trois jours."
        />
        <Etape
          n={4}
          titre="Tout part au service paie"
          texte="Vos déclarations validées sont transmises pour établir votre bulletin. Vous n’émettez aucune facture, et vous retrouvez vos bulletins dans « Mes documents »."
        />

        <Text style={s.section}>Les dates de {c.label}</Text>
        <View style={s.filet} />
        <Date quand={`jusqu’au ${formatDateLong(c.declarationDeadline)}`} quoi="vous déclarez vos prestations et vos bonus" />
        <Date quand={`du ${formatDateLong(c.reviewStart)} au ${formatDateLong(c.reviewEnd)}`} quoi="vérification par votre manager" />
        <Date quand={formatDateLong(c.statementDate)} quoi="transmission au service paie" />

        <View style={s.encart}>
          <Text style={s.fort}>Vous avez oublié une mission d’un mois passé ?</Text>
          <Text style={s.gris}>
            Déclarez-la quand même : cochez « Rattrapage » et choisissez le mois concerné. Elle partira avec celles
            du mois en cours.
          </Text>
        </View>

        <Text style={s.pied} fixed>
          Diploma Invoice — facturation.diploma-sante.fr
        </Text>
      </Page>
    </Document>
  )
}

/** Mode d'emploi d'un manager. */
function GuideManager({ c, depot }: { c: BillingCycle; depot: string | null }) {
  return (
    <Document title="Diploma Invoice — mode d’emploi du manager">
      <Page size="A4" style={s.page}>
        <Entete titre="Votre rôle, en trois gestes" sous={`Ce qu’on attend de vous chaque mois. Exemple sur ${c.label}.`} />

        <Text style={s.section}>Ce que vous faites</Text>
        <View style={s.filet} />
        <Etape
          n={1}
          titre="Vous vérifiez ce qu’on vous adresse"
          texte="Chaque prestation déclarée vous revient si la personne vous a désigné. Vous validez, corrigez le montant ou le libellé, refusez avec un motif — ou réattribuez la ligne à un autre manager si elle ne vous concerne pas."
        />
        <Etape
          n={2}
          titre="Vous déclarez pour ceux qui ne l’ont pas fait"
          texte="Passé la date limite, eux ne peuvent plus rien ajouter ; vous, si, pendant trois jours. Vous pouvez aussi envoyer un bon de mission à l’avance : la personne l’accepte, et la mission se déclare toute seule à la date de fin."
        />
        <Etape
          n={3}
          titre="Vous faites remonter les factures hors prestation"
          texte={
            depot
              ? `Un fournisseur, une commande ponctuelle, un intervenant extérieur : déposez la facture dans Rémunérations puis Factures, ou envoyez-la simplement par email à ${depot}. Elle est lue et classée automatiquement.`
              : 'Un fournisseur, une commande ponctuelle : déposez la facture dans Rémunérations puis Factures. Elle est lue et classée automatiquement.'
          }
        />

        <Text style={s.section}>Les dates de {c.label}</Text>
        <View style={s.filet} />
        <Date quand={`jusqu’au ${formatDateLong(c.declarationDeadline)}`} quoi="vos prestataires déclarent" />
        <Date quand={`du ${formatDateLong(c.reviewStart)} au ${formatDateLong(c.reviewEnd)}`} quoi="à vous de vérifier, corriger, compléter" />
        <Date quand={formatDateLong(c.statementDate)} quoi="les bordereaux partent" />
        <Date quand={`jusqu’au ${formatDateLong(c.invoiceDeadline)}`} quoi="toutes les factures doivent être reçues" />
        <Date quand={formatDateLong(c.paymentDate)} quoi="paiement" />

        <View style={s.encart}>
          <Text style={s.fort}>Quelqu’un manque à l’appel ?</Text>
          <Text style={s.gris}>
            Depuis l’écran Prestations, vous ajoutez un prestataire avec son nom et son email, et vous pouvez
            relancer les vôtres quand vous voulez : ceux qui ne se sont jamais connectés reçoivent leur accès, ceux
            qui ont déjà déclaré ne sont pas dérangés.
          </Text>
        </View>

        <View style={s.encart}>
          <Text style={s.fort}>Deux rappels partent tout seuls</Text>
          <Text style={s.gris}>
            Trois jours avant la clôture, puis la veille. Vous n’avez rien à déclencher.
          </Text>
        </View>

        <Text style={s.pied} fixed>
          Diploma Invoice — facturation.diploma-sante.fr
        </Text>
      </Page>
    </Document>
  )
}

export type PublicGuide = 'prestataire' | 'salarie' | 'manager'

/** Le guide correspondant, en PDF. */
export async function guidePdf(pour: PublicGuide, cycle: BillingCycle): Promise<Buffer> {
  const depot = process.env.DEPOT_FACTURES_EMAIL ?? null
  const doc =
    pour === 'manager' ? (
      <GuideManager c={cycle} depot={depot} />
    ) : pour === 'salarie' ? (
      <GuideSalarie c={cycle} />
    ) : (
      <GuideIndependant c={cycle} />
    )
  return renderToBuffer(doc)
}

/** Nom du fichier joint, lisible dans une boîte mail. */
export function guideNom(pour: PublicGuide): string {
  return pour === 'manager' ? 'Diploma Invoice - guide du manager.pdf' : 'Diploma Invoice - mode d emploi.pdf'
}
