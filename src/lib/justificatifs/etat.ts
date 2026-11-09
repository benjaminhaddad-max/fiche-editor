import { createServiceClient } from '@/lib/supabase/service'
import { activeBrand, activeBrandId } from '@/lib/brand/actif'
import { formatDate, money, round2 } from '@/lib/format'
import { deliver } from '@/lib/email/notify'
import { isPennylaneConfigured } from '@/lib/pennylane/client'
import { emetteur, lireMouvements, type Mouvement } from '@/lib/pennylane/depenses'
import { lireReglages } from '@/lib/justificatifs/reglages'

/** Les paiements d'un même émetteur restés sans pièce. */
export interface ManquantsFournisseur {
  cle: string
  nombre: number
  total: number
  /** Qui tient la carte, pour savoir à qui demander en interne. */
  porteurs: string[]
  lignes: { date: string; montant: number; libelle: string }[]
}

/** Un émetteur qui manque mois après mois : c'est chez lui qu'il faut aller chercher les reçus. */
export interface Recurrent {
  cle: string
  /** Sur combien des trois derniers mois il manque. */
  mois: number
  nombre: number
  total: number
}

export interface EtatJustificatifs {
  mois: string
  calculeLe: string
  mouvements: number
  manquants: number
  montantManquant: number
  rattachesAuto: number
  rattachesMain: number
  recusARattacher: number
  parFournisseur: ManquantsFournisseur[]
  recurrents: Recurrent[]
}

const bornes = (mois: string) => {
  const [an, m] = mois.split('-').map(Number)
  return { debut: `${mois}-01`, fin: new Date(Date.UTC(an, m, 0)).toISOString().slice(0, 10) }
}

export const moisPrecedent = (mois: string, n = 1) => {
  const [an, m] = mois.split('-').map(Number)
  return new Date(Date.UTC(an, m - 1 - n, 1)).toISOString().slice(0, 7)
}

/** Les justificatifs manquants d'une liste de mouvements, regroupés par émetteur. */
export function manquantsParFournisseur(
  lignes: (Pick<Mouvement, 'date' | 'libelle' | 'montant' | 'justificatifManquant'> & { porteur?: string | null })[]
): ManquantsFournisseur[] {
  const map = new Map<string, ManquantsFournisseur>()
  for (const l of lignes.filter((x) => x.justificatifManquant)) {
    const k = emetteur(l.libelle)
    const c = map.get(k) ?? { cle: k, nombre: 0, total: 0, porteurs: [], lignes: [] }
    c.nombre++
    c.total = round2(c.total + l.montant)
    if (l.porteur && !c.porteurs.includes(l.porteur)) c.porteurs.push(l.porteur)
    c.lignes.push({ date: l.date, montant: l.montant, libelle: l.libelle })
    map.set(k, c)
  }
  return [...map.values()]
    .map((c) => ({ ...c, lignes: c.lignes.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.nombre - a.nombre || b.total - a.total)
}

/**
 * Le texte de relance pour un émetteur, prêt à copier.
 *
 * Il demande les pièces du mois, et surtout qu'elles arrivent désormais
 * d'elles-mêmes à la boîte de dépôt : une relance qui ne change pas
 * l'adresse de facturation revient le mois suivant.
 */
export function texteRelance(f: ManquantsFournisseur, libelleMois: string, adresse: string | null, societe: string): string {
  const MAX = 25
  const detail = f.lignes
    .slice(0, MAX)
    .map((l) => `- ${formatDate(l.date)} : ${money(l.montant)} (« ${l.libelle} »)`)
    .join('\n')
  const reste = f.lignes.length - MAX
  const suite = reste > 0 ? `\n- … et ${reste} autre${reste > 1 ? 's' : ''} paiement${reste > 1 ? 's' : ''}` : ''
  return [
    'Bonjour,',
    '',
    `Pour la comptabilité de ${societe}, il nous manque les factures ou reçus de ${f.nombre} paiement${f.nombre > 1 ? 's' : ''} ${f.nombre > 1 ? 'réglés' : 'réglé'} en ${libelleMois} (${money(f.total)} au total) :`,
    detail + suite,
    '',
    adresse
      ? `Pourriez-vous nous les transmettre à ${adresse} ? Et pour les mois à venir, merci d’ajouter cette adresse comme adresse de facturation : vos factures nous arriveront directement.`
      : 'Pourriez-vous nous les transmettre ?',
    '',
    'Merci d’avance,',
    societe,
  ].join('\n')
}

/**
 * L'état des justificatifs d'un mois, tel que le comptable le lirait.
 *
 * Calculé le 5 du mois suivant par la tâche quotidienne, et à la demande
 * depuis l'écran Dépenses. Les fournisseurs récurrents regardent trois mois :
 * un oubli isolé se relance, un émetteur qui manque tous les mois se règle
 * une fois pour toutes en changeant son adresse de facturation.
 */
export async function calculerEtat(mois: string): Promise<EtatJustificatifs | null> {
  if (!(await isPennylaneConfigured()) || !(await activeBrand()).comptabilite) return null
  const db = createServiceClient()
  const brand = await activeBrandId()

  const parMois: Mouvement[][] = []
  for (const m of [mois, moisPrecedent(mois, 1), moisPrecedent(mois, 2)]) {
    const { debut, fin } = bornes(m)
    parMois.push(await lireMouvements(debut, fin, { cache: 0 }))
  }
  const lignes = parMois[0]

  const recurrents = new Map<string, Recurrent>()
  parMois.forEach((liste) => {
    for (const f of manquantsParFournisseur(liste)) {
      const r = recurrents.get(f.cle) ?? { cle: f.cle, mois: 0, nombre: 0, total: 0 }
      recurrents.set(f.cle, { ...r, mois: r.mois + 1, nombre: r.nombre + f.nombre, total: round2(r.total + f.total) })
    }
  })

  const { debut, fin } = bornes(mois)
  const { data: rattaches } = await db
    .from('inv_justificatifs')
    .select('rattache_par')
    .eq('brand', brand)
    .eq('statut', 'rattache')
    .gte('transaction_date', debut)
    .lte('transaction_date', fin)
  const { count: enAttente } = await db
    .from('inv_justificatifs')
    .select('id', { count: 'exact', head: true })
    .eq('brand', brand)
    .eq('statut', 'a_rattacher')

  const manquants = lignes.filter((l) => l.justificatifManquant)
  const etat: EtatJustificatifs = {
    mois,
    calculeLe: new Date().toISOString(),
    mouvements: lignes.length,
    manquants: manquants.length,
    montantManquant: round2(manquants.reduce((s, l) => s + l.montant, 0)),
    rattachesAuto: (rattaches ?? []).filter((r) => r.rattache_par === 'auto').length,
    rattachesMain: (rattaches ?? []).filter((r) => r.rattache_par !== 'auto').length,
    recusARattacher: enAttente ?? 0,
    // Le détail est borné : Anthropic seul compte cent quatre-vingts lignes.
    parFournisseur: manquantsParFournisseur(lignes).map((f) => ({ ...f, lignes: f.lignes.slice(0, 60) })),
    recurrents: [...recurrents.values()]
      .filter((r) => r.mois >= 2)
      // Ben : « les plus récurrents, là où il y a le plus de débit ».
      .sort((a, b) => b.total - a.total || b.nombre - a.nombre)
      .slice(0, 40),
  }

  await db.from('inv_etats_justificatifs').upsert({ brand, mois, calcule_le: etat.calculeLe, donnees: etat })
  return etat
}

export async function lireEtat(mois: string): Promise<{ etat: EtatJustificatifs; envoyeLe: string | null; envoyeA: string | null } | null> {
  const { data } = await createServiceClient()
    .from('inv_etats_justificatifs')
    .select('donnees, envoye_le, envoye_a')
    .eq('brand', await activeBrandId())
    .eq('mois', mois)
    .maybeSingle()
  if (!data) return null
  return { etat: data.donnees as EtatJustificatifs, envoyeLe: data.envoye_le, envoyeA: data.envoye_a }
}

/** Le dernier état calculé, quel que soit son mois : il porte les fournisseurs récurrents. */
export async function dernierEtat(): Promise<EtatJustificatifs | null> {
  const { data } = await createServiceClient()
    .from('inv_etats_justificatifs')
    .select('donnees')
    .eq('brand', await activeBrandId())
    .order('mois', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.donnees as EtatJustificatifs | undefined) ?? null
}

/**
 * Envoie l'état au comptable — seulement si Ben l'a allumé et a donné une
 * adresse. Éteint, on le dit dans le compte rendu de la tâche, sans rien
 * envoyer.
 */
export async function envoyerEtat(etat: EtatJustificatifs, libelleMois: string): Promise<Record<string, unknown>> {
  const r = await lireReglages()
  const a = r.destinataireEtat.trim()
  if (!r.envoiEtat || !a) return { envoye: false, raison: 'envoi éteint' }
  const marque = await activeBrand()
  const lignes = etat.parFournisseur
    .slice(0, 30)
    .map((f) => `<tr><td>${f.cle}</td><td style="text-align:right">${f.nombre}</td><td style="text-align:right">${money(f.total)}</td></tr>`)
    .join('')
  await deliver({
    to: { email: a },
    subject: `Justificatifs ${libelleMois} — ${etat.manquants} manquant${etat.manquants > 1 ? 's' : ''}`,
    html:
      `<p>Bonjour,</p><p>Voici l’état des justificatifs de ${libelleMois} pour ${marque.name} :</p>` +
      `<ul><li>${etat.mouvements} mouvement(s) sortant(s)</li>` +
      `<li>${etat.manquants} justificatif(s) manquant(s), pour ${money(etat.montantManquant)}</li>` +
      `<li>${etat.rattachesAuto} reçu(s) rattaché(s) automatiquement, ${etat.rattachesMain} à la main</li></ul>` +
      `<table cellpadding="4" style="border-collapse:collapse"><tr><th align="left">Émetteur</th><th>Paiements</th><th>Montant</th></tr>${lignes}</table>`,
    template: 'etat_justificatifs',
  })
  await createServiceClient()
    .from('inv_etats_justificatifs')
    .update({ envoye_le: new Date().toISOString(), envoye_a: a })
    .eq('brand', await activeBrandId())
    .eq('mois', etat.mois)
  return { envoye: true, a }
}

/**
 * Les fournisseurs à aller chercher en premier : ceux qui reviennent au
 * moins deux mois sur trois sans justificatif, du plus gros débit au plus
 * petit.
 *
 * On reprend le dernier état s'il a moins de quarante jours ; sinon on le
 * calcule sur les trois derniers mois — c'est ce qui arrive avant le
 * premier 5 du mois.
 */
export async function fournisseursPrioritaires(): Promise<Recurrent[]> {
  const dernier = await dernierEtat()
  if (dernier && Date.now() - Date.parse(dernier.calculeLe) < 40 * 86_400_000) return dernier.recurrents
  const mois = moisPrecedent(new Date().toISOString().slice(0, 7))
  return (await calculerEtat(mois))?.recurrents ?? []
}
