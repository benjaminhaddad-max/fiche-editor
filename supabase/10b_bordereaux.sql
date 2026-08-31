-- ============================================================
-- BORDEREAUX MENSUELS ET CONTESTATION
-- ============================================================
-- Le manager saisit les missions au fil du mois. Le mercredi suivant le
-- dernier samedi, un bordereau part au prestataire : il conteste une ligne
-- ou laisse filer. Sans réponse au samedi, le bordereau est réputé accepté
-- et devient facturable.
--
-- C'est le MANAGER qui tranche une contestation, pas l'administration :
-- c'est lui qui a commandé la mission et qui sait ce qui a été fait.

DO $$ BEGIN
  CREATE TYPE inv_statement_status AS ENUM ('draft', 'sent', 'contested', 'accepted', 'invoiced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_contest_outcome AS ENUM ('accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inv_statements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,

  cycle_month      TEXT NOT NULL,              -- '2026-09'
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,              -- dernier samedi
  statement_date   DATE NOT NULL,              -- mercredi : envoi
  invoice_deadline DATE NOT NULL,              -- samedi : limite
  payment_start    DATE NOT NULL,
  payment_end      DATE NOT NULL,

  status           inv_statement_status NOT NULL DEFAULT 'draft',
  total_ht         NUMERIC(12,2) NOT NULL DEFAULT 0,

  sent_at          TIMESTAMPTZ,
  accepted_at      TIMESTAMPTZ,
  -- Accepté faute de réponse avant la date limite, plutôt qu'explicitement.
  auto_accepted    BOOLEAN NOT NULL DEFAULT FALSE,
  invoice_id       UUID REFERENCES inv_invoices(id) ON DELETE SET NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_statements_unique UNIQUE (provider_id, cycle_month)
);

ALTER TABLE inv_missions
  ADD COLUMN IF NOT EXISTS statement_id            UUID REFERENCES inv_statements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contested_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contest_reason          TEXT,
  ADD COLUMN IF NOT EXISTS contest_proposed_ht     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS contest_resolved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contest_resolved_by     UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS contest_outcome         inv_contest_outcome;

CREATE INDEX IF NOT EXISTS idx_statements_provider ON inv_statements(provider_id);
CREATE INDEX IF NOT EXISTS idx_statements_status   ON inv_statements(status);
CREATE INDEX IF NOT EXISTS idx_statements_deadline ON inv_statements(invoice_deadline);
CREATE INDEX IF NOT EXISTS idx_missions_statement  ON inv_missions(statement_id);

DROP TRIGGER IF EXISTS t_inv_statements_updated ON inv_statements;
CREATE TRIGGER t_inv_statements_updated BEFORE UPDATE ON inv_statements
  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();

-- ---------- RLS ----------
ALTER TABLE inv_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statements_select_own ON inv_statements;
CREATE POLICY statements_select_own ON inv_statements
  FOR SELECT USING (provider_id = inv_my_provider_id());

DROP POLICY IF EXISTS statements_select_staff ON inv_statements;
CREATE POLICY statements_select_staff ON inv_statements
  FOR SELECT USING (inv_my_role() IN ('manager', 'admin'));

-- Le prestataire accepte son bordereau ; il ne peut rien changer d'autre.
DROP POLICY IF EXISTS statements_accept_own ON inv_statements;
CREATE POLICY statements_accept_own ON inv_statements
  FOR UPDATE
  USING (provider_id = inv_my_provider_id() AND status IN ('sent', 'contested'))
  WITH CHECK (provider_id = inv_my_provider_id() AND status IN ('sent', 'contested', 'accepted'));

DROP POLICY IF EXISTS statements_admin_all ON inv_statements;
CREATE POLICY statements_admin_all ON inv_statements
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- Le prestataire peut contester une ligne de son bordereau : c'est la
-- seule main qu'il a sur une prestation déjà validée.
DROP POLICY IF EXISTS missions_contest_own ON inv_missions;
CREATE POLICY missions_contest_own ON inv_missions
  FOR UPDATE
  USING (provider_id = inv_my_provider_id() AND status = 'approved' AND statement_id IS NOT NULL)
  WITH CHECK (provider_id = inv_my_provider_id() AND status IN ('approved', 'contested'));

-- Le manager tranche les contestations qui portent sur ses missions.
DROP POLICY IF EXISTS missions_resolve_contest ON inv_missions;
CREATE POLICY missions_resolve_contest ON inv_missions
  FOR UPDATE
  USING (manager_id = inv_me() AND inv_my_role() = 'manager' AND status = 'contested')
  WITH CHECK (manager_id = inv_me() AND status IN ('approved', 'rejected'));
