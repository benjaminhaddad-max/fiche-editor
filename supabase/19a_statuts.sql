-- Nouvelles valeurs de statut : à commiter avant d'être utilisées.
ALTER TYPE inv_employment ADD VALUE IF NOT EXISTS 'salarie';
ALTER TYPE inv_employment ADD VALUE IF NOT EXISTS 'salarie_enseignant';
ALTER TYPE inv_employment ADD VALUE IF NOT EXISTS 'interim';
