-- ============================================================
-- FICHE AUTEUR DA — priorité 2 (règles de Nolwenn, 13/11/2026)
-- ============================================================
-- Les colonnes du modèle et du A1 sont nées en 52. Il manque les
-- justificatifs : l'attestation de résidence fiscale et le formulaire A1
-- se déposent sur la fiche, avec une date d'expiration qui déclenche une
-- alerte avant l'échéance.
--
-- Rejouable. Aucune valeur existante n'est modifiée.

ALTER TABLE inv_documents ADD COLUMN IF NOT EXISTS expires_at DATE;

COMMENT ON COLUMN inv_documents.expires_at IS
  'Fin de validité d''un justificatif (attestation de résidence fiscale, A1). Alerte 30 jours avant.';

ALTER TABLE inv_documents DROP CONSTRAINT IF EXISTS inv_documents_kind_ck;
ALTER TABLE inv_documents ADD CONSTRAINT inv_documents_kind_ck
  CHECK (kind IN ('bulletin', 'contrat', 'attestation', 'domicile', 'identite',
                  'residence_fiscale', 'a1', 'autre'));

CREATE INDEX IF NOT EXISTS idx_documents_expiration
  ON inv_documents (expires_at) WHERE expires_at IS NOT NULL;

-- Le modèle 1 est archivé : il ne se pose plus. Une valeur '1' déjà
-- présente resterait lisible (elle se lit comme le 2), d'où un contrôle
-- au niveau de l'écran et non une contrainte qui refuserait l'existant.
