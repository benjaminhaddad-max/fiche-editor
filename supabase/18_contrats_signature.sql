-- ============================================================
-- MODÈLES DE CONTRAT, ENVOI ET SIGNATURE EN LIGNE
-- ============================================================
-- Un contrat part de la plateforme, pré-rempli selon le profil, et revient
-- signé. La signature est « simple » au sens du règlement eIDAS : ce qui la
-- rend opposable, c'est le faisceau de preuves conservé ici — lien personnel
-- à usage unique, horodatage, adresse IP, empreinte du document signé.

ALTER TABLE inv_coaching_contracts
  -- Modèle utilisé : 'freelance_temps_plein', 'alternant'…
  ADD COLUMN IF NOT EXISTS profile         TEXT,
  -- Forfait mensuel reconduit automatiquement en prestation à facturer.
  ADD COLUMN IF NOT EXISTS monthly_auto    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monthly_last_run DATE,
  -- Le texte figé au moment de l'envoi : un modèle qui change plus tard ne
  -- doit jamais modifier un contrat déjà signé.
  ADD COLUMN IF NOT EXISTS body            JSONB,
  ADD COLUMN IF NOT EXISTS sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_by         UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS signature_token TEXT,
  ADD COLUMN IF NOT EXISTS signed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signer_name     TEXT,
  ADD COLUMN IF NOT EXISTS signer_email    TEXT,
  ADD COLUMN IF NOT EXISTS signer_ip       TEXT,
  ADD COLUMN IF NOT EXISTS signer_agent    TEXT,
  -- Empreinte SHA-256 du PDF signé : prouve qu'il n'a pas bougé depuis.
  ADD COLUMN IF NOT EXISTS document_hash   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_signature_token
  ON inv_coaching_contracts(signature_token) WHERE signature_token IS NOT NULL;

COMMENT ON COLUMN inv_coaching_contracts.body IS
  'Texte du contrat figé à l''envoi : intitulé, articles, montants. Un modèle '
  'modifié plus tard ne change pas un contrat déjà signé.';
