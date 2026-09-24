import { createClient } from '@supabase/supabase-js'

/**
 * Lecture de Diploma Lab, et rien d'autre.
 *
 * L'effectif d'un coach vit là-bas : il est rattaché à ses classes par
 * `coach_groupe_assignments`, et les élèves à leur classe par `groupe_id`.
 * Le recopier à la main dans Diploma Invoice condamnerait le chiffre à
 * vieillir — c'est exactement ce qui s'est passé sur les premiers contrats.
 *
 * Ce module n'écrit jamais dans Lab. Toute écriture se fait depuis Lab
 * lui-même ; ici on ne fait que compter.
 */

export function labConfigure(): boolean {
  return Boolean(process.env.LAB_SUPABASE_URL && process.env.LAB_SUPABASE_SERVICE_KEY)
}

function client() {
  return createClient(process.env.LAB_SUPABASE_URL!, process.env.LAB_SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false },
  })
}

export interface EffectifCoach {
  email: string
  nom: string
  eleves: number
  /** « Classe 3 (29), Medibox Excellence (2) », pour justifier le chiffre. */
  detail: string
}

/**
 * Combien d'élèves chaque coach suit aujourd'hui, classes et promotions
 * confondues. Les comptes désactivés ne comptent pas : ils ne sont plus
 * suivis, on ne les facture pas.
 */
export async function effectifsParCoach(): Promise<Map<string, EffectifCoach>> {
  const out = new Map<string, EffectifCoach>()
  if (!labConfigure()) return out

  const db = client()
  const { data: liens } = await db.from('coach_groupe_assignments').select('coach_id, groupe_id')
  if (!liens?.length) return out

  const coachIds = [...new Set(liens.map((l) => l.coach_id as string))]
  const groupeIds = [...new Set(liens.map((l) => l.groupe_id as string))]

  // PostgREST rend mille lignes au plus : avec deux mille cinq cents élèves,
  // une lecture d'un seul tenant compte faux sans rien signaler. On pagine,
  // et on se limite aux classes qui ont un coach.
  const parGroupe = new Map<string, number>()
  const PAGE = 1000
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await db
      .from('profiles')
      .select('groupe_id')
      .eq('role', 'eleve')
      .is('deactivated_at', null)
      .in('groupe_id', groupeIds)
      .range(debut, debut + PAGE - 1)
    if (error || !data?.length) break
    for (const e of data) {
      const g = e.groupe_id as string
      parGroupe.set(g, (parGroupe.get(g) ?? 0) + 1)
    }
    if (data.length < PAGE) break
  }
  const [{ data: coachs }, { data: groupes }] = await Promise.all([
    db.from('profiles').select('id, email, first_name, last_name').in('id', coachIds),
    db.from('groupes').select('id, name').in('id', groupeIds),
  ])

  const nomGroupe = new Map((groupes ?? []).map((g) => [g.id as string, g.name as string]))
  const fiche = new Map((coachs ?? []).map((c) => [c.id as string, c]))

  const details = new Map<string, string[]>()
  for (const l of liens) {
    const c = fiche.get(l.coach_id as string)
    if (!c?.email) continue
    const cle = (c.email as string).toLowerCase()
    const n = parGroupe.get(l.groupe_id as string) ?? 0
    const courant = out.get(cle)
    out.set(cle, {
      email: cle,
      nom: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
      eleves: (courant?.eleves ?? 0) + n,
      detail: '',
    })
    details.set(cle, [...(details.get(cle) ?? []), `${nomGroupe.get(l.groupe_id as string) ?? '?'} (${n})`])
  }
  for (const [cle, parts] of details) {
    const e = out.get(cle)!
    out.set(cle, { ...e, detail: parts.sort().join(', ') })
  }
  return out
}
