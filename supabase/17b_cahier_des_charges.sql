-- ============================================================
-- CAHIER DES CHARGES DE SEPTEMBRE 2026
-- ============================================================
-- Pôles, contrats de tous types, salariés, bons de mission, déclarations
-- à plusieurs lignes, factures validées et diverses, messagerie.

-- ---------- 1. PÔLES ----------
-- Un pôle regroupe les catégories comptables. C'est lui qui organise les
-- onglets des prestations et le type des contrats.
DO $$ BEGIN
  CREATE TYPE inv_pole AS ENUM ('coaching', 'professeur', 'referent', 'commercial', 'marketing', 'autres');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv_categories ADD COLUMN IF NOT EXISTS pole inv_pole NOT NULL DEFAULT 'autres';

UPDATE inv_categories SET pole = 'coaching'   WHERE name ILIKE '%coaching%';
UPDATE inv_categories SET pole = 'professeur' WHERE name ILIKE '%professeur%';
UPDATE inv_categories SET pole = 'referent'   WHERE name ILIKE '%référent%' OR name ILIKE '%impression%';
UPDATE inv_categories SET pole = 'commercial' WHERE name ILIKE 'commercial%';
UPDATE inv_categories SET pole = 'marketing'  WHERE name ILIKE 'marketing%';

-- ---------- 2. STATUT DES PERSONNES ----------
-- Un indépendant facture. Un vacataire ou un alternant est payé en salaire :
-- il ne facture pas, on déclare ses prestations et ses bonus au social.
DO $$ BEGIN
  CREATE TYPE inv_employment AS ENUM ('independant', 'vacataire', 'alternant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS employment_type inv_employment NOT NULL DEFAULT 'independant',
  -- Fournisseur sans compte (facture reçue par email) : on garde son adresse.
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

ALTER TABLE inv_providers ALTER COLUMN user_id DROP NOT NULL;

-- Les managers reçoivent un SMS quand un prestataire leur écrit.
ALTER TABLE inv_users ADD COLUMN IF NOT EXISTS phone TEXT;

-- ---------- 3. CONTRATS DE TOUS TYPES ----------
-- La table garde son nom historique ; elle porte désormais tous les contrats.
ALTER TABLE inv_coaching_contracts
  ADD COLUMN IF NOT EXISTS contract_type inv_pole NOT NULL DEFAULT 'coaching',
  ADD COLUMN IF NOT EXISTS title        TEXT,
  ADD COLUMN IF NOT EXISTS start_date   DATE,
  ADD COLUMN IF NOT EXISTS end_date     DATE,
  -- 'forfait' (montant global échelonné), 'mission', 'horaire', 'mensuel'
  ADD COLUMN IF NOT EXISTS rate_type    TEXT NOT NULL DEFAULT 'forfait',
  ADD COLUMN IF NOT EXISTS rate_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS conditions   TEXT,
  ADD COLUMN IF NOT EXISTS document_path TEXT;

ALTER TABLE inv_coaching_contracts ALTER COLUMN program       DROP NOT NULL;
ALTER TABLE inv_coaching_contracts ALTER COLUMN classes_label DROP NOT NULL;
ALTER TABLE inv_coaching_contracts ALTER COLUMN academic_year DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE inv_coaching_contracts
    ADD CONSTRAINT inv_contracts_rate_type_ck
    CHECK (rate_type IN ('forfait', 'mission', 'horaire', 'mensuel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_type ON inv_coaching_contracts(contract_type);

-- ---------- 4. PRESTATIONS ----------
DO $$ BEGIN
  CREATE TYPE inv_mission_kind AS ENUM ('prestation', 'bonus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv_missions
  ADD COLUMN IF NOT EXISTS kind            inv_mission_kind NOT NULL DEFAULT 'prestation',
  -- Lignes saisies ensemble, comme sur une facture.
  ADD COLUMN IF NOT EXISTS declaration_id  UUID,
  ADD COLUMN IF NOT EXISTS order_id        UUID,
  -- Qui a saisi la ligne : le prestataire, ou un manager pour lui.
  ADD COLUMN IF NOT EXISTS declared_by     UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS payroll_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_missions_declaration ON inv_missions(declaration_id);
CREATE INDEX IF NOT EXISTS idx_missions_order       ON inv_missions(order_id);
CREATE INDEX IF NOT EXISTS idx_missions_payroll     ON inv_missions(payroll_batch_id);

-- ---------- 5. BONS DE MISSION ----------
DO $$ BEGIN
  CREATE TYPE inv_order_status AS ENUM ('sent', 'accepted', 'declined', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inv_mission_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  manager_id      UUID NOT NULL REFERENCES inv_users(id),
  category_id     UUID NOT NULL REFERENCES inv_categories(id),

  title           TEXT NOT NULL,
  conditions      TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,             -- date à laquelle la mission doit être terminée

  pricing_type    inv_pricing_type NOT NULL DEFAULT 'forfait_mission',
  quantity        NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_amount_ht  NUMERIC(12,2) NOT NULL CHECK (unit_amount_ht >= 0),
  total_ht        NUMERIC(12,2) NOT NULL CHECK (total_ht >= 0),

  status          inv_order_status NOT NULL DEFAULT 'sent',
  responded_at    TIMESTAMPTZ,
  provider_note   TEXT,
  reminded_at     TIMESTAMPTZ,               -- rappel de fin de mission envoyé au manager
  done_at         TIMESTAMPTZ,
  mission_id      UUID REFERENCES inv_missions(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_provider ON inv_mission_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_manager  ON inv_mission_orders(manager_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON inv_mission_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_end      ON inv_mission_orders(end_date);

DROP TRIGGER IF EXISTS t_inv_orders_updated ON inv_mission_orders;
CREATE TRIGGER t_inv_orders_updated BEFORE UPDATE ON inv_mission_orders
  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();

-- ---------- 6. PAIE DES SALARIÉS ----------
CREATE TABLE IF NOT EXISTS inv_payroll_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_month  TEXT NOT NULL,
  total_ht     NUMERIC(12,2) NOT NULL DEFAULT 0,
  lines        INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES inv_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 7. FACTURES ----------
ALTER TABLE inv_invoices
  -- 'platform' : issue du circuit des prestations ; 'misc' : facture diverse.
  ADD COLUMN IF NOT EXISTS kind           TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS validated_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by   UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS category_id    UUID REFERENCES inv_categories(id),
  ADD COLUMN IF NOT EXISTS description    TEXT,
  -- Contrôle de cohérence par lecture du PDF déposé.
  ADD COLUMN IF NOT EXISTS ai_check       JSONB,
  ADD COLUMN IF NOT EXISTS statement_id   UUID REFERENCES inv_statements(id) ON DELETE SET NULL,
  -- Facture diverse : qui l'a apportée, et par quel canal.
  ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS channel        TEXT,
  ADD COLUMN IF NOT EXISTS email_message_id TEXT;

DO $$ BEGIN
  ALTER TABLE inv_invoices ADD CONSTRAINT inv_invoices_kind_ck CHECK (kind IN ('platform', 'misc'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_email_message
  ON inv_invoices(email_message_id, number) WHERE email_message_id IS NOT NULL;

-- ---------- 8. MESSAGERIE ----------
CREATE TABLE IF NOT EXISTS inv_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id      UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  manager_id       UUID NOT NULL REFERENCES inv_users(id),
  subject          TEXT NOT NULL,
  created_by       UUID NOT NULL REFERENCES inv_users(id),
  statement_id     UUID REFERENCES inv_statements(id) ON DELETE SET NULL,
  invoice_id       UUID REFERENCES inv_invoices(id) ON DELETE SET NULL,
  closed_at        TIMESTAMPTZ,
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES inv_threads(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES inv_users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_thread_reads (
  thread_id  UUID NOT NULL REFERENCES inv_threads(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES inv_users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_threads_provider ON inv_threads(provider_id);
CREATE INDEX IF NOT EXISTS idx_threads_manager  ON inv_threads(manager_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread  ON inv_messages(thread_id, created_at);

-- ---------- 9. ÉTAPES DU CYCLE DÉJÀ JOUÉES ----------
-- La tâche quotidienne note ce qu'elle a fait : relancée deux fois, elle ne
-- renvoie rien en double.
CREATE TABLE IF NOT EXISTS inv_cycle_events (
  cycle_month TEXT NOT NULL,
  event       TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cycle_month, event)
);

-- ---------- RLS ----------
-- Les écritures sur ces tables passent par le serveur, après contrôle du
-- rôle. La sécurité en base encadre les lectures.
ALTER TABLE inv_mission_orders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_payroll_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_thread_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_cycle_events    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_read ON inv_mission_orders;
CREATE POLICY orders_read ON inv_mission_orders FOR SELECT USING (
  provider_id = inv_my_provider_id()
  OR manager_id = inv_me()
  OR inv_my_role() = 'admin'
);

DROP POLICY IF EXISTS payroll_admin ON inv_payroll_batches;
CREATE POLICY payroll_admin ON inv_payroll_batches
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

DROP POLICY IF EXISTS threads_read ON inv_threads;
CREATE POLICY threads_read ON inv_threads FOR SELECT USING (
  provider_id = inv_my_provider_id()
  OR manager_id = inv_me()
  OR inv_my_role() = 'admin'
);

DROP POLICY IF EXISTS messages_read ON inv_messages;
CREATE POLICY messages_read ON inv_messages FOR SELECT USING (
  thread_id IN (
    SELECT id FROM inv_threads
    WHERE provider_id = inv_my_provider_id() OR manager_id = inv_me() OR inv_my_role() = 'admin'
  )
);

DROP POLICY IF EXISTS reads_own ON inv_thread_reads;
CREATE POLICY reads_own ON inv_thread_reads FOR SELECT USING (user_id = inv_me());

DROP POLICY IF EXISTS cycle_events_admin ON inv_cycle_events;
CREATE POLICY cycle_events_admin ON inv_cycle_events
  FOR SELECT USING (inv_my_role() = 'admin');

-- Les managers voient les prestataires et leurs prestations pour pouvoir
-- déclarer à leur place : la politique de lecture existe déjà (staff).
