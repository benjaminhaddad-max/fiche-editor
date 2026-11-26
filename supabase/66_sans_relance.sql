-- ============================================================
-- Exclusion volontaire des relances de paie (Ben, 26/11/2026)
-- ============================================================
-- Une fiche marquée ne reçoit rien de l'Espace Social : ni demande, ni
-- relance (email ou SMS), ni renvoi pour correction, ni invitation. Ce n'est
-- plus l'absence d'email qui l'épargne : c'est voulu, et écrit.
-- Rejouable.

ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS social_sans_relance BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_sans_relance_motif TEXT;

-- Julien Yamin (matricule 00019) : à la demande de Ben. État avant : les deux
-- colonnes n'existaient pas (aucune autre valeur de la fiche n'est touchée).
UPDATE inv_providers
   SET social_sans_relance = true,
       social_sans_relance_motif = 'Exclu volontairement des relances, à la demande de Ben'
 WHERE id = '6e7b09ba-ecb1-4c0a-aeb4-9bea163aa030';
