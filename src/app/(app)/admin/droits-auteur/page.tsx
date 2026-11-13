import Link from 'next/link'
import { Download } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { notesAuteurs, type NoteAuteur } from '@/lib/invoice/recap-auteurs'
import { trimestre } from '@/lib/invoice/trimestre'
import { fichesAuteursARevoir } from '@/lib/invoice/fiches-a-revoir'
import { STATUT_FICHE_LABEL } from '@/lib/invoice/fiche-da'
import { declarationParAuteur, declarationsDA, historiqueDA } from '@/lib/invoice/declaration-da'
import { A_VALIDER_COMPTABLE, type LigneDeclaration } from '@/lib/invoice/urssaf-da'
import { BoutonDeclaration, ImportHistorique, RetirerImport } from '@/components/admin/UrssafDA'

export const dynamic = 'force-dynamic'

/**
 * Récapitulatif trimestriel des droits d'auteur, pour la déclaration
 * Urssaf artistes-auteurs : ce que Nolwenn reporte, note par note.
 */
export default async function DroitsAuteurPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  await requireRole('admin')
  const { annee: a } = await searchParams
  const annee = /^\d{4}$/.test(a ?? '') ? Number(a) : new Date().getFullYear()
  const [notes, aRevoir, { lignes: parAuteur }, declarations, histo] = await Promise.all([
    notesAuteurs(annee),
    fichesAuteursARevoir(),
    declarationParAuteur(annee),
    declarationsDA(),
    historiqueDA(annee),
  ])
  const somme = <T,>(l: T[], f: (n: T) => number | null) =>
    Math.round(l.reduce((s, n) => s + Number(f(n) ?? 0), 0) * 100) / 100
  const imports = [
    ...histo
      .reduce((m, h) => {
        const i = m.get(h.import_id) ?? { id: h.import_id, fichier: h.fichier, le: h.imported_at, n: 0 }
        i.n++
        return m.set(h.import_id, i)
      }, new Map<string, { id: string; fichier: string | null; le: string; n: number }>())
      .values(),
  ]
  const aValiderAnnee = [...new Set(notes.flatMap((n) => n.aValider))]

  return (
    <>
      <PageHeader
        title="Droits d'auteur"
        description="Ce qui se déclare chaque trimestre à l'Urssaf artistes-auteurs : brut versé, précompte retenu, contribution diffuseur de 1,1 % à la charge de la société."
        actions={
          <a
            href={`/api/droits-auteur?annee=${annee}`}
            title="Une ligne par auteur et par trimestre (Invoice et historique importé)"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cream/30 px-3 py-1.5 text-sm text-cream hover:bg-cream/10"
          >
            <Download className="h-4 w-4" /> Export tableur
          </a>
        }
      />
      {aRevoir.length > 0 && (
        <Card className="mb-5 overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold">Fiches auteurs à reprendre ({aRevoir.length})</h2>
            <p className="text-xs text-ink-soft">
              Ce qui manque pour payer et déclarer, et les justificatifs qui arrivent à échéance (alerte 30 jours avant).
            </p>
          </div>
          <ul className="divide-y divide-line text-sm">
            {aRevoir.map((f) => (
              <li key={f.id} className="flex flex-col gap-1 px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/admin/prestataires/${f.id}`} className="font-medium hover:underline">
                    {f.nom}
                  </Link>
                  <span className="text-xs text-ink-soft">
                    Modèle {f.modele} · {STATUT_FICHE_LABEL[f.statut]}
                  </span>
                </div>
                {f.manques.length > 0 && <p className="text-xs text-amber-700">Il manque : {f.manques.join(', ')}.</p>}
                {f.alertes.map((a) => (
                  <p key={a.texte} className={`text-xs ${a.niveau === 'rouge' ? 'text-red-700' : 'text-amber-700'}`}>
                    {a.texte}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mb-4 text-sm text-ink-soft">
        Année{' '}
        {[annee - 1, annee, annee + 1].map((y) => (
          <Link key={y} href={`?annee=${y}`} className={y === annee ? 'font-semibold underline' : 'ml-2 hover:underline'}>
            {y}
          </Link>
        ))}
        . Le trimestre est celui de la date de versement. Les notes passées par Invoice (depuis le 23 octobre 2026)
        sont calculées ; les droits versés avant se reprennent par l&apos;import de l&apos;historique, en bas de page,
        et restent tels que saisis. Une note pas encore payée est classée au trimestre de sa date d&apos;émission,
        marquée « provisoire ».
      </p>
      {aValiderAnnee.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Seule une œuvre originale (fiches, schémas, QCM, création de contenu) se paie en droits d&apos;auteur. Cette
          année, des notes portent aussi : {aValiderAnnee.join(', ')}. {A_VALIDER_COMPTABLE[0].toUpperCase() + A_VALIDER_COMPTABLE.slice(1)} :
          rien n&apos;est bloqué.
        </p>
      )}
      {([1, 2, 3, 4] as const).map((num) => {
        const t = trimestre(annee, num)
        const liste = notes.filter((n) => n.trimestre.cle === t.cle)
        const auteurs = parAuteur.filter((l) => l.trimestre === t.cle)
        const decl = declarations.get(t.cle)
        return (
          <Card key={t.cle} className="mb-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-semibold">
                  {t.label}{' '}
                  {decl ? (
                    <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                      Déclaré le {formatDate(decl.declared_at.slice(0, 10))}
                    </span>
                  ) : (
                    auteurs.length > 0 && (
                      <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">À déclarer</span>
                    )
                  )}
                </h2>
                <span className="text-xs text-ink-soft">Déclaration avant le {formatDate(t.echeance)}</span>
              </div>
              {auteurs.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/api/droits-auteur?trimestre=${t.cle}`} className="text-xs text-navy underline">
                    Export par auteur
                  </a>
                  <a href={`/api/droits-auteur?trimestre=${t.cle}&vue=notes`} className="text-xs text-navy underline">
                    Export par note
                  </a>
                  <BoutonDeclaration trimestre={t.cle} declare={!!decl} />
                </div>
              )}
            </div>
            {auteurs.length > 0 && <ParAuteur lignes={auteurs} somme={somme} />}
            {liste.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">Aucune note de droits d&apos;auteur dans Invoice.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-ink-soft">
                    <tr>
                      <th className="px-4 py-2">Note</th>
                      <th className="px-4 py-2">Auteur</th>
                      <th className="px-4 py-2">N° sécu</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2 text-right">Brut</th>
                      <th className="px-4 py-2 text-right">Précompte</th>
                      <th className="px-4 py-2 text-right">Net versé</th>
                      <th className="px-4 py-2 text-right">Diffuseur 1,1 %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map((n) => (
                      <tr key={n.id} className="border-t border-line">
                        <td className="px-4 py-2">
                          <Link href={`/admin/factures/${n.id}`} className="hover:underline">
                            {n.numero}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          {n.auteur}
                          {n.aValider.length > 0 && (
                            <span className="block text-xs text-amber-700">
                              {n.aValider.join(', ')} : {A_VALIDER_COMPTABLE}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">{n.secu ?? <span className="text-red-700">manquant</span>}</td>
                        <td className="px-4 py-2">
                          {formatDate(n.date)}
                          {!n.payee && <span className="ml-1 text-xs text-amber-700">provisoire</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{money(n.brut)}</td>
                        <td className="px-4 py-2 text-right" title={n.precompte.map((l) => `${l.libelle} : ${money(l.montant)}`).join('\n')}>
                          {money(n.totalPrecompte)}
                        </td>
                        <td className="px-4 py-2 text-right">{money(n.net)}</td>
                        <td className="px-4 py-2 text-right">{money(n.contribution)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line font-semibold">
                      <td className="px-4 py-2" colSpan={4}>
                        Total {t.cle}
                      </td>
                      <td className="px-4 py-2 text-right">{money(somme(liste, (n) => n.brut))}</td>
                      <td className="px-4 py-2 text-right">{money(somme(liste, (n) => n.totalPrecompte))}</td>
                      <td className="px-4 py-2 text-right">{money(somme(liste, (n) => n.net))}</td>
                      <td className="px-4 py-2 text-right">{money(somme(liste, (n) => n.contribution))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )
      })}
      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold">Historique avant Invoice</h2>
          <p className="text-xs text-ink-soft">
            2025 et T1 à T3 2026 : importez le tableur enregistré en CSV. Les lignes apparaissent dans le trimestre
            de leur versement, marquées « historique ». Un import retiré reste en base, il n&apos;est jamais effacé.
          </p>
        </div>
        <div className="flex flex-col gap-4 px-4 py-3">
          {imports.length > 0 && (
            <ul className="divide-y divide-line text-sm">
              {imports.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {i.fichier ?? 'Import'} · {i.n} ligne(s) en {annee} · importé le {formatDate(i.le.slice(0, 10))}
                  </span>
                  <RetirerImport importId={i.id} />
                </li>
              ))}
            </ul>
          )}
          <ImportHistorique />
        </div>
      </Card>
    </>
  )
}

function ParAuteur({
  lignes,
  somme,
}: {
  lignes: LigneDeclaration[]
  somme: (l: LigneDeclaration[], f: (n: LigneDeclaration) => number | null) => number
}) {
  return (
    <div className="overflow-x-auto border-b border-line">
      <p className="px-4 pt-3 text-xs font-semibold text-navy">Par auteur (à reporter à l&apos;Urssaf)</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-soft">
          <tr>
            <th className="px-4 py-2">Auteur</th>
            <th className="px-4 py-2">N° sécu</th>
            <th className="px-4 py-2">Source</th>
            <th className="px-4 py-2 text-right">Brut</th>
            <th className="px-4 py-2 text-right">Précompte</th>
            <th className="px-4 py-2 text-right">Net versé</th>
            <th className="px-4 py-2 text-right">Diffuseur 1,1 %</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={`${l.source}-${l.secu ?? l.auteur}`} className="border-t border-line">
              <td className="px-4 py-2">
                {l.auteur}
                {l.aValider.length > 0 && (
                  <span className="block text-xs text-amber-700">
                    {l.aValider.join(', ')} : {A_VALIDER_COMPTABLE}
                  </span>
                )}
              </td>
              <td className="px-4 py-2">{l.secu ?? <span className="text-red-700">manquant</span>}</td>
              <td className="px-4 py-2 text-xs text-ink-soft">
                {l.source === 'historique' ? 'historique' : l.provisoire ? 'Invoice, provisoire' : 'Invoice'}
              </td>
              <td className="px-4 py-2 text-right">{l.brut === null ? '—' : money(l.brut)}</td>
              <td
                className="px-4 py-2 text-right"
                title={Object.entries(l.precompte)
                  .map(([k, v]) => `${k} : ${v === null ? '—' : money(v)}`)
                  .join('\n')}
              >
                {l.totalPrecompte === null ? '—' : money(l.totalPrecompte)}
              </td>
              <td className="px-4 py-2 text-right">{l.net === null ? '—' : money(l.net)}</td>
              <td className="px-4 py-2 text-right">{l.contribution === null ? '—' : money(l.contribution)}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-semibold">
            <td className="px-4 py-2" colSpan={3}>
              Total
            </td>
            <td className="px-4 py-2 text-right">{money(somme(lignes, (n) => n.brut))}</td>
            <td className="px-4 py-2 text-right">{money(somme(lignes, (n) => n.totalPrecompte))}</td>
            <td className="px-4 py-2 text-right">{money(somme(lignes, (n) => n.net))}</td>
            <td className="px-4 py-2 text-right">{money(somme(lignes, (n) => n.contribution))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
