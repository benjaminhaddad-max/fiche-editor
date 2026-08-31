-- ============================================================
-- BARÈME PORTÉ PAR LE CONTRAT
-- ============================================================
-- Chaque programme a son propre barème au prorata :
--   PASS/LAS/LSPS     1 000 € par semestre pour 30 étudiants
--   Terminale Santé     750 € par semestre pour 60 étudiants
--
-- On le stocke sur le contrat plutôt que de le coder en dur : un barème
-- change d'une année sur l'autre, et une facture déjà émise doit rester
-- lisible avec le barème qui s'appliquait au moment de la signature.
--
--   montant du semestre = rate_base_amount × (headcount ÷ rate_base_headcount)

ALTER TABLE inv_coaching_contracts
  ADD COLUMN IF NOT EXISTS rate_base_amount    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS rate_base_headcount INTEGER,
  ADD COLUMN IF NOT EXISTS semesters           INTEGER NOT NULL DEFAULT 2;

ALTER TABLE inv_coaching_contracts
  DROP CONSTRAINT IF EXISTS inv_contracts_rate_ck;
ALTER TABLE inv_coaching_contracts
  ADD CONSTRAINT inv_contracts_rate_ck CHECK (
    -- Soit un barème complet au prorata, soit un forfait sans barème.
    (rate_base_amount IS NULL AND rate_base_headcount IS NULL)
    OR (rate_base_amount > 0 AND rate_base_headcount > 0 AND headcount IS NOT NULL)
  );

COMMENT ON COLUMN inv_coaching_contracts.rate_base_amount IS
  'Montant de référence par semestre (1000 € pour PASS/LAS/LSPS, 750 € pour Terminale Santé).';
COMMENT ON COLUMN inv_coaching_contracts.rate_base_headcount IS
  'Effectif de référence correspondant (30 pour PASS/LAS/LSPS, 60 pour Terminale Santé).';

-- Recalcule le montant attendu, pour contrôle. Ne modifie rien : un écart
-- entre le calcul et le montant signé doit être vu, pas corrigé en silence.
CREATE OR REPLACE FUNCTION inv_contract_expected_total(p_contract_id UUID)
RETURNS NUMERIC
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ROUND(rate_base_amount * headcount::NUMERIC / rate_base_headcount, 2) * semesters
  FROM inv_coaching_contracts
  WHERE id = p_contract_id AND rate_base_amount IS NOT NULL;
$$;
