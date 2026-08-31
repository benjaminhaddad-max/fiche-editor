-- Ajout isolé : Postgres exige qu'une valeur d'enum soit commitée
-- avant d'être utilisée. À jouer avant 10b.
ALTER TYPE inv_mission_status ADD VALUE IF NOT EXISTS 'contested';
