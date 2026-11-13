-- 54 — Le modèle de certification de précompte, figé sur chaque note.
--
-- Jusqu'ici, l'export Urssaf et la liste des factures recalculaient le
-- précompte d'une note avec la fiche ACTUELLE de l'auteur. Renseigner
-- aujourd'hui la résidence fiscale d'Aurore (Pays-Bas) aurait changé, à
-- l'écran et dans l'export, le net de notes déjà payées en modèle 2.
--
-- La colonne est posée à la première création du PDF de la note. Aucune
-- note existante n'est modifiée : vide + PDF existant = note d'avant le
-- 13/11/2026, calculée en modèle 2 (aucune fiche ne portait de modèle).

ALTER TABLE inv_invoices
  ADD COLUMN IF NOT EXISTS da_model TEXT
  CHECK (da_model IS NULL OR da_model IN ('2', '3', '4'));

COMMENT ON COLUMN inv_invoices.da_model IS
  'Modèle de certification de précompte figé à la création du PDF (2, 3 ou 4). Vide avec un PDF : note d''avant le 13/11/2026, modèle 2.';
