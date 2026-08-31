-- ============================================================
-- CONTRATS DE COACHING
-- ============================================================
-- Deux barèmes coexistent, et ils ne se ressemblent pas :
--
--   PASS/LAS/LSPS      1 000 € par semestre × (effectif ÷ 30)
--                      3 échéances : fin août 30 %, fin octobre 40 %,
--                      fin décembre 30 %
--
--   PAES / Terminale   forfait annuel fixe (1 500 € ou 2 000 €)
--                      2 échéances : fin janvier, fin juin — et la
--                      répartition varie d'un contrat à l'autre
--                      (500/1000 pour les uns, 1000/1000 pour d'autres)
--
-- D'où le choix de stocker l'échéancier EXPLICITEMENT plutôt que de le
-- déduire d'une règle : aucune règle ne couvre les deux cas, et un
-- contrat signé prime toujours sur une formule.
--
-- L'effectif est figé (article 6.1 du contrat : arrêté à la pré-rentrée).
-- On ne le recalcule jamais : un abandon en novembre ne doit pas modifier
-- une facture déjà émise.

DO $$ BEGIN
  CREATE TYPE inv_coaching_program AS ENUM ('pass_las_lsps', 'paes', 'terminale_sante');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inv_contract_status AS ENUM ('draft', 'active', 'ended', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inv_coaching_contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  manager_id        UUID REFERENCES inv_users(id),
  category_id       UUID REFERENCES inv_categories(id),

  program           inv_coaching_program NOT NULL,
  academic_year     TEXT NOT NULL,              -- '2026-2027'
  classes_label     TEXT NOT NULL,              -- 'Classes 1 et 2', 'Classe à distance'
  campus            TEXT,                       -- 'Quai de la Rapée', 'À distance'

  -- Renseigné uniquement au prorata (PASS/LAS/LSPS). Figé à la pré-rentrée.
  headcount         INTEGER CHECK (headcount IS NULL OR headcount >= 0),
  headcount_fixed_at DATE,

  total_ht          NUMERIC(12,2) NOT NULL CHECK (total_ht >= 0),
  status            inv_contract_status NOT NULL DEFAULT 'draft',

  -- Rattachement à la source, quand elle existe (absente pour PAES/Terminale).
  lab_coach_email   TEXT,
  lab_groupe_ids    UUID[],

  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inv_contract_instalments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES inv_coaching_contracts(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,                  -- 'Échéance fin janvier 2027'
  due_date      DATE NOT NULL,
  amount_ht     NUMERIC(12,2) NOT NULL CHECK (amount_ht >= 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,

  -- La prestation générée pour cette échéance, une fois le contrat activé.
  mission_id    UUID REFERENCES inv_missions(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_provider ON inv_coaching_contracts(provider_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status   ON inv_coaching_contracts(status);
CREATE INDEX IF NOT EXISTS idx_instalments_contract ON inv_contract_instalments(contract_id);
CREATE INDEX IF NOT EXISTS idx_instalments_due      ON inv_contract_instalments(due_date);

DROP TRIGGER IF EXISTS t_inv_contracts_updated ON inv_coaching_contracts;
CREATE TRIGGER t_inv_contracts_updated BEFORE UPDATE ON inv_coaching_contracts
  FOR EACH ROW EXECUTE FUNCTION inv_touch_updated_at();

-- La somme des échéances doit égaler le montant du contrat : sans ça, on
-- facture un total différent de ce qui a été signé.
CREATE OR REPLACE FUNCTION inv_contract_balance(p_contract_id UUID)
RETURNS TABLE (total_ht NUMERIC, instalments_ht NUMERIC, balanced BOOLEAN)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.total_ht,
         COALESCE(SUM(i.amount_ht), 0),
         c.total_ht = COALESCE(SUM(i.amount_ht), 0)
  FROM inv_coaching_contracts c
  LEFT JOIN inv_contract_instalments i ON i.contract_id = c.id
  WHERE c.id = p_contract_id
  GROUP BY c.total_ht;
$$;

-- ---------- RLS ----------
ALTER TABLE inv_coaching_contracts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_contract_instalments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contracts_select_own ON inv_coaching_contracts;
CREATE POLICY contracts_select_own ON inv_coaching_contracts
  FOR SELECT USING (provider_id = inv_my_provider_id());

DROP POLICY IF EXISTS contracts_select_staff ON inv_coaching_contracts;
CREATE POLICY contracts_select_staff ON inv_coaching_contracts
  FOR SELECT USING (inv_my_role() IN ('manager', 'admin'));

DROP POLICY IF EXISTS contracts_admin_all ON inv_coaching_contracts;
CREATE POLICY contracts_admin_all ON inv_coaching_contracts
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

DROP POLICY IF EXISTS instalments_select ON inv_contract_instalments;
CREATE POLICY instalments_select ON inv_contract_instalments
  FOR SELECT USING (
    contract_id IN (
      SELECT id FROM inv_coaching_contracts
      WHERE provider_id = inv_my_provider_id() OR inv_my_role() IN ('manager', 'admin')
    )
  );

DROP POLICY IF EXISTS instalments_admin_all ON inv_contract_instalments;
CREATE POLICY instalments_admin_all ON inv_contract_instalments
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');
