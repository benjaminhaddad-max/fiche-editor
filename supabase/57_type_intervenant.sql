-- ============================================================
-- TYPE D'INTERVENANT — prof, tuteur, coach, commercial, autre
-- (Nolwenn, 19/11/2026)
-- ============================================================
-- Jusqu'ici, « tuteur » ou « coach » ne se lisait que dans les étiquettes
-- libres de la fiche (« Tutrice », « Coach Medibox »…). Nolwenn ne pouvait
-- ni filtrer ni lancer la facturation d'un seul groupe. Le type devient un
-- champ à part entière, un par personne : le métier principal.
--
-- Remplissage, du plus sûr au moins sûr :
--   1. étiquettes posées à la main (Medibox) : prof, tuteur, coach ;
--   2. contrat signé ou envoyé : coaching → coach, commercial → commercial,
--      enregistrement → prof (ce sont des cours enregistrés) ;
--   3. pôle qui pèse le plus dans les prestations déclarées :
--      professeur/enregistrement → prof, coaching → coach,
--      referent → tuteur, commercial → commercial, marketing/autres → autre.
-- Sans étiquette, sans contrat et sans prestation : laissé vide, à classer.
--
-- intervenant_type_auto = true : rempli par cette migration, à confirmer.
-- Il repasse à false dès qu'un admin choisit le type sur la fiche.
--
-- Rejouable : ne touche que les fiches encore vides ou encore « auto ».
-- Aucun montant, aucun bordereau, aucune facture n'est modifié.

DO $$ BEGIN
  CREATE TYPE inv_intervenant AS ENUM ('professeur', 'tuteur', 'coach', 'commercial', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS intervenant_type inv_intervenant,
  ADD COLUMN IF NOT EXISTS intervenant_type_auto boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS inv_providers_intervenant_type_idx
  ON inv_providers (brand, intervenant_type);

WITH
etiq AS (
  SELECT p.id,
         bool_or(lower(unaccent_t) ~ '\m(prof|professeure?|enseignant)') AS prof,
         bool_or(lower(unaccent_t) ~ '\mtut(eur|rice)')                  AS tut,
         bool_or(lower(unaccent_t) ~ '\mcoach')                          AS coach
    FROM inv_providers p,
         LATERAL unnest(coalesce(p.tags, '{}')) AS t(unaccent_t)
   GROUP BY p.id
),
contrat AS (
  SELECT provider_id,
         -- Le contrat le plus récent fait foi.
         (array_agg(contract_type::text ORDER BY created_at DESC))[1] AS ct
    FROM inv_coaching_contracts
   WHERE status::text NOT IN ('cancelled', 'draft')
   GROUP BY provider_id
),
poids AS (
  SELECT m.provider_id,
         CASE c.pole::text
           WHEN 'professeur' THEN 'professeur'
           WHEN 'enregistrement' THEN 'professeur'
           WHEN 'coaching' THEN 'coach'
           WHEN 'referent' THEN 'tuteur'
           WHEN 'commercial' THEN 'commercial'
           ELSE 'autre'
         END AS groupe,
         sum(abs(m.total_ht)) + count(*) AS poids
    FROM inv_missions m
    JOIN inv_categories c ON c.id = m.category_id
   WHERE m.status::text <> 'rejected'
   GROUP BY 1, 2
),
dominant AS (
  SELECT DISTINCT ON (provider_id) provider_id, groupe
    FROM poids
   ORDER BY provider_id, poids DESC
),
calcul AS (
  SELECT p.id,
         CASE
           WHEN e.prof THEN 'professeur'
           WHEN e.tut AND e.coach THEN
             CASE WHEN d.groupe IN ('tuteur', 'coach') THEN d.groupe ELSE 'tuteur' END
           WHEN e.tut THEN 'tuteur'
           WHEN e.coach THEN 'coach'
           WHEN ct.ct = 'coaching' THEN 'coach'
           WHEN ct.ct = 'commercial' THEN 'commercial'
           WHEN ct.ct IN ('enregistrement', 'professeur') THEN 'professeur'
           WHEN ct.ct = 'referent' THEN 'tuteur'
           ELSE d.groupe
         END AS groupe
    FROM inv_providers p
    LEFT JOIN etiq e ON e.id = p.id
    LEFT JOIN contrat ct ON ct.provider_id = p.id
    LEFT JOIN dominant d ON d.provider_id = p.id
)
UPDATE inv_providers p
   SET intervenant_type = calcul.groupe::inv_intervenant,
       intervenant_type_auto = true
  FROM calcul
 WHERE calcul.id = p.id
   AND calcul.groupe IS NOT NULL
   AND (p.intervenant_type IS NULL OR p.intervenant_type_auto);
