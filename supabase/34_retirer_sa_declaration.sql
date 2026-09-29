-- Retirer sa propre déclaration tant que personne ne l'a regardée.
--
-- Une ligne envoyée en validation ne pouvait plus être reprise : la règle
-- n'autorisait la suppression qu'en brouillon ou après un refus. Alexandra
-- a déclaré son coaching sans savoir qu'il était déjà couvert par son
-- contrat, a vu le doublon sur son récapitulatif, et n'a rien pu faire —
-- la ligne est partie en paie.
--
-- Tant qu'elle est « submitted », la ligne n'engage qu'elle : aucun manager
-- ne s'est prononcé, aucun montant n'est promis. Dès qu'un manager l'a
-- validée, en revanche, elle engage quelqu'un d'autre et redevient
-- intouchable.
DROP POLICY IF EXISTS missions_delete_own ON inv_missions;

CREATE POLICY missions_delete_own ON inv_missions
  FOR DELETE USING (
    provider_id = inv_my_provider_id()
    AND status IN ('draft', 'submitted', 'rejected')
  );
