-- ============================================================
-- ÉCHANGES AUTOUR D'UN BORDEREAU
-- ============================================================
-- Le bordereau n'est pas un document figé qu'on subit : le prestataire doit
-- pouvoir y ajouter ce qu'on a oublié, signaler ce qui cloche, puis choisir
-- de générer sa facture ou de déposer la sienne.
--
-- Pendant la semaine de vérification, les managers reprennent ces retours et
-- tranchent. Chacun ne voit que ses propres lignes.

ALTER TABLE inv_statements
  ADD COLUMN IF NOT EXISTS provider_comment      TEXT,
  ADD COLUMN IF NOT EXISTS provider_responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count        INTEGER NOT NULL DEFAULT 0,
  -- Date à laquelle la facture est attendue : reprise du cycle, mais
  -- modifiable au cas par cas — un accord de vive voix doit pouvoir primer.
  ADD COLUMN IF NOT EXISTS invoice_expected_at   DATE;

COMMENT ON COLUMN inv_statements.provider_comment IS
  'Remarque libre du prestataire sur son bordereau. Volontairement non structuré : '
  'on ne sait pas d''avance ce qu''il aura à signaler.';

-- Le prestataire peut commenter et accepter son bordereau, rien d'autre.
DROP POLICY IF EXISTS statements_accept_own ON inv_statements;
CREATE POLICY statements_accept_own ON inv_statements
  FOR UPDATE
  USING (provider_id = inv_my_provider_id() AND status IN ('sent', 'contested'))
  WITH CHECK (provider_id = inv_my_provider_id() AND status IN ('sent', 'contested', 'accepted'));

-- Une prestation ajoutée par le prestataire depuis son bordereau lui reste
-- rattachée : c'est ce qui permet au manager de la retrouver au bon endroit.
DROP POLICY IF EXISTS missions_add_to_statement ON inv_missions;
CREATE POLICY missions_add_to_statement ON inv_missions
  FOR INSERT
  WITH CHECK (
    provider_id = inv_my_provider_id()
    AND status = 'submitted'
    AND origin = 'provider'
  );
