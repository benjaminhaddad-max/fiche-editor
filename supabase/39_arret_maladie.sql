-- Les arrêts de travail, dans les éléments variables du mois.
--
-- Ils manquaient. Un arrêt maladie se rangeait faute de mieux dans les
-- congés sans solde, alors que ce n'est pas la même chose pour la paie :
-- l'employeur doit l'attestation de salaire, la subrogation éventuelle, et
-- la déduction ne se calcule pas pareil. Surtout, l'arrêt de travail est
-- une pièce qui doit remonter avec les dates, pas une ligne de commentaire.

ALTER TABLE inv_payroll_inputs
  ADD COLUMN IF NOT EXISTS sick_leave_days     NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sick_leave_detail   TEXT,
  ADD COLUMN IF NOT EXISTS sick_leave_document UUID REFERENCES inv_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN inv_payroll_inputs.sick_leave_days IS
  'Jours d''arrêt de travail sur le mois. Distincts des congés sans solde : '
  'la paie les traite autrement et l''arrêt doit être joint.';
