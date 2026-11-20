-- ============================================================
-- DROITS D'AUTEUR — pièce « attestation de droits maladie »
-- (Meghira, validé le 20/11/2026, transmis par Nolwenn)
-- ============================================================
-- Avant de payer un auteur non-résident fiscal, Medibox demande :
-- certificat de résidence fiscale (Cerfa 5000), formulaire A1 s'il existe,
-- sinon une attestation de droits maladie, plus NIR, IBAN et note au brut.
-- Le Cerfa 5000 se range sous « residence_fiscale », le A1 sous « a1 » ;
-- l'attestation de droits maladie prend son propre type.

ALTER TABLE inv_documents DROP CONSTRAINT IF EXISTS inv_documents_kind_ck;
ALTER TABLE inv_documents ADD CONSTRAINT inv_documents_kind_ck
  CHECK (kind IN ('bulletin', 'contrat', 'attestation', 'domicile', 'identite',
                  'residence_fiscale', 'a1', 'droits_maladie', 'autre'));
