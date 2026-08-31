-- ============================================================
-- CORRECTIF : les id_pennylane sont des ID de CATEGORIES Pennylane,
-- pas des comptes du plan comptable.
--
-- Verifie contre l'API le 31/08/2026 : GET /categories renvoie bien
-- 21634805 "Pédagogie - Professeur", 21634860 "Pédagogie - Référent", etc.
-- Les comptes comptables, eux, ont des ID a 13 chiffres.
--
-- La categorisation se fait au niveau de la FACTURE :
--   PUT /supplier_invoices/{id}/categories  [{ id, weight }]
-- et non sur les lignes.
-- ============================================================

ALTER TABLE inv_categories
  RENAME COLUMN pennylane_ledger_account_id TO pennylane_category_id;

ALTER TABLE inv_invoice_lines
  RENAME COLUMN pennylane_ledger_account_id TO pennylane_category_id;
