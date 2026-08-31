-- ============================================================
-- BARÈMES DE COACHING — table de référence
-- ============================================================
-- Les contrats copient ces valeurs à leur création. Modifier un barème
-- ici n'altère donc jamais un contrat déjà signé.

CREATE TABLE IF NOT EXISTS inv_coaching_rates (
  program           inv_coaching_program NOT NULL,
  academic_year     TEXT NOT NULL,
  base_amount       NUMERIC(12,2) NOT NULL CHECK (base_amount > 0),
  base_headcount    INTEGER NOT NULL CHECK (base_headcount > 0),
  label             TEXT NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (program, academic_year)
);

INSERT INTO inv_coaching_rates (program, academic_year, base_amount, base_headcount, label) VALUES
  ('pass_las_lsps',   '2026-2027', 1000, 30,  'PASS / LAS / LSPS — 1 000 € par semestre pour 30 étudiants'),
  ('paes',            '2026-2027', 1000, 100, 'PAES — 1 000 € par semestre pour 100 élèves'),
  ('terminale_sante', '2026-2027',  750, 60,  'Terminale Santé — 750 € par semestre pour 60 étudiants')
ON CONFLICT (program, academic_year) DO UPDATE SET
  base_amount    = EXCLUDED.base_amount,
  base_headcount = EXCLUDED.base_headcount,
  label          = EXCLUDED.label,
  updated_at     = NOW();

ALTER TABLE inv_coaching_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rates_read ON inv_coaching_rates;
CREATE POLICY rates_read ON inv_coaching_rates
  FOR SELECT USING (inv_me() IS NOT NULL);

DROP POLICY IF EXISTS rates_admin ON inv_coaching_rates;
CREATE POLICY rates_admin ON inv_coaching_rates
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');
