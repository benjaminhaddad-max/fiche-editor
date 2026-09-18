-- Les enregistreurs de cours forment un pôle à part : ce n'est ni du
-- coaching, ni de l'enseignement, et Eloïse en a la charge.
ALTER TYPE inv_pole ADD VALUE IF NOT EXISTS 'enregistrement';
