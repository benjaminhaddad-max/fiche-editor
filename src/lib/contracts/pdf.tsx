import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { CorpsContrat } from '@/lib/contracts/modeles'
import type { BrandConfig } from '@/lib/brand'
import { activeBrand } from '@/lib/brand/actif'

export interface Signature {
  nom: string
  email: string
  date: string
  ip: string | null
  reference: string
}

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: '#0e1e35',
    lineHeight: 1.45,
  },
  entete: { marginBottom: 22 },
  societe: { fontSize: 8, letterSpacing: 1, color: '#7d8c9e', fontFamily: 'Helvetica-Bold' },
  titre: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginTop: 8 },
  trait: { width: 54, height: 3, backgroundColor: '#c9a84c', marginTop: 8 },
  profil: { marginTop: 8, color: '#3b4c63' },
  resume: { borderWidth: 1, borderColor: '#e5ddc8', borderRadius: 4, padding: 12, marginBottom: 20 },
  resumeLigne: { marginBottom: 3 },
  article: { marginBottom: 14 },
  articleTitre: { fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  signatures: { marginTop: 24, flexDirection: 'row', gap: 18 },
  case: { flex: 1, borderWidth: 1, borderColor: '#e5ddc8', borderRadius: 4, padding: 12, minHeight: 92 },
  caseLabel: { fontSize: 7.5, letterSpacing: 0.8, color: '#7d8c9e', fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  signe: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: '#0e1e35' },
  preuve: { marginTop: 6, fontSize: 7.5, color: '#7d8c9e', lineHeight: 1.3 },
  pied: {
    position: 'absolute',
    bottom: 28,
    left: 52,
    right: 52,
    fontSize: 7.5,
    color: '#a89e8a',
    borderTopWidth: 1,
    borderTopColor: '#e5ddc8',
    paddingTop: 6,
  },
})

/** Le contrat, prêt à lire et à signer. */
function Contrat({ corps, signature, m }: { corps: CorpsContrat; signature: Signature | null; m: BrandConfig }) {
  return (
    <Document title={corps.intitule} author={m.company.name}>
      <Page size="A4" style={s.page}>
        <View style={s.entete}>
          <Text style={s.societe}>{m.company.name.toUpperCase()}</Text>
          <Text style={s.titre}>{corps.intitule}</Text>
          <View style={s.trait} />
          <Text style={s.profil}>{corps.profil}</Text>
        </View>

        <View style={s.resume}>
          {corps.resume.map((l, i) => (
            <Text key={i} style={s.resumeLigne}>
              • {l}
            </Text>
          ))}
        </View>

        {corps.articles.map((a, i) => (
          <View key={i} style={s.article} wrap={false}>
            <Text style={s.articleTitre}>
              {i + 1}. {a.titre}
            </Text>
            <Text>{a.texte}</Text>
          </View>
        ))}

        <View style={s.signatures} wrap={false}>
          <View style={s.case}>
            <Text style={s.caseLabel}>POUR {m.company.name.toUpperCase()}</Text>
            <Text style={s.signe}>{m.company.name}</Text>
            <Text style={s.preuve}>Contrat émis depuis {m.appTitle}.</Text>
          </View>
          <View style={s.case}>
            <Text style={s.caseLabel}>LE PRESTATAIRE</Text>
            {signature ? (
              <>
                <Text style={s.signe}>{signature.nom}</Text>
                <Text style={s.preuve}>
                  Signé électroniquement le {signature.date}.{'\n'}
                  {signature.email}
                  {signature.ip ? `\nAdresse IP : ${signature.ip}` : ''}
                  {'\n'}Référence : {signature.reference}
                </Text>
              </>
            ) : (
              <Text style={s.preuve}>
                À signer en ligne depuis le lien reçu par email. La signature vaut acceptation de l’ensemble des
                articles ci-dessus.
              </Text>
            )}
          </View>
        </View>

        <Text style={s.pied} fixed>
          {m.company.name} — {m.company.address}, {m.company.postalCode} {m.company.city} — SIRET {m.company.siret}
          {signature ? ` · Document signé, référence ${signature.reference}` : ' · Projet de contrat, non signé'}
        </Text>
      </Page>
    </Document>
  )
}

export function renderContratPdf(corps: CorpsContrat, signature: Signature | null, m: BrandConfig): Promise<Buffer> {
  return renderToBuffer(<Contrat corps={corps} signature={signature} m={m} />)
}
