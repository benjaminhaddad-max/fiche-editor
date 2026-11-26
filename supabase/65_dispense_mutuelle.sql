-- ============================================================
-- Dispense de mutuelle : signée une fois, gardée, redemandée avant échéance
-- (Shirel, 26/11/2026)
-- ============================================================
-- Le salarié remplit et signe en ligne l'attestation sur l'honneur du
-- modèle d'Odile (« Demande de dispense frais de santé »). Elle vaut pour
-- les mois suivants sans être redemandée, jusqu'à l'échéance qu'il indique
-- (« Ma couverture arrivera à échéance le … ») ; sans échéance, elle reste
-- valable. Un mois avant l'échéance, le formulaire lui en redemande une.
--
-- Rien ne s'efface : chaque signature est une ligne, la plus récente fait foi.
-- Rejouable.

CREATE TABLE IF NOT EXISTS inv_mutuelle_dispenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  UUID NOT NULL REFERENCES inv_providers(id) ON DELETE CASCADE,
  -- La case cochée du modèle.
  situation    TEXT NOT NULL CHECK (situation IN ('cmuc_acs', 'assurance_individuelle', 'autre_emploi', 'cdd_court')),
  organisme    TEXT NOT NULL,
  echeance     DATE,
  fait_a       TEXT NOT NULL,
  signe_le     DATE NOT NULL,
  -- Signature : nom et prénom tapés par le salarié, avec l'heure et le compte.
  signature    TEXT NOT NULL,
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_by    UUID REFERENCES inv_users(id) ON DELETE SET NULL,
  ip           TEXT,
  -- Justificatif de l'autre couverture, facultatif.
  document     UUID REFERENCES inv_documents(id) ON DELETE SET NULL,
  -- Le texte exact signé (le modèle peut évoluer).
  texte        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inv_mutuelle_dispenses_provider_idx ON inv_mutuelle_dispenses (provider_id, signed_at DESC);

ALTER TABLE inv_mutuelle_dispenses ENABLE ROW LEVEL SECURITY;
-- Lu et écrit seulement par le serveur (clé de service).
