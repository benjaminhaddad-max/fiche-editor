-- ============================================================
-- JETONS D'INVITATION
-- ============================================================
-- Les liens de récupération Supabase expirent au bout d'une heure par
-- défaut, et ne peuvent pas dépasser 24 h. Trop court : une invitation
-- envoyée le matin est morte l'après-midi, et il faut relancer tout le
-- monde à la main.
--
-- On émet donc notre propre jeton, avec la durée qu'on veut (30 jours).
-- Au moment du clic, il est échangé côté serveur contre un lien Supabase
-- valable quelques minutes — celui-là n'a pas le temps d'expirer.
--
-- Le jeton n'est jamais stocké en clair : seule son empreinte SHA-256
-- l'est. Une fuite de la table ne permettrait de prendre aucun compte.

CREATE TABLE IF NOT EXISTS inv_invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES inv_users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  exchanges    INTEGER NOT NULL DEFAULT 0,
  created_by   UUID REFERENCES inv_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invitations_user ON inv_invitations(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_hash ON inv_invitations(token_hash);

-- Aucune policy de lecture : la table n'est manipulée que par le serveur
-- avec la clé de service. Personne ne doit pouvoir lister les invitations
-- en cours depuis le navigateur.
ALTER TABLE inv_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitations_admin_read ON inv_invitations;
CREATE POLICY invitations_admin_read ON inv_invitations
  FOR SELECT USING (inv_my_role() = 'admin');

COMMENT ON COLUMN inv_invitations.exchanges IS
  'Nombre de fois que le lien a été ouvert. Le jeton reste valable tant que '
  'le mot de passe n''a pas été posé : recharger la page ne doit pas le griller.';
