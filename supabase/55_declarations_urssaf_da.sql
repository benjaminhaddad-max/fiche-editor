-- ============================================================
-- DROITS D'AUTEUR — priorité 3 (règles de Nolwenn, 13/11/2026)
-- ============================================================
-- 1. Statut « déclaré » d'un trimestre Urssaf artistes-auteurs, par société.
-- 2. Historique importé (2025, T1 à T3 2026) : les lignes du tableur de
--    Nolwenn, gardées telles quelles. Rien n'est recalculé ni déduit : une
--    case vide reste vide.
--
-- Rejouable. Ne touche à aucune table existante.
-- Lu et écrit seulement par le serveur (clé service) : RLS sans politique.

CREATE TABLE IF NOT EXISTS inv_da_declarations (
  brand        TEXT        NOT NULL,
  trimestre    TEXT        NOT NULL CHECK (trimestre ~ '^\d{4}-T[1-4]$'),
  declared_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  declared_by  UUID        REFERENCES inv_users(id),
  commentaire  TEXT,
  PRIMARY KEY (brand, trimestre)
);
COMMENT ON TABLE inv_da_declarations IS
  'Trimestres de droits d''auteur déclarés à l''Urssaf artistes-auteurs. Une ligne = trimestre déclaré ; la retirer = repasser « à déclarer ».';
ALTER TABLE inv_da_declarations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inv_da_historique (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT        NOT NULL,
  trimestre       TEXT        NOT NULL CHECK (trimestre ~ '^\d{4}-T[1-4]$'),
  date_versement  DATE,
  auteur          TEXT        NOT NULL,
  secu            TEXT,
  brut            NUMERIC(12,2),
  precompte       NUMERIC(12,2),
  net             NUMERIC(12,2),
  contribution    NUMERIC(12,2),
  ligne_source    JSONB       NOT NULL,
  fichier         TEXT,
  import_id       UUID        NOT NULL,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  imported_by     UUID        REFERENCES inv_users(id),
  retire_at       TIMESTAMPTZ
);
COMMENT ON TABLE inv_da_historique IS
  'Droits d''auteur versés avant Invoice (2025, T1-T3 2026), importés du tableur. Valeurs reprises telles quelles, aucune déduite. Un import retiré garde ses lignes (retire_at posé), il n''est jamais effacé.';
CREATE INDEX IF NOT EXISTS inv_da_historique_brand_trim ON inv_da_historique (brand, trimestre) WHERE retire_at IS NULL;
ALTER TABLE inv_da_historique ENABLE ROW LEVEL SECURITY;
