-- Un statut pour les artistes-auteurs.
--
-- La plateforme ne connaissait que deux mondes : l'indépendant qui facture,
-- et le salarié qui reçoit un bulletin. L'artiste-auteur n'est ni l'un ni
-- l'autre. Il n'émet pas de facture mais une note de droits d'auteur, il
-- n'est pas tenu d'avoir un SIRET — ses revenus peuvent être déclarés en
-- traitements et salaires quand ils viennent d'un éditeur, d'un producteur
-- ou d'un organisme de gestion collective —, et c'est le diffuseur qui
-- précompte ses cotisations et les déclare à l'Urssaf.
--
-- Leur imposer le SIRET bloquait purement et simplement leur enregistrement
-- chez Medibox, où ils sont la moitié des intervenants.

ALTER TYPE inv_employment ADD VALUE IF NOT EXISTS 'droits_auteur';
