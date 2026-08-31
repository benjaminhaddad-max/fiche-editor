-- ============================================================
-- DIPLOMA INVOICE — SCHEMA COMPLET
-- A coller dans Supabase > SQL Editor > Run
--
-- ATTENTION : ce script supprime les tables de l'ancien projet
-- "fiche-editor" (fiches, fiche_users). Faites un export avant
-- si vous voulez conserver ces donnees.
-- ============================================================

-- ---------- 1. NETTOYAGE ANCIEN PROJET ----------
DROP TABLE IF EXISTS fiches CASCADE;
DROP TABLE IF EXISTS fiche_users CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- ---------- 2. NETTOYAGE DIPLOMA INVOICE (re-run safe) ----------
DROP TABLE IF EXISTS inv_audit_log CASCADE;
DROP TABLE IF EXISTS inv_invoice_lines CASCADE;
DROP TABLE IF EXISTS inv_invoices CASCADE;
DROP TABLE IF EXISTS inv_missions CASCADE;
DROP TABLE IF EXISTS inv_categories CASCADE;
DROP TABLE IF EXISTS inv_providers CASCADE;
DROP TABLE IF EXISTS inv_users CASCADE;

DROP FUNCTION IF EXISTS inv_touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS inv_me() CASCADE;
DROP FUNCTION IF EXISTS inv_my_role() CASCADE;
DROP FUNCTION IF EXISTS inv_my_provider_id() CASCADE;
DROP FUNCTION IF EXISTS inv_next_invoice_number(UUID) CASCADE;

DROP TYPE IF EXISTS inv_role CASCADE;
DROP TYPE IF EXISTS inv_pricing_type CASCADE;
DROP TYPE IF EXISTS inv_mission_status CASCADE;
DROP TYPE IF EXISTS inv_invoice_status CASCADE;
DROP TYPE IF EXISTS inv_vat_regime CASCADE;
DROP TYPE IF EXISTS inv_pennylane_status CASCADE;

-- ---------- 3. TYPES ----------
CREATE TYPE inv_role            AS ENUM ('prestataire', 'manager', 'admin');
CREATE TYPE inv_pricing_type    AS ENUM ('forfait_mission', 'forfait_horaire');
CREATE TYPE inv_mission_status  AS ENUM ('draft', 'submitted', 'manager_approved', 'approved', 'rejected', 'invoiced');
CREATE TYPE inv_invoice_status  AS ENUM ('draft', 'issued', 'sent', 'paid');
CREATE TYPE inv_vat_regime      AS ENUM ('franchise', 'normal');
CREATE TYPE inv_pennylane_status AS ENUM ('not_synced', 'synced', 'error');

-- ---------- 4. UTILISATEURS ----------
CREATE TABLE inv_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL,
  role        inv_role NOT NULL DEFAULT 'prestataire',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 5. PRESTATAIRES (profil de facturation) ----------
CREATE TABLE inv_providers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID UNIQUE NOT NULL REFERENCES inv_users(id) ON DELETE CASCADE,

  -- Identite legale (obligatoire pour emettre une facture)
  legal_name            TEXT NOT NULL,
  legal_form            TEXT,                       -- 'Auto-entrepreneur', 'SASU', ...
  siret                 TEXT,
  vat_number            TEXT,                       -- num TVA intracom si assujetti
  address_line1         TEXT,
  address_line2         TEXT,
  postal_code           TEXT,
  city                  TEXT,
  country               TEXT NOT NULL DEFAULT 'France',
  phone                 TEXT,

  -- Paiement
  iban                  TEXT,
  bic                   TEXT,
  payment_terms_days    INTEGER NOT NULL DEFAULT 30,

  -- TVA
  vat_regime            inv_vat_regime NOT NULL DEFAULT 'franchise',
  vat_rate              NUMERIC(5,2) NOT NULL DEFAULT 0,   -- 0 en franchise, 20 si assujetti

  -- Facturation
  invoice_prefix        TEXT NOT NULL DEFAULT 'FACT',
  next_invoice_seq      INTEGER NOT NULL DEFAULT 1,

  -- Rattachement
  default_manager_id    UUID REFERENCES inv_users(id) ON DELETE SET NULL,

  -- Pennylane
  pennylane_supplier_id BIGINT,

  notes                 TEXT,
  onboarding_complete   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_providers_vat_rate_ck CHECK (
    (vat_regime = 'franchise' AND vat_rate = 0) OR
    (vat_regime = 'normal'    AND vat_rate > 0)
  )
);

-- ---------- 6. CATEGORIES DE MISSIONS ----------
CREATE TABLE inv_categories (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL UNIQUE,   -- nom interne
  pennylane_label             TEXT,                   -- libelle Pennylane
  provider_label              TEXT,                   -- libelle affiche au prestataire
  pennylane_category_id BIGINT,                 -- id_pennylane (ID de categorie Pennylane)
  visible_to_provider         BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 7. FACTURES ----------
CREATE TABLE inv_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  number                TEXT NOT NULL,
  status                inv_invoice_status NOT NULL DEFAULT 'draft',

  issue_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE NOT NULL,
  period_start          DATE,
  period_end            DATE,

  -- Snapshot emetteur (fige au moment de l'emission : la facture ne doit
  -- jamais changer si le prestataire modifie son profil ensuite)
  issuer_snapshot       JSONB NOT NULL DEFAULT '{}',

  subtotal_ht           NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  vat_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc             NUMERIC(12,2) NOT NULL DEFAULT 0,

  pdf_path              TEXT,                   -- chemin dans le bucket storage
  issued_at             TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,

  -- Pennylane
  pennylane_status              inv_pennylane_status NOT NULL DEFAULT 'not_synced',
  pennylane_invoice_id          BIGINT,
  pennylane_file_attachment_id  BIGINT,
  pennylane_error               TEXT,
  pennylane_synced_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_invoices_number_unique UNIQUE (provider_id, number)
);

-- ---------- 8. MISSIONS / PRESTATIONS ----------
CREATE TABLE inv_missions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  manager_id        UUID NOT NULL REFERENCES inv_users(id),        -- manager
  category_id       UUID NOT NULL REFERENCES inv_categories(id),

  detail            TEXT NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE,

  pricing_type      inv_pricing_type NOT NULL,
  quantity          NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_amount_ht    NUMERIC(12,2) NOT NULL CHECK (unit_amount_ht >= 0),
  total_ht          NUMERIC(12,2) NOT NULL CHECK (total_ht >= 0),

  status            inv_mission_status NOT NULL DEFAULT 'draft',

  submitted_at            TIMESTAMPTZ,
  manager_approved_at     TIMESTAMPTZ,
  manager_approved_by     UUID REFERENCES inv_users(id),
  admin_approved_at       TIMESTAMPTZ,
  admin_approved_by       UUID REFERENCES inv_users(id),
  rejected_at             TIMESTAMPTZ,
  rejected_by             UUID REFERENCES inv_users(id),
  rejection_reason        TEXT,

  invoice_id        UUID REFERENCES inv_invoices(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_missions_dates_ck CHECK (end_date IS NULL OR end_date >= start_date)
);

-- ---------- 9. LIGNES DE FACTURE (snapshot fige) ----------
CREATE TABLE inv_invoice_lines (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  UUID NOT NULL REFERENCES inv_invoices(id) ON DELETE CASCADE,
  mission_id                  UUID REFERENCES inv_missions(id) ON DELETE SET NULL,

  description                 TEXT NOT NULL,
  category_name               TEXT NOT NULL,
  pennylane_category_id BIGINT,
  pricing_type                inv_pricing_type NOT NULL,
  quantity                    NUMERIC(10,2) NOT NULL,
  unit_amount_ht              NUMERIC(12,2) NOT NULL,
  total_ht                    NUMERIC(12,2) NOT NULL,
  vat_rate                    NUMERIC(5,2) NOT NULL DEFAULT 0,
  vat_amount                  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ttc                   NUMERIC(12,2) NOT NULL,
  period_label                TEXT,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 10. JOURNAL D'AUDIT ----------
CREATE TABLE inv_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES inv_users(id) ON DELETE SET NULL,
  entity_type  TEXT NOT NULL,        -- 'mission' | 'invoice' | 'provider'
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,        -- 'submit' | 'manager_approve' | 'approve' | 'reject' | ...
  payload      JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 11. INDEXES ----------
CREATE INDEX idx_inv_users_auth        ON inv_users(auth_id);
CREATE INDEX idx_inv_providers_user    ON inv_providers(user_id);
CREATE INDEX idx_inv_missions_provider ON inv_missions(provider_id);
CREATE INDEX idx_inv_missions_manager  ON inv_missions(manager_id);
CREATE INDEX idx_inv_missions_status   ON inv_missions(status);
CREATE INDEX idx_inv_missions_invoice  ON inv_missions(invoice_id);
CREATE INDEX idx_inv_invoices_provider ON inv_invoices(provider_id);
CREATE INDEX idx_inv_invoices_status   ON inv_invoices(status);
CREATE INDEX idx_inv_lines_invoice     ON inv_invoice_lines(invoice_id);
CREATE INDEX idx_inv_audit_entity      ON inv_audit_log(entity_type, entity_id);

-- ---------- 12. TRIGGER updated_at ----------
CREATE OR REPLACE FUNCTION inv_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_inv_users_updated     BEFORE UPDATE ON inv_users      FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();
CREATE TRIGGER t_inv_providers_updated BEFORE UPDATE ON inv_providers  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();
CREATE TRIGGER t_inv_categories_updated BEFORE UPDATE ON inv_categories FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();
CREATE TRIGGER t_inv_missions_updated  BEFORE UPDATE ON inv_missions   FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();
CREATE TRIGGER t_inv_invoices_updated  BEFORE UPDATE ON inv_invoices   FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();
