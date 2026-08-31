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
-- le nom du donneur d'ordre / du prestataire).
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

-- Le donneur d'ordre valide / refuse ce qui lui est soumis.
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
