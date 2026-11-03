import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatDate, money } from '@/lib/format'
import { PRECOMPTE_AUTEUR } from '@/lib/invoice/net-auteur'
import { BRANDS } from '@/lib/brand/config'
import { mentionTva, societeDe, type Invoice, type InvoiceLine } from '@/lib/types'
import type { AuteurPdf } from '@/lib/invoice/pdf'

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
 *  - l'auteur est payé en droits : brut, précompte, puis net à payer, avec
 *    son numéro de sécurité sociale que Nolwenn reporte à l'Urssaf.
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
  totalFinal: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingVertical: 6, paddingHorizontal: 6, backgroundColor: p.dark, color: '#ffffff' },
  totalFinalTexte: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  note: { color: '#4a4560', lineHeight: 1.5, marginTop: 2 },
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

/** Le montant versé d'une ligne d'auteur, tel que l'onglet factures le compte. */
function verseLigne(line: InvoiceLine, auteur: AuteurPdf): number | null {
  const base = line.mission_id ? auteur.bases[line.mission_id] : null
  if (base === 'net') return Number(line.total_ht)
  if (base === 'brut') return Math.round(Number(line.total_ht) * (1 - PRECOMPTE_AUTEUR) * 100) / 100
  return null
}

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
  const brut = Number(invoice.subtotal_ht)
  const precompte = auteur?.net != null ? Math.round((brut - auteur.net) * 100) / 100 : null

  return (
    <Document
      title={`${auteur ? 'Relevé de droits d’auteur' : 'Facture'} ${invoice.number}`}
      author={issuer.legal_name}
      subject={`${invoice.number} — ${societe.name}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.haut}>
          <View>
            <Text style={s.titre}>
              {auteur ? `RELEVÉ PAIEMENT N° ${invoice.number}` : `FACTURE N° ${invoice.number}`}
            </Text>
            {auteur && <Text style={s.sousTitre}>FACTURE DROITS D’AUTEUR</Text>}
            <View style={s.bandeau} />
            <Text style={s.date}>Date : {formatDate(invoice.issue_date)}</Text>
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

        <View style={s.tete}>
          <Text style={[s.teteTexte, s.cActivite]}>Activité</Text>
          <Text style={[s.teteTexte, s.cDesc]}>Description</Text>
          <Text style={[s.teteTexte, s.cUnit]}>Montant unitaire</Text>
          <Text style={[s.teteTexte, s.cQte]}>Quantité</Text>
          <Text style={[s.teteTexte, s.cMontant]}>{auteur ? 'Montant brut' : 'Montant total'}</Text>
          {auteur && <Text style={[s.teteTexte, s.cMontant]}>Montant versé</Text>}
        </View>
        {lines.map((line) => {
          const verse = auteur ? verseLigne(line, auteur) : null
          return (
            <View key={line.id} style={s.rang} wrap={false}>
              <Text style={s.cActivite}>{line.category_name}</Text>
              <Text style={s.cDesc}>
                {line.description}
                {line.period_label ? ` (${line.period_label})` : ''}
              </Text>
              <Text style={s.cUnit}>{money(line.unit_amount_ht)}</Text>
              <Text style={s.cQte}>{Number(line.quantity)}</Text>
              <Text style={s.cMontant}>{money(line.total_ht)}</Text>
              {auteur && <Text style={s.cMontant}>{verse === null ? 'à vérifier' : money(verse)}</Text>}
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
                <View style={s.totalRang}>
                  <Text>Précompte de {Math.round(PRECOMPTE_AUTEUR * 100)} %</Text>
                  <Text>{precompte === null ? 'à vérifier' : `− ${money(precompte)}`}</Text>
                </View>
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
          {auteur && auteur.sansBase > 0 && (
            <Text>
              {money(auteur.sansBase)} de lignes sans base brut ou net : le net à payer est à vérifier avant le
              virement.
            </Text>
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
