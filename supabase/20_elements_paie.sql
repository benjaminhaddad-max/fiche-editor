-- ============================================================
-- ÉLÉMENTS VARIABLES DE PAIE
-- ============================================================
-- Ce que le service paie réclamait par email chaque mois : heures
-- supplémentaires, congés, abonnement de transport, mutuelle. Chacun le
-- renseigne lui-même dans son espace ; la personne qui saisit dans Silae
-- retrouve tout au même endroit, avec les justificatifs.

CREATE TABLE IF NOT EXISTS inv_payroll_inputs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id        UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  period             TEXT NOT NULL,                       -- 'YYYY-MM'

  overtime_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  paid_leave_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
  unpaid_leave_days  NUMERIC(5,2) NOT NULL DEFAULT 0,
  leave_detail       TEXT,
  -- Abonnement de transport : la moitié est prise en charge, un justificatif
  -- est donc exigé.
  transport          BOOLEAN NOT NULL DEFAULT FALSE,
  transport_amount   NUMERIC(8,2),
  transport_document UUID REFERENCES inv_documents(id) ON DELETE SET NULL,
  -- 'adherent' | 'refus' | 'inconnu'
  mutuelle           TEXT NOT NULL DEFAULT 'inconnu',
  comment            TEXT,

  submitted_at       TIMESTAMPTZ,
  submitted_by       UUID REFERENCES inv_users(id),
  reminded_at        TIMESTAMPTZ,
  exported_at        TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_payroll_inputs_unique UNIQUE (provider_id, period),
  CONSTRAINT inv_payroll_inputs_mutuelle_ck CHECK (mutuelle IN ('adherent', 'refus', 'inconnu'))
);

CREATE INDEX IF NOT EXISTS idx_payroll_inputs_period ON inv_payroll_inputs(period);

DROP TRIGGER IF EXISTS t_inv_payroll_inputs_updated ON inv_payroll_inputs;
CREATE TRIGGER t_inv_payroll_inputs_updated BEFORE UPDATE ON inv_payroll_inputs
  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();

ALTER TABLE inv_payroll_inputs ENABLE ROW LEVEL SECURITY;

-- Chacun les siens ; l'équipe qui prépare la paie voit tout le monde.
DROP POLICY IF EXISTS payroll_inputs_read ON inv_payroll_inputs;
CREATE POLICY payroll_inputs_read ON inv_payroll_inputs
  FOR SELECT USING (provider_id = inv_my_provider_id() OR inv_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS payroll_inputs_admin ON inv_payroll_inputs;
CREATE POLICY payroll_inputs_admin ON inv_payroll_inputs
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

COMMENT ON TABLE inv_payroll_inputs IS
  'Éléments variables du mois, déclarés par la personne elle-même. Remplace '
  'le mail mensuel « Demande d''informations - Payes ».';
