-- Reçus d'abonnement et de dépenses carte, déposés dans la boîte de dépôt
-- et rapprochés des mouvements Pennylane qui attendent un justificatif.
--
-- Un reçu n'est pas une facture de prestataire : il est déjà payé, par
-- carte ou par prélèvement, et il ne crée ni fiche fournisseur ici ni
-- facture à valider. Il cherche seulement son mouvement bancaire.

CREATE TABLE IF NOT EXISTS inv_justificatifs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand                 text NOT NULL DEFAULT 'diploma',
  created_at            timestamptz NOT NULL DEFAULT now(),
  -- Ce que l'IA a lu sur le reçu.
  fournisseur           text,
  marque                text,
  date_paiement         date,
  montant               numeric(12,2),
  devise                text NOT NULL DEFAULT 'EUR',
  montant_tva           numeric(12,2),
  taux_tva              numeric(5,2),
  numero                text,
  -- D'où il vient.
  pdf_path              text NOT NULL,
  filename              text NOT NULL,
  email_message_id      text,
  inbound_from          text,
  -- Où il en est.
  statut                text NOT NULL DEFAULT 'a_rattacher'
                        CHECK (statut IN ('a_rattacher', 'rattache', 'ignore')),
  candidats             jsonb NOT NULL DEFAULT '[]'::jsonb,
  transaction_id        bigint,
  transaction_label     text,
  transaction_date      date,
  transaction_montant   numeric(12,2),
  pennylane_supplier_id bigint,
  pennylane_invoice_id  bigint,
  rattache_le           timestamptz,
  -- 'auto' pour un dépôt tout seul, sinon l'id de qui a cliqué.
  rattache_par          text,
  erreur                text,
  rapproche_le          timestamptz
);

CREATE INDEX IF NOT EXISTS inv_justificatifs_statut ON inv_justificatifs (brand, statut, created_at DESC);
-- Une transaction ne reçoit qu'un reçu d'ici : deux dépôts sur le même
-- mouvement, c'est un doublon dans la comptabilité.
CREATE UNIQUE INDEX IF NOT EXISTS inv_justificatifs_transaction
  ON inv_justificatifs (transaction_id) WHERE transaction_id IS NOT NULL;
-- Le même PDF relevé deux fois (message transféré deux fois) n'entre qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS inv_justificatifs_message
  ON inv_justificatifs (email_message_id, filename) WHERE email_message_id IS NOT NULL;

-- L'état des justificatifs d'un mois, figé le 5 du mois suivant.
CREATE TABLE IF NOT EXISTS inv_etats_justificatifs (
  brand       text NOT NULL DEFAULT 'diploma',
  mois        text NOT NULL,
  calcule_le  timestamptz NOT NULL DEFAULT now(),
  donnees     jsonb NOT NULL,
  envoye_le   timestamptz,
  envoye_a    text,
  PRIMARY KEY (brand, mois)
);

-- Les réglages que Ben allume lui-même, sans redéploiement.
CREATE TABLE IF NOT EXISTS inv_reglages (
  brand      text NOT NULL DEFAULT 'diploma',
  cle        text NOT NULL,
  valeur     jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (brand, cle)
);

-- Lu et écrit par le serveur seulement (clé de service) : aucune politique
-- n'ouvre ces tables aux comptes connectés.
ALTER TABLE inv_justificatifs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_etats_justificatifs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_reglages             ENABLE ROW LEVEL SECURITY;
