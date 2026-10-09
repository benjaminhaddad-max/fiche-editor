-- Le commentaire de colonne invoquait une certification que l'école n'a pas.
--
-- La déclaration séance par séance reste : elle sert à prouver qu'un cours a
-- eu lieu, devant quel groupe et à quelle heure, et c'est ce qui conditionne
-- le paiement du professeur. Mais ce n'est pas Qualiopi qui l'impose ici.
COMMENT ON COLUMN inv_categories.requires_session IS
  'Vrai quand la déclaration doit se faire séance par séance : créneau, groupe, module et modalité obligatoires.';
