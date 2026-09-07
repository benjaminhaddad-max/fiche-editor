import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer'
import { formatDate, formatPeriod, money } from '@/lib/format'
import { PRICING_UNIT } from '@/lib/labels'
import { COMPANY, type Invoice, type InvoiceLine } from '@/lib/types'

// Helvetica est embarquee dans @react-pdf : pas d'appel reseau au rendu.
const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 44,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#0e1e35',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#0e1e35' },
  accent: { width: 54, height: 3, backgroundColor: '#c9a84c', marginTop: 6 },
  invoiceNumber: { fontSize: 11, marginTop: 4, color: '#3b4c63' },
  headerRight: { alignItems: 'flex-end' },
  metaRow: { flexDirection: 'row', marginTop: 2 },
  metaLabel: { color: '#7d8c9e', width: 78, textAlign: 'right', marginRight: 6 },
  metaValue: { fontFamily: 'Helvetica-Bold' },

  parties: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5ddc8',
    borderRadius: 4,
    padding: 12,
  },
  partyLabel: {
    fontSize: 7.5,
    letterSpacing: 0.8,
    color: '#7d8c9e',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  partyName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  partyLine: { color: '#3b4c63', lineHeight: 1.15 },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#0e1e35',
    color: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5ddc8',
  },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 62, textAlign: 'right' },
  colUnit: { width: 68, textAlign: 'right' },
  colTotal: { width: 74, textAlign: 'right' },
  lineDesc: { fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  lineMeta: { fontSize: 7.5, color: '#7d8c9e' },

  totals: { marginTop: 18, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 230 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 6,
    backgroundColor: '#0e1e35',
    color: '#ffffff',
    borderRadius: 4,
  },
  totalGrandText: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    color: '#0e1e35',
    marginBottom: 5,
  },
  note: { color: '#3b4c63', lineHeight: 1.6 },
  mentions: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5ddc8',
    fontSize: 7.5,
    color: '#7d8c9e',
    lineHeight: 1.6,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    textAlign: 'center',
    fontSize: 7.5,
    color: '#a89e8a',
  },
})

function Address({ lines }: { lines: (string | null | undefined)[] }) {
  return (
    <>
      {lines
        .filter((l): l is string => Boolean(l && l.trim()))
        .map((line, i) => (
          <Text key={i} style={styles.partyLine}>
            {line}
          </Text>
        ))}
    </>
  )
}

export function InvoiceDocument({
  invoice,
  lines,
}: {
  invoice: Invoice
  lines: InvoiceLine[]
}) {
  const issuer = invoice.issuer_snapshot
  const isFranchise = issuer.vat_regime === 'franchise'

  return (
    <Document
      title={`Facture ${invoice.number}`}
      author={issuer.legal_name}
      subject={`Facture ${invoice.number} — ${COMPANY.name}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>FACTURE</Text>
            <View style={styles.accent} />
            <Text style={styles.invoiceNumber}>N° {invoice.number}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date d&apos;émission</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.issue_date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Échéance</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.due_date)}</Text>
            </View>
            {invoice.period_start && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Période</Text>
                <Text style={styles.metaValue}>
                  {formatPeriod(invoice.period_start, invoice.period_end)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>ÉMETTEUR</Text>
            <Text style={styles.partyName}>{issuer.legal_name}</Text>
            <Address
              lines={[
                issuer.legal_form,
                issuer.address_line1,
                issuer.address_line2,
                [issuer.postal_code, issuer.city].filter(Boolean).join(' '),
                issuer.country,
                issuer.siret ? `SIRET : ${issuer.siret}` : null,
                issuer.vat_number ? `TVA : ${issuer.vat_number}` : null,
                issuer.email,
                issuer.phone,
              ]}
            />
          </View>

          <View style={styles.party}>
            <Text style={styles.partyLabel}>FACTURÉ À</Text>
            <Text style={styles.partyName}>{COMPANY.name}</Text>
            <Address
              lines={[
                COMPANY.legalForm,
                COMPANY.address,
                [COMPANY.postalCode, COMPANY.city].filter(Boolean).join(' '),
                COMPANY.siret ? `SIRET : ${COMPANY.siret}` : null,
                COMPANY.vatNumber ? `TVA : ${COMPANY.vatNumber}` : null,
              ]}
            />
          </View>
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.colDesc}>DÉSIGNATION</Text>
          <Text style={styles.colQty}>QUANTITÉ</Text>
          <Text style={styles.colUnit}>PRIX UNIT. HT</Text>
          <Text style={styles.colTotal}>TOTAL HT</Text>
        </View>

        {lines.map((line) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <View style={styles.colDesc}>
              <Text style={styles.lineDesc}>{line.description}</Text>
              <Text style={styles.lineMeta}>
                {line.category_name}
                {line.period_label ? ` · ${line.period_label}` : ''}
              </Text>
            </View>
            <Text style={styles.colQty}>
              {Number(line.quantity)} {PRICING_UNIT[line.pricing_type]}
            </Text>
            <Text style={styles.colUnit}>{money(line.unit_amount_ht)}</Text>
            <Text style={styles.colTotal}>{money(line.total_ht)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text>Total HT</Text>
              <Text>{money(invoice.subtotal_ht)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>
                TVA {isFranchise ? '' : `(${Number(invoice.vat_rate)} %)`}
              </Text>
              <Text>{isFranchise ? '—' : money(invoice.vat_amount)}</Text>
            </View>
            <View style={styles.totalGrand}>
              <Text style={styles.totalGrandText}>NET À PAYER</Text>
              <Text style={styles.totalGrandText}>{money(invoice.total_ttc)}</Text>
            </View>
          </View>
        </View>

        {(issuer.iban || issuer.bic) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>RÈGLEMENT PAR VIREMENT</Text>
            {issuer.iban && <Text style={styles.note}>IBAN : {issuer.iban}</Text>}
            {issuer.bic && <Text style={styles.note}>BIC : {issuer.bic}</Text>}
          </View>
        )}

        <View style={styles.mentions}>
          {isFranchise && (
            <Text>TVA non applicable, article 293 B du Code général des impôts.</Text>
          )}
          <Text>
            Paiement à réception, au plus tard le {formatDate(invoice.due_date)}. En cas
            de retard de paiement, application de pénalités au taux de trois fois le taux
            d&apos;intérêt légal, ainsi qu&apos;une indemnité forfaitaire pour frais de
            recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce).
          </Text>
          <Text>Pas d&apos;escompte pour paiement anticipé.</Text>
        </View>

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Facture ${invoice.number} — ${issuer.legal_name} — page ${pageNumber}/${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  )
}

export async function renderInvoicePdf(
  invoice: Invoice,
  lines: InvoiceLine[]
): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument invoice={invoice} lines={lines} />)
}
