import Link from 'next/link'
import { Download } from 'lucide-react'
import { Card, PageHeader } from '@/components/ui/Page'
import { requireRole } from '@/lib/auth'
import { formatDate, money } from '@/lib/format'
import { notesAuteurs, type NoteAuteur } from '@/lib/invoice/recap-auteurs'
import { trimestre } from '@/lib/invoice/trimestre'
import { fichesAuteursARevoir } from '@/lib/invoice/fiches-a-revoir'
import { STATUT_FICHE_LABEL } from '@/lib/invoice/fiche-da'

export const dynamic = 'force-dynamic'

/**
 * Récapitulatif trimestriel des droits d'auteur, pour la déclaration
 * Urssaf artistes-auteurs : ce que Nolwenn reporte, note par note.
 */
export default async function DroitsAuteurPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  await requireRole('admin')
  const { annee: a } = await searchParams
  const annee = /^\d{4}$/.test(a ?? '') ? Number(a) : new Date().getFullYear()
  const [notes, aRevoir] = await Promise.all([notesAuteurs(annee), fichesAuteursARevoir()])
  const somme = (l: NoteAuteur[], f: (n: NoteAuteur) => number | null) =>
    Math.round(l.reduce((s, n) => s + Number(f(n) ?? 0), 0) * 100) / 100

  return (
    <>
      <PageHeader
        title="Droits d'auteur"
        description="Ce qui se déclare chaque trimestre à l'Urssaf artistes-auteurs : brut versé, précompte retenu, contribution diffuseur de 1,1 % à la charge de la société."
        actions={
          <a
            href={`/api/droits-auteur?annee=${annee}`}
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
        . Seules les notes passées par Invoice (depuis le 23 octobre 2026) apparaissent : les droits versés avant
        se reprennent depuis la banque ou la comptabilité. Une note pas encore payée est classée au trimestre de sa
        date d'émission, marquée « provisoire ».
      </p>
      {([1, 2, 3, 4] as const).map((num) => {
        const t = trimestre(annee, num)
        const liste = notes.filter((n) => n.trimestre.cle === t.cle)
        return (
          <Card key={t.cle} className="mb-5 overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-semibold">{t.label}</h2>
              <span className="text-sm text-ink-soft">Déclaration avant le {formatDate(t.echeance)}</span>
            </div>
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
                        <td className="px-4 py-2">{n.auteur}</td>
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
    </>
  )
}
