-- Catégorie comptable des enregistrements. La ventilation Pennylane reprend
-- celle du pôle pédagogique référent : à ajuster dans Catégories si la
-- comptabilité veut une ligne distincte.
INSERT INTO inv_categories (name, provider_label, pennylane_label, pennylane_category_id, pole, sort_order, visible_to_provider, is_active)
SELECT
  'Pédagogie - Enregistrement',
  'Enregistrement de cours',
  'Pédagogie - Référent',
  (SELECT pennylane_category_id FROM inv_categories WHERE name ILIKE '%Référent%' LIMIT 1),
  'enregistrement',
  25,
  TRUE,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM inv_categories WHERE pole = 'enregistrement');
