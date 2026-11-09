import { activeBrand, activeBrandId } from '@/lib/brand/actif'
import { createServiceClient } from '@/lib/supabase/service'

/** Une facture acceptée qui n'a pas pu partir en comptabilité. */
export interface FactureBloquee {
  id: string
  number: string
  prestataire: string
  total: number
  motif: string
  depuis: string | null
  /** Partie dans Pennylane, mais avec un point à vérifier (catégorie devinée, SIRET douteux). */
  partie: boolean
}

/**
 * Les factures validées que Pennylane n'a pas reçues.
 *
 * Une facture validée part en comptabilité, et c'est là qu'on la paie. Quand
 * l'envoi échoue, elle reste « validée » ici — donc l'air réglée — et
 * absente là-bas, donc jamais payée. En novembre 2026, sept factures
 * d'octobre ont dormi ainsi une semaine (catégories sans id_pennylane, un
 * SIRET en double) : Yasmine attendait son virement du 3, personne ne
 * savait qu'il ne partirait pas. On les sort donc partout où l'on regarde.
 *
 * Seulement pour une école qui tient sa comptabilité ici : ailleurs, aucune
 * facture n'a à partir dans Pennylane.
 */
export async function facturesBloquees(): Promise<FactureBloquee[]> {
  if (!(await activeBrand()).comptabilite) return []
  const { data } = await createServiceClient()
    .from('inv_invoices')
    .select('id, number, total_ttc, pennylane_status, pennylane_error, validated_at, provider:inv_providers(legal_name)')
    .eq('brand', await activeBrandId())
    .in('status', ['sent', 'validated'])
    // Bloquées, ou parties avec un avertissement : une catégorie devinée ne
    // bloque plus l'envoi, mais elle doit se voir.
    .or('pennylane_status.eq.error,and(pennylane_status.eq.synced,pennylane_error.not.is.null)')
    .order('validated_at', { ascending: true })

  return ((data ?? []) as unknown as {
    id: string
    number: string
    total_ttc: number
    pennylane_status: string
    pennylane_error: string | null
    validated_at: string | null
    provider: { legal_name: string } | null
  }[]).map((f) => ({
    id: f.id,
    number: f.number,
    prestataire: f.provider?.legal_name ?? '—',
    total: Number(f.total_ttc),
    motif: f.pennylane_error ?? 'Erreur inconnue',
    depuis: f.validated_at,
    partie: f.pennylane_status === 'synced',
  }))
}
