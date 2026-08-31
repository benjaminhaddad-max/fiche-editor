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
-- ============================================================
-- DIPLOMA INVOICE — FONCTIONS, RLS, NUMEROTATION
-- A executer APRES 01_schema.sql
-- ============================================================

-- ---------- 1. HELPERS (SECURITY DEFINER : contournent la RLS,
--             indispensable pour eviter la recursion infinie) ----------
CREATE OR REPLACE FUNCTION inv_me()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM inv_users WHERE auth_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION inv_my_role()
RETURNS inv_role
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM inv_users WHERE auth_id = auth.uid() AND is_active LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION inv_my_provider_id()
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id
  FROM inv_providers p
  JOIN inv_users u ON u.id = p.user_id
  WHERE u.auth_id = auth.uid() AND u.is_active
  LIMIT 1;
$$;

-- ---------- 2. NUMEROTATION DE FACTURE ----------
-- Sequence continue par prestataire, verrou sur la ligne pour eviter
-- deux factures avec le meme numero en cas de double clic.
CREATE OR REPLACE FUNCTION inv_next_invoice_number(p_provider_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_seq    INTEGER;
BEGIN
  SELECT invoice_prefix, next_invoice_seq
    INTO v_prefix, v_seq
  FROM inv_providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prestataire introuvable: %', p_provider_id;
  END IF;

  UPDATE inv_providers
     SET next_invoice_seq = v_seq + 1
   WHERE id = p_provider_id;

  RETURN v_prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

-- ---------- 3. ACTIVATION RLS ----------
ALTER TABLE inv_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_providers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_audit_log     ENABLE ROW LEVEL SECURITY;

-- ---------- 4. inv_users ----------
-- Tout utilisateur actif voit l'annuaire interne (necessaire pour afficher
-- le nom du manager / du prestataire).
CREATE POLICY users_select ON inv_users
  FOR SELECT USING (inv_me() IS NOT NULL);

CREATE POLICY users_update_self ON inv_users
  FOR UPDATE USING (id = inv_me()) WITH CHECK (id = inv_me());

CREATE POLICY users_admin_all ON inv_users
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 5. inv_providers ----------
CREATE POLICY providers_select_own ON inv_providers
  FOR SELECT USING (id = inv_my_provider_id());

CREATE POLICY providers_select_staff ON inv_providers
  FOR SELECT USING (inv_my_role() IN ('manager', 'admin'));

CREATE POLICY providers_update_own ON inv_providers
  FOR UPDATE USING (id = inv_my_provider_id()) WITH CHECK (id = inv_my_provider_id());

CREATE POLICY providers_admin_all ON inv_providers
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 6. inv_categories ----------
-- Le prestataire ne voit que les categories actives et marquees visibles.
CREATE POLICY categories_select_provider ON inv_categories
  FOR SELECT USING (
    inv_my_role() = 'prestataire' AND is_active AND visible_to_provider
  );

CREATE POLICY categories_select_staff ON inv_categories
  FOR SELECT USING (inv_my_role() IN ('manager', 'admin'));

CREATE POLICY categories_admin_all ON inv_categories
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 7. inv_missions ----------
CREATE POLICY missions_select_own ON inv_missions
  FOR SELECT USING (provider_id = inv_my_provider_id());

CREATE POLICY missions_select_manager ON inv_missions
  FOR SELECT USING (manager_id = inv_me() AND inv_my_role() = 'manager');

CREATE POLICY missions_select_admin ON inv_missions
  FOR SELECT USING (inv_my_role() = 'admin');

-- Le prestataire cree ses propres missions, jamais deja validees.
CREATE POLICY missions_insert_own ON inv_missions
  FOR INSERT WITH CHECK (
    provider_id = inv_my_provider_id()
    AND status IN ('draft', 'submitted')
  );

-- Il ne peut modifier que tant que ce n'est pas parti en validation
-- (brouillon) ou si ca lui a ete refuse.
CREATE POLICY missions_update_own ON inv_missions
  FOR UPDATE
  USING (provider_id = inv_my_provider_id() AND status IN ('draft', 'rejected'))
  WITH CHECK (provider_id = inv_my_provider_id() AND status IN ('draft', 'submitted'));

CREATE POLICY missions_delete_own ON inv_missions
  FOR DELETE USING (
    provider_id = inv_my_provider_id() AND status IN ('draft', 'rejected')
  );

-- Le manager valide / refuse ce qui lui est soumis.
CREATE POLICY missions_update_manager ON inv_missions
  FOR UPDATE
  USING (manager_id = inv_me() AND inv_my_role() = 'manager' AND status = 'submitted')
  WITH CHECK (manager_id = inv_me() AND status IN ('manager_approved', 'rejected'));

CREATE POLICY missions_admin_all ON inv_missions
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 8. inv_invoices ----------
CREATE POLICY invoices_select_own ON inv_invoices
  FOR SELECT USING (provider_id = inv_my_provider_id());

CREATE POLICY invoices_select_admin ON inv_invoices
  FOR SELECT USING (inv_my_role() = 'admin');

CREATE POLICY invoices_admin_all ON inv_invoices
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 9. inv_invoice_lines ----------
CREATE POLICY lines_select ON inv_invoice_lines
  FOR SELECT USING (
    invoice_id IN (
      SELECT id FROM inv_invoices
      WHERE provider_id = inv_my_provider_id() OR inv_my_role() = 'admin'
    )
  );

CREATE POLICY lines_admin_all ON inv_invoice_lines
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- ---------- 10. inv_audit_log ----------
CREATE POLICY audit_select_admin ON inv_audit_log
  FOR SELECT USING (inv_my_role() = 'admin');
-- ============================================================
-- DIPLOMA INVOICE — DONNEES INITIALES
-- A executer APRES 02_rls.sql
-- ============================================================

-- ---------- 1. CATEGORIES DE MISSIONS (reprise de l'Airtable) ----------
INSERT INTO inv_categories
  (name, pennylane_label, provider_label, pennylane_category_id, visible_to_provider, sort_order)
VALUES
  ('Pédagogie - Professeur',                        'Pédagogie - Professeur',    NULL,                                            21634805, TRUE, 10),
  ('Pédagogie - Référent (Surveillance CB / aide pédago)', 'Pédagogie - Référent', 'Pédagogie - Référent (Surveillance CB / aide pédago)', 21634860, TRUE, 20),
  ('Pédagogie - Admin (Coaching / Secrétariat)',     'Pédagogie - Admin',         'Pédagogie - Admin (Coaching / Secrétariat)',    21634880, TRUE, 30),
  ('Impression',                                     'Pédagogie - Impressions',   'Impression',                                    21634915, TRUE, 40),
  ('Commercial - Télépro / Closers Internes',        'Commercial - Télépro / Closers Internes', NULL,                              21634714, TRUE, 50),
  ('Marketing Digital',                              'Marketing Digital',         NULL,                                            21634758, TRUE, 60),
  ('Autres',                                         'Autres',                    NULL,                                            NULL,     TRUE, 99)
ON CONFLICT (name) DO UPDATE SET
  pennylane_label             = EXCLUDED.pennylane_label,
  provider_label              = EXCLUDED.provider_label,
  pennylane_category_id = EXCLUDED.pennylane_category_id,
  visible_to_provider         = EXCLUDED.visible_to_provider,
  sort_order                  = EXCLUDED.sort_order;

-- ---------- 2. BUCKET DE STOCKAGE DES PDF ----------
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Le prestataire lit les PDF ranges sous <son provider_id>/...
DROP POLICY IF EXISTS invoices_read_own ON storage.objects;
CREATE POLICY invoices_read_own ON storage.objects
  FOR SELECT USING (
    bucket_id = 'invoices'
    AND (storage.foldername(name))[1] = inv_my_provider_id()::TEXT
  );

DROP POLICY IF EXISTS invoices_read_admin ON storage.objects;
CREATE POLICY invoices_read_admin ON storage.objects
  FOR SELECT USING (bucket_id = 'invoices' AND inv_my_role() = 'admin');

-- ============================================================
-- 3. CREER LE PREMIER ADMIN
-- ============================================================
-- a) Supabase Dashboard > Authentication > Users > "Add user"
--    -> email + mot de passe, "Auto Confirm User" coche.
-- b) Copier l'UUID de l'utilisateur cree, puis executer :
--
--   INSERT INTO inv_users (auth_id, email, full_name, role)
--   VALUES ('<UUID_COPIE>', 'benjamin.haddad@diploma-sante.fr', 'Benjamin Haddad', 'admin');
--
-- Ensuite, tous les autres comptes (managers, prestataires) se creent
-- directement depuis l'interface admin de Diploma Invoice.
-- ============================================================
-- ============================================================
-- DIPLOMA INVOICE — CREATION ATOMIQUE D'UNE FACTURE
-- A executer APRES 03_seed.sql
-- ============================================================
-- Tout se passe dans UNE transaction : numerotation, snapshot de
-- l'emetteur, lignes et verrouillage des prestations. Impossible
-- d'obtenir une facture a moitie creee ou deux fois le meme numero.

DROP FUNCTION IF EXISTS inv_create_invoice(UUID, UUID[]);

CREATE OR REPLACE FUNCTION inv_create_invoice(
  p_provider_id UUID,
  p_mission_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_provider   inv_providers%ROWTYPE;
  v_email      TEXT;
  v_invoice_id UUID;
  v_number     TEXT;
  v_lines      INTEGER;
BEGIN
  -- ---- Controle d'acces : sa propre fiche, ou admin.
  IF NOT (inv_my_provider_id() = p_provider_id OR inv_my_role() = 'admin') THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;

  -- Verrou : bloque une seconde facture concurrente pour ce prestataire.
  SELECT * INTO v_provider FROM inv_providers WHERE id = p_provider_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prestataire introuvable.';
  END IF;

  IF v_provider.legal_name IS NULL OR v_provider.address_line1 IS NULL
     OR v_provider.postal_code IS NULL OR v_provider.city IS NULL THEN
    RAISE EXCEPTION 'Profil de facturation incomplet : renseignez votre raison sociale et votre adresse.';
  END IF;

  SELECT email INTO v_email FROM inv_users WHERE id = v_provider.user_id;

  v_number := inv_next_invoice_number(p_provider_id);

  -- ---- 1. Coquille de la facture (totaux calcules a l'etape 3).
  INSERT INTO inv_invoices (
    provider_id, number, status, issue_date, due_date,
    issuer_snapshot, vat_rate, issued_at
  ) VALUES (
    p_provider_id,
    v_number,
    'issued',
    CURRENT_DATE,
    CURRENT_DATE + (v_provider.payment_terms_days || ' days')::INTERVAL,
    jsonb_build_object(
      'legal_name',    v_provider.legal_name,
      'legal_form',    v_provider.legal_form,
      'siret',         v_provider.siret,
      'vat_number',    v_provider.vat_number,
      'address_line1', v_provider.address_line1,
      'address_line2', v_provider.address_line2,
      'postal_code',   v_provider.postal_code,
      'city',          v_provider.city,
      'country',       v_provider.country,
      'email',         v_email,
      'phone',         v_provider.phone,
      'iban',          v_provider.iban,
      'bic',           v_provider.bic,
      'vat_regime',    v_provider.vat_regime
    ),
    v_provider.vat_rate,
    NOW()
  )
  RETURNING id INTO v_invoice_id;

  -- ---- 2. Lignes, depuis les prestations validees et non encore facturees.
  WITH billable AS (
    SELECT m.*, c.name AS category_name, c.pennylane_category_id
    FROM inv_missions m
    JOIN inv_categories c ON c.id = m.category_id
    WHERE m.provider_id = p_provider_id
      AND m.id = ANY(p_mission_ids)
      AND m.status = 'approved'
      AND m.invoice_id IS NULL
  )
  INSERT INTO inv_invoice_lines (
    invoice_id, mission_id, description, category_name,
    pennylane_category_id, pricing_type, quantity, unit_amount_ht,
    total_ht, vat_rate, vat_amount, total_ttc, period_label, sort_order
  )
  SELECT
    v_invoice_id,
    b.id,
    b.detail,
    b.category_name,
    b.pennylane_category_id,
    b.pricing_type,
    b.quantity,
    b.unit_amount_ht,
    b.total_ht,
    v_provider.vat_rate,
    ROUND(b.total_ht * v_provider.vat_rate / 100, 2),
    b.total_ht + ROUND(b.total_ht * v_provider.vat_rate / 100, 2),
    CASE
      WHEN b.end_date IS NULL OR b.end_date = b.start_date
        THEN TO_CHAR(b.start_date, 'DD/MM/YYYY')
      ELSE 'du ' || TO_CHAR(b.start_date, 'DD/MM/YYYY') || ' au ' || TO_CHAR(b.end_date, 'DD/MM/YYYY')
    END,
    ROW_NUMBER() OVER (ORDER BY b.start_date, b.created_at)
  FROM billable b;

  GET DIAGNOSTICS v_lines = ROW_COUNT;
  IF v_lines = 0 THEN
    -- Annule tout, y compris l'increment du compteur de numerotation :
    -- pas de trou dans la sequence des factures.
    RAISE EXCEPTION 'Aucune prestation validée et non facturée dans cette sélection.';
  END IF;

  -- ---- 3. Rattachement des prestations, puis totaux depuis les lignes.
  UPDATE inv_missions m
     SET status = 'invoiced', invoice_id = v_invoice_id
   WHERE m.provider_id = p_provider_id
     AND m.id = ANY(p_mission_ids)
     AND m.status = 'approved'
     AND m.invoice_id IS NULL;

  UPDATE inv_invoices i
     SET subtotal_ht   = t.subtotal,
         vat_amount    = t.vat,
         total_ttc     = t.subtotal + t.vat,
         period_start  = p.period_start,
         period_end    = p.period_end
    FROM (
      SELECT SUM(total_ht) AS subtotal, SUM(vat_amount) AS vat
      FROM inv_invoice_lines WHERE invoice_id = v_invoice_id
    ) t,
    (
      SELECT MIN(start_date) AS period_start,
             MAX(COALESCE(end_date, start_date)) AS period_end
      FROM inv_missions WHERE invoice_id = v_invoice_id
    ) p
   WHERE i.id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION inv_create_invoice(UUID, UUID[]) TO authenticated;
