-- ============================================================
-- ORIGINE D'UNE PRESTATION
-- ============================================================
-- Trois façons dont une ligne arrive dans le système, et il faut pouvoir
-- les distinguer d'un coup d'œil avant de valider une facture :
--
--   contract   échéance issue d'un contrat de coaching signé
--   manager    saisie par un manager au fil du mois
--   provider   ajoutée par le prestataire, typiquement un oubli
--
-- C'est la dernière qui demande le plus d'attention : c'est la seule que
-- personne chez Diploma Santé n'a saisie.

DO $$ BEGIN
  CREATE TYPE inv_mission_origin AS ENUM ('contract', 'manager', 'provider');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE inv_missions
  ADD COLUMN IF NOT EXISTS origin inv_mission_origin NOT NULL DEFAULT 'provider';

-- Les prestations rattachées à une échéance viennent d'un contrat.
UPDATE inv_missions m
   SET origin = 'contract'
  FROM inv_contract_instalments i
 WHERE i.mission_id = m.id AND m.origin <> 'contract';

CREATE INDEX IF NOT EXISTS idx_missions_origin ON inv_missions(origin);

COMMENT ON COLUMN inv_missions.origin IS
  'Qui a créé la ligne. « provider » signale un ajout du prestataire, à '
  'regarder de près avant validation : personne côté Diploma Santé ne l''a saisi.';
