import { estLectureConfiguree, lireFacture } from '@/lib/invoice/extract'
import { money } from '@/lib/format'
import type { AiCheck } from '@/lib/types'

/**
 * Lit le PDF et compare son total HT à ce qui était prévu.
 *
 * Le modèle transcrit, il ne décide pas : une lecture impossible ne bloque
 * rien (matches: null), seul un écart constaté arrête la transmission.
 */
export async function controlerMontant(pdf: Buffer, attendu: number): Promise<AiCheck> {
  const base: AiCheck = {
    checked_at: new Date().toISOString(),
    expected_ht: attendu,
    read_ht: null,
    read_number: null,
    matches: null,
    message: null,
  }
  if (!estLectureConfiguree()) return { ...base, message: 'Contrôle automatique indisponible.' }
  try {
    const lu = await lireFacture(pdf)
    const somme = lu.lignes.reduce((s, l) => s + Number(l.total_ht), 0)
    const total = lu.total_ht_annonce ?? (lu.lignes.length ? Math.round(somme * 100) / 100 : null)
    if (total === null) {
      return { ...base, read_number: lu.numero, message: lu.avertissement ?? 'Montant illisible sur le document.' }
    }
    const ecart = Math.abs(total - attendu)
    const ok = ecart < 0.01
    return {
      ...base,
      read_ht: total,
      read_number: lu.numero,
      matches: ok,
      message: ok
        ? null
        : `Attention, le montant ne correspond pas : votre facture indique ${money(total)} HT, alors que ${money(attendu)} HT étaient prévus (écart de ${money(ecart)}).`,
    }
  } catch (err) {
    console.error('[controlerMontant]', err)
    return { ...base, message: 'Le document n’a pas pu être lu automatiquement.' }
  }
}
