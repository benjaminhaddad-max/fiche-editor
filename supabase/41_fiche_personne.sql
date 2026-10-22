-- Ce qu'il faut d'une personne, au-delà de sa facturation.
--
-- La fiche ne portait que de quoi émettre une facture : raison sociale,
-- SIRET, adresse, IBAN. Pour un salarié ou un auteur, la paie et l'Urssaf
-- en demandent davantage — numéro de sécurité sociale, date de naissance,
-- justificatif de domicile —, et Nolwenn les collectait dans un formulaire
-- à côté.
--
-- Le numéro de sécurité sociale n'est pas une donnée comme une autre : son
-- usage est encadré et limité à ce qui le justifie, ici la paie. Il ne
-- figure donc ni dans les listes, ni dans les exports courants : seules la
-- fiche elle-même et la personne qui prépare les bulletins y accèdent.

ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS birth_date             DATE,
  ADD COLUMN IF NOT EXISTS social_security_number TEXT;

COMMENT ON COLUMN inv_providers.social_security_number IS
  'NIR. Usage limité à la paie et aux déclarations : ne jamais le faire '
  'figurer dans une liste, un export général ou un email.';

-- Le justificatif de domicile et la pièce d'identité rejoignent les types
-- de documents déjà connus (bulletin, contrat, attestation).
ALTER TABLE inv_documents DROP CONSTRAINT IF EXISTS inv_documents_kind_ck;
ALTER TABLE inv_documents ADD CONSTRAINT inv_documents_kind_ck
  CHECK (kind IN ('bulletin', 'contrat', 'attestation', 'domicile', 'identite', 'autre'));
