import { inflateRawSync } from 'node:zlib'

/**
 * Lire la liste des salariés exportée de Silae (§3, phase 1) : un .xlsx ou
 * un .csv, avec au moins une colonne « Matricule » et le nom. Les colonnes
 * facultatives — prénom, email, type de contrat, dates d'entrée et de
 * sortie — sont reprises quand elles existent.
 *
 * Pas de dépendance : un .xlsx est un zip de XML, on en lit la première
 * feuille. Le .xls 97-2003 n'est pas lu ; il suffit de l'enregistrer en
 * .xlsx ou en .csv.
 */

export type Cellule = string | number | null

/** Les fichiers d'un zip, par nom. */
function dezipper(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  let fin = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('Fichier illisible : ce n’est pas un .xlsx.')
  const nb = buf.readUInt16LE(fin + 10)
  let p = buf.readUInt32LE(fin + 16)
  for (let k = 0; k < nb; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const methode = buf.readUInt16LE(p + 10)
    const taille = buf.readUInt32LE(p + 20)
    const lnom = buf.readUInt16LE(p + 28)
    const lextra = buf.readUInt16LE(p + 30)
    const lcom = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nom = buf.subarray(p + 46, p + 46 + lnom).toString('utf8')
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const brut = buf.subarray(debut, debut + taille)
    out.set(nom, methode === 8 ? inflateRawSync(brut) : brut)
    p += 46 + lnom + lextra + lcom
  }
  return out
}

const entites = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&')

const textes = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => entites(m[1])).join('')

/** Index de colonne d'une référence « AB12 ». */
function colonne(ref: string): number {
  const lettres = ref.replace(/\d+/g, '')
  let n = 0
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

export function lireXlsx(buf: Buffer): Cellule[][] {
  const zip = dezipper(buf)
  const partages = zip.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  const chaines = [...partages.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textes(m[1]))
  const nomFeuille =
    [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0]
  if (!nomFeuille) throw new Error('Aucune feuille dans ce fichier.')
  const xml = zip.get(nomFeuille)!.toString('utf8')
  const lignes: Cellule[][] = []
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const ligne: Cellule[] = []
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const corps = c[2] ?? ''
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
      const type = attrs.match(/t="(\w+)"/)?.[1]
      const v = corps.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let val: Cellule = null
      if (type === 's' && v !== undefined) val = chaines[Number(v)] ?? ''
      else if (type === 'inlineStr') val = textes(corps)
      else if (type === 'str') val = v !== undefined ? entites(v) : null
      else if (v !== undefined) val = Number(v)
      ligne[ref ? colonne(ref) : ligne.length] = val
    }
    lignes.push(Array.from(ligne, (x) => x ?? null))
  }
  return lignes
}

export function lireCsv(texte: string): Cellule[][] {
  const t = texte.replace(/^﻿/, '')
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) >= (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const lignes: Cellule[][] = []
  let ligne: Cellule[] = []
  let champ = ''
  let guillemets = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') guillemets = false
      else champ += c
    } else if (c === '"') guillemets = true
    else if (c === sep) {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else champ += c
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return lignes.map((l) => l.map((x) => (x === '' ? null : x)))
}

export interface LigneImport {
  matricule: string
  nom: string
  email: string | null
  profil: 'fixe' | 'alternant' | 'vacataire' | null
  entree: string | null
  sortie: string | null
}

const norme = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Une date Excel (numéro de série) ou « JJ/MM/AAAA » ou « AAAA-MM-JJ ». */
function date(v: Cellule): string | null {
  if (v === null || v === '') return null
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function profilDuTexte(v: Cellule): LigneImport['profil'] {
  const t = norme(String(v ?? ''))
  if (!t) return null
  if (/altern|apprenti|professionnalisation/.test(t)) return 'alternant'
  if (/vacat/.test(t)) return 'vacataire'
  if (/cdi|cdd|fixe|salari|enseignant|prof/.test(t)) return 'fixe'
  return null
}

/**
 * Repère l'en-tête (la ligne qui contient « Matricule »), puis lit chaque
 * salarié. Le nom peut venir d'une colonne « Salarié » (« NOM Prénom ») ou
 * de deux colonnes « Nom » et « Prénom ».
 */
export function lignesImport(table: Cellule[][]): { lignes: LigneImport[]; erreurs: string[] } {
  const iEntete = table.findIndex((l) => l.some((c) => /matricule/i.test(String(c ?? ''))))
  if (iEntete < 0) return { lignes: [], erreurs: ['Aucune colonne « Matricule » trouvée.'] }
  const entete = table[iEntete].map((c) => norme(String(c ?? '')))
  const col = (...motifs: RegExp[]) => entete.findIndex((h) => motifs.some((m) => m.test(h)))
  const cMat = col(/matricule/)
  const cPrenom = col(/^prenom/)
  const cNom = col(/^nom$/, /^nom de famille/, /^nom usuel/)
  const cSal = col(/salarie/, /^nom et prenom/, /^nom prenom/, /^collaborateur/)
  const cEmail = col(/mail/)
  const cProfil = col(/profil/, /type de contrat/, /contrat/, /statut/)
  const cEntree = col(/entree/, /embauche/)
  const cSortie = col(/sortie/)
  const lignes: LigneImport[] = []
  const erreurs: string[] = []
  for (const [k, l] of table.slice(iEntete + 1).entries()) {
    const brut = l[cMat]
    if (brut === null || brut === undefined || String(brut).trim() === '') continue
    // Un matricule saisi comme nombre a perdu ses zéros : Silae les écrit sur 5 chiffres.
    const matricule = typeof brut === 'number' ? String(brut).padStart(5, '0') : String(brut).trim()
    const nom =
      cSal >= 0 && l[cSal]
        ? String(l[cSal]).trim()
        : [cNom >= 0 ? l[cNom] : null, cPrenom >= 0 ? l[cPrenom] : null].filter(Boolean).join(' ').trim()
    if (!nom) {
      erreurs.push(`Ligne ${iEntete + k + 2} : matricule ${matricule} sans nom.`)
      continue
    }
    lignes.push({
      matricule,
      nom,
      email: cEmail >= 0 && l[cEmail] ? String(l[cEmail]).trim().toLowerCase() : null,
      profil: cProfil >= 0 ? profilDuTexte(l[cProfil]) : null,
      entree: cEntree >= 0 ? date(l[cEntree]) : null,
      sortie: cSortie >= 0 ? date(l[cSortie]) : null,
    })
  }
  return { lignes, erreurs }
}

/** Les mots d'un nom, sans accents ; « AL-MGADMEE » reste un seul mot. */
export function motsDuNom(nom: string): Set<string> {
  return new Set(
    norme(nom)
      .replace(/[-'’]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((m) => m.length > 1 && !['nee', 'ne', 'epouse', 'prof', 'coach'].includes(m))
  )
}

/**
 * Deux écritures du même nom : « YAPO Sun, Mhaude » et « Mhaude Yapo ».
 * Il faut au moins deux mots en commun, tous ceux du nom le plus court.
 */
export function memePersonne(a: string, b: string): boolean {
  const x = motsDuNom(a)
  const y = motsDuNom(b)
  const [petit, grand] = x.size <= y.size ? [x, y] : [y, x]
  return petit.size >= 2 && [...petit].every((m) => grand.has(m))
}
