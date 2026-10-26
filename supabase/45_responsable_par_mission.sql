-- Le responsable suit la nature de la mission, pas la personne.
--
-- Jusqu'ici chaque prestataire avait un manager par défaut, et toutes ses
-- déclarations lui revenaient. Or quelqu'un cumule les rôles : chez Medibox,
-- un coach fait aussi du tutorat. Sarah doit vérifier ses heures de tutorat,
-- Nolwenn son coaching — la même personne, deux responsables selon ce
-- qu'elle a fait.
--
-- La catégorie porte donc son responsable. Celui du prestataire reste le
-- repli quand la catégorie n'en désigne aucun.

ALTER TABLE inv_categories
  ADD COLUMN IF NOT EXISTS default_manager_id UUID REFERENCES inv_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN inv_categories.default_manager_id IS
  'Qui vérifie les prestations de cette catégorie. À défaut, le manager '
  'par défaut du prestataire.';
