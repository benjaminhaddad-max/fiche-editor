-- ============================================================
-- DOCUMENTS DES PERSONNES : CONTRATS ET BULLETINS
-- ============================================================
-- Tout ce qui se rapporte à une personne et qu'elle doit pouvoir retrouver :
-- son contrat, ses bulletins de salaire, une attestation. Les bulletins
-- arrivent du cabinet ; ils sont rangés par personne et par mois, et chacun
-- ne voit que les siens.

CREATE TABLE IF NOT EXISTS inv_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  -- 'bulletin' | 'contrat' | 'attestation' | 'autre'
  kind         TEXT NOT NULL DEFAULT 'autre',
  -- Mois concerné, pour un bulletin : 'YYYY-MM'.
  period       TEXT,
  label        TEXT NOT NULL,
  path         TEXT NOT NULL,
  filename     TEXT,
  -- 'email' | 'upload' | 'silae'
  source       TEXT NOT NULL DEFAULT 'upload',
  uploaded_by  UUID REFERENCES inv_users(id),
  -- Montants lus sur un bulletin, pour le suivi des dépenses.
  gross_amount NUMERIC(12,2),
  net_amount   NUMERIC(12,2),
  cost_amount  NUMERIC(12,2),
  ai_read      JSONB,
  file_hash    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT inv_documents_kind_ck CHECK (kind IN ('bulletin', 'contrat', 'attestation', 'autre'))
);

CREATE INDEX IF NOT EXISTS idx_documents_provider ON inv_documents(provider_id, period);
CREATE INDEX IF NOT EXISTS idx_documents_kind     ON inv_documents(kind, period);
-- Un même bulletin ne doit pas entrer deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique
  ON inv_documents(provider_id, kind, period) WHERE kind = 'bulletin' AND period IS NOT NULL;

ALTER TABLE inv_documents ENABLE ROW LEVEL SECURITY;

-- Chacun ses documents ; l'administration voit tout. Un bulletin de salaire
-- ne regarde pas les managers.
DROP POLICY IF EXISTS documents_read_own ON inv_documents;
CREATE POLICY documents_read_own ON inv_documents
  FOR SELECT USING (provider_id = inv_my_provider_id() OR inv_my_role() = 'admin');

DROP POLICY IF EXISTS documents_admin ON inv_documents;
CREATE POLICY documents_admin ON inv_documents
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- Coût employeur d'un mois, quand il est connu : sert au suivi des dépenses.
COMMENT ON COLUMN inv_documents.cost_amount IS
  'Coût total employeur lu sur le bulletin. C''est lui qui compte pour le suivi '
  'des dépenses : le net versé ne dit pas ce que la personne coûte.';
