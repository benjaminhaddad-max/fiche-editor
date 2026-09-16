-- Ajouts isolés : Postgres exige qu'une valeur d'enum soit commitée avant
-- d'être utilisée. À jouer avant 17b.

-- Une prestation peut naître d'un bon de mission accepté.
ALTER TYPE inv_mission_origin ADD VALUE IF NOT EXISTS 'order';

-- Entre « transmise » et « payée », l'administration valide la facture :
-- c'est la file d'attente d'où elle part vers Pennylane.
ALTER TYPE inv_invoice_status ADD VALUE IF NOT EXISTS 'validated' AFTER 'sent';
