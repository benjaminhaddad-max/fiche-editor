-- Lissage : étaler sur plusieurs mois ce qui a été fait sur une période
-- (plafond de chiffre d'affaires d'un auto-entrepreneur, par exemple).
--
-- Les missions de la période, une fois validées, passent « lissée » : elles ne
-- partent dans aucun bordereau. Chaque mois, une échéance du plan est portée
-- comme une mission ordinaire — sur la fiche de celui qui facture et qui est
-- payé (le conjoint, par exemple) — donc dans son bordereau, sa facture, son
-- rapprochement de montant, sans rien changer à la vérification.

-- (67a, appliquée à part : une valeur d'enum ne sert pas dans sa propre transaction)
ALTER TYPE inv_mission_status ADD VALUE IF NOT EXISTS 'lissee';

CREATE TABLE IF NOT EXISTS inv_lissages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand            text NOT NULL,
  provider_id      uuid NOT NULL REFERENCES inv_providers(id),
  beneficiaire_id  uuid NOT NULL REFERENCES inv_providers(id),
  titre            text NOT NULL,
  mois_debut_source text NOT NULL,
  mois_fin_source   text NOT NULL,
  actif            boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid
);

CREATE TABLE IF NOT EXISTS inv_lissage_echeances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lissage_id  uuid NOT NULL REFERENCES inv_lissages(id) ON DELETE CASCADE,
  rang        int NOT NULL,
  mois        text NOT NULL,
  montant_ht  numeric(10,2) NOT NULL DEFAULT 0,
  mission_id  uuid REFERENCES inv_missions(id),
  UNIQUE (lissage_id, rang)
);

ALTER TABLE inv_missions ADD COLUMN IF NOT EXISTS lissage_id uuid REFERENCES inv_lissages(id);

ALTER TABLE inv_lissages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_lissage_echeances ENABLE ROW LEVEL SECURITY;
