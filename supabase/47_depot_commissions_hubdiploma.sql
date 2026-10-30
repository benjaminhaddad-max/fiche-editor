-- Dépôt de facture de commissions depuis HubDiploma (CRM).
-- Le télépro dépose sa facture sur le CRM une fois d'accord avec Pascal : elle
-- arrive ici en une ligne déjà validée par Pascal, avec son PDF. Pas de nom
-- d'élève : le détail reste dans le CRM.
-- Additif uniquement.

ALTER TABLE inv_missions ADD COLUMN IF NOT EXISTS commission_depot_id uuid;
ALTER TABLE inv_missions ADD COLUMN IF NOT EXISTS commission_pdf_path text;
ALTER TABLE inv_missions ADD COLUMN IF NOT EXISTS commission_pdf_name text;
ALTER TABLE inv_missions ADD COLUMN IF NOT EXISTS commission_ai_check jsonb;

-- Un même dépôt renvoyé par le CRM ne crée jamais deux lignes.
CREATE UNIQUE INDEX IF NOT EXISTS inv_missions_commission_depot_uq
  ON inv_missions (commission_depot_id) WHERE commission_depot_id IS NOT NULL;
