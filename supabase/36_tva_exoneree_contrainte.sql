-- Le taux zéro vaut aussi pour l'exonération.
--
-- La contrainte n'envisageait que deux régimes : franchise à 0 %, assujetti
-- au-dessus. « exonere » n'étant prévu nulle part, aucune fiche n'aurait pu
-- l'adopter — la valeur d'énumération existait sans pouvoir servir.
ALTER TABLE inv_providers DROP CONSTRAINT IF EXISTS inv_providers_vat_rate_ck;

ALTER TABLE inv_providers ADD CONSTRAINT inv_providers_vat_rate_ck CHECK (
  (vat_regime IN ('franchise', 'exonere') AND vat_rate = 0) OR
  (vat_regime = 'normal' AND vat_rate > 0)
);
