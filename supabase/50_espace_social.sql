-- ============================================================
-- ESPACE SOCIAL — lot 1 (plan de Shirel du 5 novembre 2026)
-- ============================================================
-- La paie des salariés sort de la facturation des prestataires : son
-- propre calendrier, sa propre fiche par salarié (matricule Silae, profil),
-- son formulaire mensuel, une validation par Shirel, et un export Silae
-- construit seulement à partir de ce qu'elle a validé.
--
-- Rejouable : tout est en IF NOT EXISTS / DROP … IF EXISTS.

-- 1. La fiche salarié ------------------------------------------------------
-- Le matricule Silae est la clé de l'export : sans lui, Net Paye ne sait
-- pas sur quel bulletin porter la ligne. Le profil décide du calendrier
-- (fixes et alternants le 25, vacataires le 1er) et du formulaire.
ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS silae_matricule   TEXT,
  ADD COLUMN IF NOT EXISTS social_profile    TEXT,
  ADD COLUMN IF NOT EXISTS social_entry_date DATE,
  ADD COLUMN IF NOT EXISTS social_exit_date  DATE;

ALTER TABLE inv_providers DROP CONSTRAINT IF EXISTS inv_providers_social_profile_ck;
ALTER TABLE inv_providers ADD CONSTRAINT inv_providers_social_profile_ck
  CHECK (social_profile IS NULL OR social_profile IN ('fixe', 'alternant', 'vacataire'));

CREATE UNIQUE INDEX IF NOT EXISTS inv_providers_matricule_uniq
  ON inv_providers (brand, silae_matricule) WHERE silae_matricule IS NOT NULL;

-- Les fiches déjà sous contrat reçoivent leur profil. L'intérim reste à
-- part : c'est l'agence qui le paie, il n'a pas de bulletin chez nous.
UPDATE inv_providers SET social_profile = CASE employment_type::text
    WHEN 'vacataire' THEN 'vacataire'
    WHEN 'alternant' THEN 'alternant'
    ELSE 'fixe' END
WHERE social_profile IS NULL
  AND employment_type::text IN ('vacataire', 'alternant', 'salarie', 'salarie_enseignant');

-- 2. Le formulaire mensuel ------------------------------------------------
ALTER TABLE inv_payroll_inputs
  ADD COLUMN IF NOT EXISTS status             TEXT NOT NULL DEFAULT 'attente',
  ADD COLUMN IF NOT EXISTS nothing_to_report  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_leave_start   DATE,
  ADD COLUMN IF NOT EXISTS paid_leave_end     DATE,
  ADD COLUMN IF NOT EXISTS unpaid_leave_start DATE,
  ADD COLUMN IF NOT EXISTS unpaid_leave_end   DATE,
  ADD COLUMN IF NOT EXISTS sick_leave_start   DATE,
  ADD COLUMN IF NOT EXISTS sick_leave_end     DATE,
  -- [{heures, du, au, motif, validees_par}] : « Validées par » obligatoire.
  ADD COLUMN IF NOT EXISTS overtime_lines     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transport_renewed  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mutuelle_detail    TEXT,
  ADD COLUMN IF NOT EXISTS mutuelle_document  UUID REFERENCES inv_documents(id) ON DELETE SET NULL,
  -- Net des missions validées du mois, figé à la validation (vacataires).
  ADD COLUMN IF NOT EXISTS missions_total     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS validated_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validated_by       UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS returned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by        UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS return_comment     TEXT,
  ADD COLUMN IF NOT EXISTS transmitted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transmitted_by     UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS export_id          UUID;

ALTER TABLE inv_payroll_inputs DROP CONSTRAINT IF EXISTS inv_payroll_inputs_status_ck;
ALTER TABLE inv_payroll_inputs ADD CONSTRAINT inv_payroll_inputs_status_ck
  CHECK (status IN ('attente', 'a_valider', 'valide', 'a_corriger', 'transmis'));

-- Mutuelle : adhésion, dispense (avec justificatif) ou changement de situation.
ALTER TABLE inv_payroll_inputs DROP CONSTRAINT IF EXISTS inv_payroll_inputs_mutuelle_ck;
ALTER TABLE inv_payroll_inputs ADD CONSTRAINT inv_payroll_inputs_mutuelle_ck
  CHECK (mutuelle IN ('adherent', 'dispense', 'changement', 'refus', 'inconnu'));

-- Les saisies d'avant l'Espace Social : envoyées = à valider, transmises = transmises.
UPDATE inv_payroll_inputs SET status = 'a_valider' WHERE status = 'attente' AND submitted_at IS NOT NULL;
UPDATE inv_payroll_inputs SET status = 'transmis', transmitted_at = exported_at
  WHERE exported_at IS NOT NULL AND status <> 'transmis';

CREATE INDEX IF NOT EXISTS idx_payroll_inputs_status ON inv_payroll_inputs(period, status);

-- 3. Les réglages de l'Espace Social --------------------------------------
-- Calendrier, correspondance variable → code Silae, équipe paie,
-- destinataire chez Net Paye : tout se change dans l'admin, sans
-- redéploiement. Une ligne par école ; les valeurs absentes reprennent
-- celles par défaut du code.
CREATE TABLE IF NOT EXISTS inv_social_settings (
  brand       TEXT PRIMARY KEY,
  calendrier  JSONB NOT NULL DEFAULT '{}'::jsonb,
  codes       JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipe      TEXT[] NOT NULL DEFAULT '{}',
  netpaye_email TEXT,
  netpaye_nom   TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES inv_users(id)
);
ALTER TABLE inv_social_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_settings_admin ON inv_social_settings;
CREATE POLICY social_settings_admin ON inv_social_settings
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

-- 4. Les exports vers Silae -----------------------------------------------
-- Ce qui est parti, quand, par qui, avec quels codes manquants. Le fichier
-- lui-même est gardé : on doit pouvoir dire à Net Paye ce qu'on lui a envoyé.
CREATE TABLE IF NOT EXISTS inv_social_exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  period          TEXT NOT NULL,
  groupe          TEXT NOT NULL CHECK (groupe IN ('fixes', 'vacataires')),
  lignes          INTEGER NOT NULL DEFAULT 0,
  salaries        INTEGER NOT NULL DEFAULT 0,
  codes_manquants JSONB NOT NULL DEFAULT '[]'::jsonb,
  contenu         TEXT NOT NULL,
  envoye_a        TEXT,
  payroll_batch_id UUID,
  created_by      UUID REFERENCES inv_users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_exports_period ON inv_social_exports(brand, period);
ALTER TABLE inv_social_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_exports_admin ON inv_social_exports;
CREATE POLICY social_exports_admin ON inv_social_exports
  FOR ALL USING (inv_my_role() = 'admin') WITH CHECK (inv_my_role() = 'admin');

COMMENT ON TABLE inv_social_settings IS
  'Espace Social : calendrier, codes Silae, équipe paie et destinataire Net Paye, par école.';
COMMENT ON TABLE inv_social_exports IS
  'Espace Social : chaque fichier transmis à Net Paye, construit des seules lignes validées.';
