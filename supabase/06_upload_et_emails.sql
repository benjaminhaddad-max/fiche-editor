-- ============================================================
-- 1. Le prestataire choisit : facture générée ou facture déposée
-- 2. Journal des emails Brevo et suivi des relances
-- ============================================================

-- ---------- Mode de facturation ----------
DO $$ BEGIN
  CREATE TYPE inv_invoice_source AS ENUM ('generated', 'uploaded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS invoice_mode inv_invoice_source NOT NULL DEFAULT 'generated';

ALTER TABLE inv_invoices
  ADD COLUMN IF NOT EXISTS pdf_source        inv_invoice_source NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS uploaded_filename TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at  TIMESTAMPTZ;

COMMENT ON COLUMN inv_invoices.pdf_source IS
  'generated = PDF produit par la plateforme ; uploaded = PDF fourni par le prestataire. '
  'Dans les deux cas les MONTANTS restent ceux validés en base : le PDF déposé n''est '
  'qu''une pièce jointe, il ne sert jamais de source pour Pennylane.';

-- Le prestataire peut attacher son propre PDF à une facture émise, tant
-- qu'elle n'est pas partie. Il ne peut rien changer d'autre.
DROP POLICY IF EXISTS invoices_update_own_pdf ON inv_invoices;
CREATE POLICY invoices_update_own_pdf ON inv_invoices
  FOR UPDATE
  USING (provider_id = inv_my_provider_id() AND status IN ('draft', 'issued'))
  WITH CHECK (provider_id = inv_my_provider_id() AND status IN ('draft', 'issued', 'sent'));

-- ---------- Journal des emails ----------
CREATE TABLE IF NOT EXISTS inv_email_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email          TEXT NOT NULL,
  to_name           TEXT,
  template          TEXT NOT NULL,      -- 'mission_rejected' | 'ready_to_invoice' | ...
  subject           TEXT,
  entity_type       TEXT,
  entity_id         UUID,
  provider_id       UUID REFERENCES inv_providers(id) ON DELETE SET NULL,
  brevo_message_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'error', 'skipped')),
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_email_log_entity ON inv_email_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_inv_email_log_created ON inv_email_log(created_at DESC);

ALTER TABLE inv_email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_admin ON inv_email_log;
CREATE POLICY email_log_admin ON inv_email_log
  FOR SELECT USING (inv_my_role() = 'admin');
