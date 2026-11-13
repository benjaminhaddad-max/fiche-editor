import { createServiceClient } from '@/lib/supabase/service'
import { activeBrandId } from '@/lib/brand/actif'
import { lignesPrecompte, modeleDeLaNote, netAuteur, type ProfilDA } from '@/lib/invoice/net-auteur'
import { trimestreDe, type Trimestre } from '@/lib/invoice/trimestre'
import { round2 } from '@/lib/format'

/**
 * Ce que Nolwenn reporte à l'Urssaf artistes-auteurs, trimestre par
 * trimestre : pour chaque note, le brut, le détail du précompte, le net
 * versé et la contribution diffuseur.
 *
 * Classé par date de versement. Une note pas encore payée apparaît, marquée
 * « provisoire », au trimestre de sa date : elle changera peut-être de
 * trimestre le jour où elle sera payée.
 *
 * Seulement ce qui est passé par Invoice, c'est-à-dire depuis le 23 octobre
 * 2026. Les droits versés avant ne sont pas ici.
 */
export interface NoteAuteur {
  id: string
  numero: string
  auteur: string
  secu: string | null
  date: string
  payee: boolean
  statut: string
  trimestre: Trimestre
  brut: number
  precompte: { libelle: string; montant: number }[]
  totalPrecompte: number
  net: number | null
  contribution: number
}

export async function notesAuteurs(annee: number): Promise<NoteAuteur[]> {
  const db = createServiceClient()
  const { data } = await db
    .from('inv_invoices')
    .select(
      `id, number, status, issue_date, paid_at, subtotal_ht, da_model, pdf_path,
       provider:inv_providers!inner(legal_name, employment_type, social_security_number, da_model, tax_residence_country, a1_number, a1_start, a1_end),
       missions:inv_missions!inv_missions_invoice_id_fkey(total_ht, pay_basis),
       lignes:inv_invoice_lines(total_ht, mission_id)`
    )
    .eq('brand', await activeBrandId())
    .eq('provider.employment_type', 'droits_auteur')
    .in('status', ['sent', 'validated', 'paid'])
    .order('issue_date')

  type Row = {
    id: string
    number: string
    status: string
    issue_date: string
    paid_at: string | null
    subtotal_ht: number
    da_model: string | null
    pdf_path: string | null
    provider: ({ legal_name: string; social_security_number: string | null } & ProfilDA) | null
    missions: { total_ht: number; pay_basis: string | null }[]
    lignes: { total_ht: number; mission_id: string | null }[]
  }

  return ((data ?? []) as unknown as Row[])
    .map((r) => {
      const date = (r.paid_at ?? r.issue_date).slice(0, 10)
      // Le modèle figé sur la note (2, 3 ou 4) ; à défaut, celui de la fiche.
      const modele = modeleDeLaNote(r, r.provider).modele
      const calc = netAuteur([
        ...(r.missions ?? []),
        ...(r.lignes ?? [])
          .filter((l) => !l.mission_id)
          .map((l) => ({ total_ht: Number(l.total_ht), pay_basis: 'brut' })),
      ], modele)
      // Toujours les quatre lignes du modèle 2 (zéro quand le modèle n'en a pas) :
      // les colonnes de l'export restent alignées d'une note à l'autre.
      const precompte = lignesPrecompte(2).map((l) => ({
        libelle: l.libelle,
        montant: calc.precompte.find((x) => x.libelle === l.libelle)?.montant ?? 0,
      }))
      return {
        id: r.id,
        numero: r.number,
        auteur: r.provider?.legal_name ?? '—',
        secu: r.provider?.social_security_number?.trim() || null,
        date,
        payee: r.status === 'paid',
        statut: r.status,
        trimestre: trimestreDe(date),
        brut: calc.brutTotal,
        precompte,
        totalPrecompte: round2(precompte.reduce((s, l) => s + l.montant, 0)),
        net: calc.net,
        contribution: calc.contributionDiffuseur,
      }
    })
    .filter((n) => n.trimestre.annee === annee)
}

const csvCell = (v: string | number | null) => {
  const t = v === null ? '' : typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Export pour le tableur : séparateur « ; » et virgule décimale, comme Excel en français. */
export function notesEnCsv(notes: NoteAuteur[]): string {
  const libelles = notes[0]?.precompte.map((l) => l.libelle) ?? []
  const entete = [
    'Trimestre',
    'Date de versement',
    'Statut',
    'N° note',
    'Auteur',
    'N° sécurité sociale',
    'Brut',
    ...libelles,
    'Total précompte',
    'Net versé',
    'Contribution diffuseur 1,1 %',
  ]
  const lignes = notes.map((n) => [
    n.trimestre.cle,
    n.date,
    n.payee ? 'payée' : 'provisoire (non payée)',
    n.numero,
    n.auteur,
    n.secu,
    n.brut,
    ...n.precompte.map((l) => l.montant),
    n.totalPrecompte,
    n.net,
    n.contribution,
  ])
  return '﻿' + [entete, ...lignes].map((l) => l.map(csvCell).join(';')).join('\n')
}
