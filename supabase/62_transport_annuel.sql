-- Abonnement annuel (Navigo annuel…) : déjà enregistré chez Net Paye, le
-- salarié n'a rien à déclarer chaque mois (Shirel, 24/11/2026). Aucun
-- montant ni justificatif ; la ligne ne sort ni dans le récapitulatif
-- transport ni dans les pièces envoyées à Net Paye.
ALTER TABLE inv_payroll_inputs
  ADD COLUMN IF NOT EXISTS transport_annuel BOOLEAN NOT NULL DEFAULT FALSE;
