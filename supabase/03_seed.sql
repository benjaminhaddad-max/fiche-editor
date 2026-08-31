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
