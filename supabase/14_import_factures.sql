-- ============================================================
-- LIGNES EXTRAITES D'UNE FACTURE DÉPOSÉE
-- ============================================================
-- Un prestataire qui dépose sa propre facture y met souvent plusieurs
-- lignes, relevant de responsables différents. On lit le PDF, on en
-- extrait les lignes, et il affecte un responsable à chacune. Chaque
-- responsable ne valide alors que sa part.
--
-- Ces lignes ne sont PAS des prestations : ce sont des propositions. Elles
-- ne deviennent des prestations qu'une fois le responsable désigné et la
-- ligne confirmée — c'est à ce moment seulement qu'elles entrent dans le
-- circuit de validation.

DO $$ BEGIN
  CREATE TYPE inv_import_status AS ENUM ('extracted', 'assigned', 'confirmed', 'discarded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inv_import_lines (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,

  source_file    TEXT,
  source_path    TEXT,
  batch_id       UUID NOT NULL,

  -- Ce que Claude a lu dans le PDF.
  description    TEXT NOT NULL,
  quantity       NUMERIC(10,2),
  unit_amount_ht NUMERIC(12,2),
  total_ht       NUMERIC(12,2) NOT NULL,
  line_date      DATE,
  raw            JSONB NOT NULL DEFAULT '{}',

  -- Ce que le prestataire décide.
  manager_id     UUID REFERENCES inv_users(id),
  category_id    UUID REFERENCES inv_categories(id),

  status         inv_import_status NOT NULL DEFAULT 'extracted',
  mission_id     UUID REFERENCES inv_missions(id) ON DELETE SET NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_provider ON inv_import_lines(provider_id);
CREATE INDEX IF NOT EXISTS idx_import_batch    ON inv_import_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_import_status   ON inv_import_lines(status);

DROP TRIGGER IF EXISTS t_inv_import_updated ON inv_import_lines;
CREATE TRIGGER t_inv_import_updated BEFORE UPDATE ON inv_import_lines
  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();

ALTER TABLE inv_import_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_own ON inv_import_lines;
CREATE POLICY import_own ON inv_import_lines
  FOR ALL
  USING (provider_id = inv_my_provider_id())
  WITH CHECK (provider_id = inv_my_provider_id());

DROP POLICY IF EXISTS import_staff_read ON inv_import_lines;
CREATE POLICY import_staff_read ON inv_import_lines
  FOR SELECT USING (inv_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS import_admin ON inv_import_lines;
CREATE POLICY import_admin ON inv_import_lines
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');
