-- ============================================================
-- ESPACE SOCIAL — fiches « à vérifier » (retour de Shirel du 9 novembre)
-- ============================================================
-- La liste des salariés est pré-remplie depuis le fichier de Net Paye
-- (matricule et nom seulement) : le profil et l'email y sont devinés ou
-- absents. La fiche le dit jusqu'à ce que Shirel l'ait relue et
-- enregistrée depuis Espace Social → Salariés.
--
-- Rejouable.
ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS social_a_verifier BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN inv_providers.social_a_verifier IS
  'Espace Social : profil ou email devinés à l''import, à relire par l''équipe paie.';
