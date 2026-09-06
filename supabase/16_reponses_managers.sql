-- ============================================================
-- RÉPONSES DES MANAGERS AUX SIGNALEMENTS
-- ============================================================
-- La semaine de vérification est un aller-retour : le prestataire signale,
-- les managers concernés répondent, et le bordereau repart validé avec une
-- date de facturation.

CREATE TABLE IF NOT EXISTS inv_statement_replies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES inv_statements(id) ON DELETE CASCADE,
  author_id    UUID NOT NULL REFERENCES inv_users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_statement ON inv_statement_replies(statement_id);

ALTER TABLE inv_statement_replies ENABLE ROW LEVEL SECURITY;

-- Le prestataire lit les réponses portant sur SES bordereaux.
DROP POLICY IF EXISTS replies_read_own ON inv_statement_replies;
CREATE POLICY replies_read_own ON inv_statement_replies
  FOR SELECT USING (
    statement_id IN (SELECT id FROM inv_statements WHERE provider_id = inv_my_provider_id())
  );

DROP POLICY IF EXISTS replies_staff ON inv_statement_replies;
CREATE POLICY replies_staff ON inv_statement_replies
  FOR ALL
  USING (inv_my_role() IN ('manager', 'admin'))
  WITH CHECK (inv_my_role() IN ('manager', 'admin') AND author_id = inv_me());

-- Un manager doit pouvoir clore le bordereau des prestataires dont il a
-- validé des lignes : sans ça, seule l'administration débloquerait tout.
DROP POLICY IF EXISTS statements_staff_update ON inv_statements;
CREATE POLICY statements_staff_update ON inv_statements
  FOR UPDATE
  USING (inv_my_role() IN ('manager', 'admin'))
  WITH CHECK (inv_my_role() IN ('manager', 'admin'));
