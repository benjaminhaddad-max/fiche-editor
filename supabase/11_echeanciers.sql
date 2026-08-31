-- ============================================================
-- ÉCHÉANCIERS PAR PROGRAMME
-- ============================================================
-- Chaque programme a son propre rythme, et ils n'ont rien en commun :
--
--   PASS/LAS/LSPS    6 versements — trois par semestre, espacés de deux
--                    mois, répartis 30/40/30. Démarre en août.
--   Terminale Santé  2 versements — un tiers fin janvier, deux tiers
--                    fin juin.
--
-- D'où un échéancier décrit en données plutôt qu'en code : chaque entrée
-- porte son mois, son décalage d'année par rapport à la rentrée, et sa
-- part du montant annuel. Les parts doivent totaliser 1.

ALTER TABLE inv_coaching_rates
  ADD COLUMN IF NOT EXISTS schedule JSONB;

COMMENT ON COLUMN inv_coaching_rates.schedule IS
  'Échéancier annuel : [{ "month": 0-11, "year_offset": 0|1, "share": 0..1 }]. '
  'month est en base 0 (0 = janvier). year_offset se compte depuis l''année '
  'de rentrée. La somme des share vaut 1.';

-- PASS/LAS/LSPS : août, octobre, décembre (S1) puis janvier, mars, mai (S2).
-- Chaque semestre vaut la moitié de l'année, réparti 30/40/30.
UPDATE inv_coaching_rates SET schedule = '[
  { "month": 7,  "year_offset": 0, "share": 0.15, "label": "Semestre 1 — fin août" },
  { "month": 9,  "year_offset": 0, "share": 0.20, "label": "Semestre 1 — fin octobre" },
  { "month": 11, "year_offset": 0, "share": 0.15, "label": "Semestre 1 — fin décembre" },
  { "month": 0,  "year_offset": 1, "share": 0.15, "label": "Semestre 2 — fin janvier" },
  { "month": 2,  "year_offset": 1, "share": 0.20, "label": "Semestre 2 — fin mars" },
  { "month": 4,  "year_offset": 1, "share": 0.15, "label": "Semestre 2 — fin mai" }
]'::JSONB
WHERE program = 'pass_las_lsps';

-- Terminale Santé : un tiers fin janvier, deux tiers fin juin.
UPDATE inv_coaching_rates SET schedule = '[
  { "month": 0, "year_offset": 1, "share": 0.3333333, "label": "Fin janvier" },
  { "month": 5, "year_offset": 1, "share": 0.6666667, "label": "Fin juin" }
]'::JSONB
WHERE program = 'terminale_sante';

-- PAES : même rythme que Terminale Santé faute d'indication contraire.
-- À revoir si les versements PAES suivent en réalité le rythme PASS.
UPDATE inv_coaching_rates SET schedule = '[
  { "month": 0, "year_offset": 1, "share": 0.3333333, "label": "Fin janvier" },
  { "month": 5, "year_offset": 1, "share": 0.6666667, "label": "Fin juin" }
]'::JSONB
WHERE program = 'paes';

ALTER TABLE inv_coaching_rates
  DROP CONSTRAINT IF EXISTS inv_rates_schedule_ck;
ALTER TABLE inv_coaching_rates
  ADD CONSTRAINT inv_rates_schedule_ck CHECK (
    schedule IS NULL OR jsonb_typeof(schedule) = 'array'
  );
