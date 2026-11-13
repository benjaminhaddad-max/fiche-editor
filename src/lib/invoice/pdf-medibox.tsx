import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatDate, money } from '@/lib/format'
import { lignesPrecompte, tauxAffiche } from '@/lib/invoice/net-auteur'
import { BRANDS } from '@/lib/brand/config'
import { mentionTva, societeDe, type Invoice, type InvoiceLine } from '@/lib/types'
import type { AuteurPdf } from '@/lib/invoice/pdf'
import { trimestreDe } from '@/lib/invoice/trimestre'

/**
 * La facture Medibox, sur le modèle que Nolwenn a fourni.
 *
 * Ce n'est pas la facture Diploma recolorée : Nolwenn l'a refusée. On reprend
 * la structure de ses deux gabarits (« Template facture auto-entrepreneur »
 * et « Template relevé paiement - Droits d'Auteurs ») : émetteur à gauche,
 * « A : MEDIBOX FRANCE » à droite, un tableau Activité / Description /
 * Montant unitaire / Quantité / Montant, puis l'échéance, le règlement et
 * l'IBAN. La couleur est celle de Medibox.
 *
 * Deux variantes, parce que les deux statuts ne disent pas la même chose :
 *  - l'auto-entrepreneur facture une prestation : le total est un montant
 *    HT, ou TTC s'il a de la TVA, jamais un « net » — ses cotisations ne
 *    regardent pas la facture ;
 *  - l'auteur est payé en droits : c'est une « Note de droits d'auteur –
 *    Certification de précompte » (jamais une facture, sans TVA) : brut,
 *    précompte, puis net à payer, avec son numéro de sécurité sociale que
 *    Nolwenn reporte à l'Urssaf. Son contenu suit le modèle de l'auteur :
 *    2 (résident fiscal en France), 3 (non-résident, affilié en France) ou
 *    4 (formulaire A1 valide : aucun précompte).
 */
const p = BRANDS.medibox.palette

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 40, fontSize: 9, fontFamily: 'Helvetica', color: p.ink },
  haut: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 },
  titre: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: p.ink },
  sousTitre: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: p.accent, marginTop: 3 },
  date: { marginTop: 4, color: '#4a4560' },
  bandeau: { width: 60, height: 3, backgroundColor: p.accent, marginTop: 6 },
  parties: { flexDirection: 'row', gap: 18, marginBottom: 22 },
  partie: { flex: 1 },
  ligneInfo: { flexDirection: 'row', marginBottom: 2 },
  etiquette: { width: 108, color: '#6b6585' },
  valeur: { flex: 1, fontFamily: 'Helvetica-Bold' },
  destinataire: { flex: 1, borderLeftWidth: 2, borderLeftColor: p.accent, paddingLeft: 10 },
  destNom: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  destLigne: { color: '#4a4560', lineHeight: 1.25 },
  tete: { flexDirection: 'row', backgroundColor: p.light, borderBottomWidth: 1, borderBottomColor: p.accent, paddingVertical: 6, paddingHorizontal: 6 },
  teteTexte: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: p.ink },
  rang: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#E6E0FA' },
  cActivite: { width: 120, paddingRight: 6 },
  cDesc: { flex: 1, paddingRight: 6 },
  cUnit: { width: 62, textAlign: 'right' },
  cQte: { width: 48, textAlign: 'right' },
  cMontant: { width: 68, textAlign: 'right' },
  bas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  conditions: { width: 210 },
  totaux: { width: 270 },
  totalRang: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  retenue: { fontSize: 8, color: '#4a4560' },
  totalFinal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingVertical: 6, paddingHorizontal: 6, backgroundColor: p.dark, color: '#ffffff' },
  totalFinalTexte: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  note: { color: '#4a4560', lineHeight: 1.5, marginTop: 2 },
  cadre: { marginBottom: 14, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: p.light, borderLeftWidth: 2, borderLeftColor: p.accent },
  cadreTitre: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  alerte: { marginTop: 3, fontFamily: 'Helvetica-Bold', color: '#B45309' },
  mentions: { marginTop: 22, fontSize: 7.5, color: '#6b6585', lineHeight: 1.45 },
  merci: { marginTop: 18, textAlign: 'center', color: p.accent, fontFamily: 'Helvetica-Bold' },
  pied: { position: 'absolute', bottom: 24, left: 40, right: 40, textAlign: 'center', fontSize: 7, color: '#8B82A6' },
})

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <View style={s.ligneInfo}>
      <Text style={s.etiquette}>{label}</Text>
      <Text style={s.valeur}>{value}</Text>
    </View>
  )
}

const pourcent = (t: number) => `${(Math.round(t * 10000) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} %`

/** « CSG 9,20 % sur 98,25 % du brut » : ce que Nolwenn reporte à l'Urssaf. */
const libellesPrecompte = (modele: 2 | 3 | 4) =>
  lignesPrecompte(modele).map(
    (l) => `${l.libelle} ${pourcent(l.taux)}${l.assiette < 1 ? ` sur ${pourcent(l.assiette)} du brut` : ''}`
  )

const INTITULE_MODELE = {
  2: 'Modèle 2 : auteur résident fiscal en France',
  3: 'Modèle 3 : auteur non-résident fiscal, affilié à la sécurité sociale française',
  4: 'Modèle 4 : auteur affilié à la sécurité sociale d’un autre État (formulaire A1)',
} as const

export function MediboxInvoiceDocument({
  invoice,
  lines,
  auteur,
}: {
  invoice: Invoice
  lines: InvoiceLine[]
  auteur?: AuteurPdf
}) {
  const issuer = invoice.issuer_snapshot
  const societe = societeDe(invoice.brand)
  const tva = issuer.vat_regime === 'normal'
  const mention = mentionTva(issuer.vat_regime)
  // Le brut d'une note de droits d'auteur est celui du calcul (les lignes à net
  // fixé sont remontées au brut) ; pour une facture, c'est le sous-total.
  const brut = auteur ? auteur.brutTotal : Number(invoice.subtotal_ht)
  const libelles = auteur ? libellesPrecompte(auteur.modele) : []
  // Le précompte se déclare au trimestre du versement ; tant que la note
  // n'est pas payée, celui de sa date.
  const trimestre = trimestreDe(invoice.paid_at ?? invoice.issue_date)

  return (
    <Document
      title={`${auteur ? 'Note de droits d’auteur' : 'Facture'} ${invoice.number}`}
      author={issuer.legal_name}
      subject={`${invoice.number} — ${societe.name}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.haut}>
          <View>
            <Text style={s.titre}>
              {auteur ? 'Note de droits d’auteur – Certification de précompte' : `FACTURE N° ${invoice.number}`}
            </Text>
            {auteur && <Text style={s.sousTitre}>N° {invoice.number}</Text>}
            <View style={s.bandeau} />
            <Text style={s.date}>Date : {formatDate(invoice.issue_date)}</Text>
            {auteur && invoice.period_start && invoice.period_end && (
              <Text style={s.date}>
                Période : du {formatDate(invoice.period_start)} au {formatDate(invoice.period_end)}
              </Text>
            )}
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.partie}>
            {auteur ? (
              <Info label="Nom et prénom :" value={issuer.legal_name} />
            ) : (
              <Info label="Nom de la société :" value={issuer.legal_name} />
            )}
            <Info label="Adresse :" value={[issuer.address_line1, issuer.address_line2].filter(Boolean).join(', ')} />
            <Info label="Code postal et ville :" value={[issuer.postal_code, issuer.city].filter(Boolean).join(' ')} />
            <Info label="Mail :" value={issuer.email} />
            <Info label="Téléphone :" value={issuer.phone} />
            {auteur ? (
              <>
                <Info label="Date de naissance :" value={auteur.naissance ? formatDate(auteur.naissance) : null} />
                <Info label="N° de sécurité sociale :" value={auteur.secu} />
                <Info label="Résidence fiscale :" value={auteur.paysResidence} />
              </>
            ) : (
              <>
                <Info label="SIRET :" value={issuer.siret} />
                <Info label="N° de TVA :" value={issuer.vat_number} />
              </>
            )}
          </View>

          <View style={s.destinataire}>
            <Text style={s.destNom}>A : {societe.name.toUpperCase()}</Text>
            <Text style={s.destLigne}>{societe.address}</Text>
            <Text style={s.destLigne}>
              {societe.postalCode} {societe.city}
            </Text>
            {societe.siret && <Text style={s.destLigne}>SIRET : {societe.siret}</Text>}
            {societe.siret && <Text style={s.destLigne}>SIREN : {societe.siret.slice(0, 9)}</Text>}
          </View>
        </View>

        {auteur && (
          <View style={s.cadre}>
            <Text style={s.cadreTitre}>{INTITULE_MODELE[auteur.modele]}</Text>
            {auteur.modele === 4 && (
              <Text style={s.note}>
                Formulaire A1 n° {auteur.a1.numero ?? '—'}
                {auteur.a1.emetteur ? `, délivré par ${auteur.a1.emetteur}` : ''}
                {auteur.a1.debut ? `, valable du ${formatDate(auteur.a1.debut)}` : ''}
                {auteur.a1.fin ? ` au ${formatDate(auteur.a1.fin)}` : ''}.
              </Text>
            )}
            {auteur.mentionRepli && <Text style={s.alerte}>{auteur.mentionRepli}</Text>}
          </View>
        )}

        <View style={s.tete}>
          <Text style={[s.teteTexte, s.cActivite]}>Activité</Text>
          <Text style={[s.teteTexte, s.cDesc]}>Description</Text>
          <Text style={[s.teteTexte, s.cUnit]}>Montant unitaire</Text>
          <Text style={[s.teteTexte, s.cQte]}>Quantité</Text>
          <Text style={[s.teteTexte, s.cMontant]}>{auteur ? 'Montant' : 'Montant total'}</Text>
        </View>
        {lines.map((line) => {
          return (
            <View key={line.id} style={s.rang} wrap={false}>
              <Text style={s.cActivite}>{line.category_name}</Text>
              <Text style={s.cDesc}>
                {line.description}
                {line.period_label ? ` (${line.period_label})` : ''}
                {auteur && line.mission_id && auteur.bases[line.mission_id] === 'net' ? ' (net convenu)' : ''}
              </Text>
              <Text style={s.cUnit}>{money(line.unit_amount_ht)}</Text>
              <Text style={s.cQte}>{Number(line.quantity)}</Text>
              <Text style={s.cMontant}>{money(line.total_ht)}</Text>
            </View>
          )
        })}

        <View style={s.bas}>
          <View style={s.conditions}>
            <Text style={s.note}>Échéance : {formatDate(invoice.due_date)}</Text>
            <Text style={s.note}>Règlement : virement bancaire en euros</Text>
            {issuer.iban && <Text style={s.note}>IBAN : {issuer.iban}</Text>}
            {issuer.bic && <Text style={s.note}>BIC : {issuer.bic}</Text>}
          </View>

          <View style={s.totaux}>
            {auteur ? (
              <>
                <View style={s.totalRang}>
                  <Text>Montant brut</Text>
                  <Text>{money(brut)}</Text>
                </View>
                {auteur.brutDeduit > 0 && (
                  <View style={s.totalRang}>
                    <Text style={s.retenue}>dont remonté au brut depuis un net convenu</Text>
                    <Text style={s.retenue}>{money(auteur.brutDeduit)}</Text>
                  </View>
                )}
                {auteur.modele === 4 ? (
                  <View style={s.totalRang}>
                    <Text style={s.retenue}>Précompte : aucun (A1 valide), brut = net</Text>
                    <Text>{money(0)}</Text>
                  </View>
                ) : (
                  auteur.precompte.map((l, i) => (
                    <View key={l.libelle} style={s.totalRang}>
                      <Text style={s.retenue}>{libelles[i]}</Text>
                      {/* Helvetica n'a pas le signe moins typographique : il disparaissait. */}
                      <Text>- {money(l.montant)}</Text>
                    </View>
                  ))
                )}
                <View style={s.totalFinal}>
                  <Text style={s.totalFinalTexte}>NET À PAYER</Text>
                  <Text style={s.totalFinalTexte}>{auteur.net === null ? 'à vérifier' : money(auteur.net)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={s.totalRang}>
                  <Text>Montant HT</Text>
                  <Text>{money(invoice.subtotal_ht)}</Text>
                </View>
                <View style={s.totalRang}>
                  <Text>{tva ? `TVA (${Number(invoice.vat_rate)} %)` : 'TVA'}</Text>
                  <Text>{tva ? money(invoice.vat_amount) : 'non applicable'}</Text>
                </View>
                <View style={s.totalFinal}>
                  <Text style={s.totalFinalTexte}>{tva ? 'MONTANT TTC' : 'MONTANT TOTAL DE LA PRESTATION'}</Text>
                  <Text style={s.totalFinalTexte}>{money(invoice.total_ttc)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={s.mentions}>
          {!auteur && mention && <Text>{mention}</Text>}
          {auteur && (
            <>
              <Text>
                Note de droits d’auteur, régime des artistes-auteurs (art. L382-1 et suivants du Code de la
                sécurité sociale). Ce document certifie le précompte ; il n’est pas une facture et ne comporte
                pas de TVA.
              </Text>
              {auteur.modele === 4 ? (
                <Text>
                  Auteur affilié à la sécurité sociale d’un autre État par un formulaire A1 en cours de
                  validité : aucune cotisation ni contribution n’est précomptée en France. Le brut est égal
                  au net.
                </Text>
              ) : (
                <Text>
                  Cotisations précomptées par le diffuseur et versées à l’Urssaf (taux 2026, {tauxAffiche(auteur.modele)}
                  du brut). La vieillesse déplafonnée (0,40 %) et 0,75 point de la vieillesse plafonnée sont
                  pris en charge par l’État.
                  {auteur.modele === 3 ? ' Auteur non-résident fiscal : ni CSG ni CRDS.' : ''}
                </Text>
              )}
              <Text>
                Contribution diffuseur (1,1 %, soit {money(auteur.contributionDiffuseur)}) à la charge de{' '}
                {societe.name}, non déduite du net. Déclaration Urssaf : {trimestre.label}, avant le{' '}
                {formatDate(trimestre.echeance)}.
              </Text>
            </>
          )}
          {!auteur && (
            <Text>
              En cas de retard de paiement, seront exigibles une indemnité calculée sur la base de trois fois le
              taux de l’intérêt légal en vigueur ainsi qu’une indemnité forfaitaire pour frais de recouvrement de
              40 € (art. L441-10 et D441-5 du Code de commerce). Pas d’escompte en cas de paiement anticipé.
            </Text>
          )}
        </View>

        <Text style={s.merci}>Merci pour votre confiance</Text>
        <Text
          style={s.pied}
          render={({ pageNumber, totalPages }) => `${invoice.number} — ${issuer.legal_name} — page ${pageNumber}/${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
