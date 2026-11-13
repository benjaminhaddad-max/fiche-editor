-- ============================================================
-- NOTES DE DROITS D'AUTEUR — priorité 1 (règles de Nolwenn, 13/11/2026)
-- ============================================================
-- 1. Numérotation : une note de droits d'auteur prend « DA-AAAA-NNNN »,
--    continue par société et par année, sans trou ni doublon. Les
--    indépendants gardent leur numérotation FACT propre (c'est leur suite
--    légale à eux). Les notes existantes ne sont PAS renumérotées.
-- 2. Modèle de certification de l'auteur (2, 3 ou 4) et justificatif A1.
-- 3. Écart entre le montant facturé et le montant prévu : validation
--    manuelle d'un administrateur avant tout paiement.
--
-- Rejouable. Aucune valeur existante n'est modifiée : toutes les colonnes
-- sont nulles par défaut, et NULL veut dire « comportement actuel ».
-- À APPLIQUER AVANT le déploiement du code qui les lit.

-- ------------------------------------------------------------
-- 1. Numérotation DA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inv_note_sequences (
  brand    TEXT    NOT NULL,
  year     INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1 CHECK (next_seq >= 1),
  PRIMARY KEY (brand, year)
);

COMMENT ON TABLE inv_note_sequences IS
  'Compteur des notes de droits d''auteur (DA-AAAA-NNNN) par société et par année. Verrouillé FOR UPDATE dans la transaction de création : un échec annule aussi l''incrément, donc aucun trou.';

-- Rien n'est lu ni écrit en direct : seule inv_next_invoice_number
-- (SECURITY DEFINER) y touche.
ALTER TABLE inv_note_sequences ENABLE ROW LEVEL SECURITY;

-- Garde-fou contre un doublon, même si le compteur était contourné.
-- brand est posé par le déclencheur inv_set_invoice_brand à l'insertion,
-- l'index porte donc bien sur la valeur finale.
CREATE UNIQUE INDEX IF NOT EXISTS inv_invoices_da_number_unique
  ON inv_invoices (brand, number)
  WHERE number LIKE 'DA-%';

CREATE OR REPLACE FUNCTION inv_next_invoice_number(p_provider_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_seq    INTEGER;
  v_type   TEXT;
  v_brand  TEXT;
  v_year   INTEGER;
  v_note   INTEGER;
BEGIN
  SELECT invoice_prefix, next_invoice_seq, employment_type::TEXT, brand
    INTO v_prefix, v_seq, v_type, v_brand
  FROM inv_providers
  WHERE id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prestataire introuvable: %', p_provider_id;
  END IF;

  -- Note de droits d'auteur : une suite par société et par année.
  IF v_type = 'droits_auteur' THEN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

    -- La ligne du compteur naît au premier besoin, à la suite des notes DA
    -- qui existeraient déjà (aucune aujourd'hui). ON CONFLICT DO NOTHING :
    -- deux transactions simultanées se départagent sur le verrou qui suit.
    INSERT INTO inv_note_sequences (brand, year, next_seq)
    SELECT v_brand, v_year,
           COALESCE(MAX(SUBSTRING(i.number FROM '^DA-[0-9]{4}-([0-9]+)$')::INTEGER), 0) + 1
      FROM inv_invoices i
     WHERE i.brand = v_brand
       AND i.number LIKE 'DA-' || v_year || '-%'
    ON CONFLICT (brand, year) DO NOTHING;

    SELECT next_seq INTO v_note
      FROM inv_note_sequences
     WHERE brand = v_brand AND year = v_year
     FOR UPDATE;

    UPDATE inv_note_sequences
       SET next_seq = v_note + 1
     WHERE brand = v_brand AND year = v_year;

    RETURN 'DA-' || v_year || '-' || LPAD(v_note::TEXT, 4, '0');
  END IF;

  -- Indépendants et autres : inchangé, une suite par prestataire.
  UPDATE inv_providers
     SET next_invoice_seq = v_seq + 1
   WHERE id = p_provider_id;

  RETURN v_prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$function$;

-- ------------------------------------------------------------
-- 2. Modèle de certification de précompte, par auteur
-- ------------------------------------------------------------
-- NULL = modèle 2 (résident fiscal France, précompte complet).
-- Le modèle 1 est archivé : il se lit comme le 2.
ALTER TABLE inv_providers
  ADD COLUMN IF NOT EXISTS da_model TEXT
    CHECK (da_model IS NULL OR da_model IN ('1', '2', '3', '4')),
  ADD COLUMN IF NOT EXISTS tax_residence_country TEXT,
  ADD COLUMN IF NOT EXISTS a1_number TEXT,
  ADD COLUMN IF NOT EXISTS a1_issuer TEXT,
  ADD COLUMN IF NOT EXISTS a1_start DATE,
  ADD COLUMN IF NOT EXISTS a1_end DATE,
  ADD COLUMN IF NOT EXISTS da_profile_status TEXT
    CHECK (da_profile_status IS NULL OR da_profile_status IN ('complete', 'incomplete', 'a_valider'));

COMMENT ON COLUMN inv_providers.da_model IS
  'Modèle de certification de précompte : 2 (résident fiscal France, défaut), 3 (non-résident affilié en France), 4 (formulaire A1 valide). 1 archivé. NULL = 2. Un 4 sans A1 valide retombe sur 3 (calculé dans l''application).';
COMMENT ON COLUMN inv_providers.tax_residence_country IS
  'Pays de résidence fiscale, quand il diffère du pays de l''adresse.';
COMMENT ON COLUMN inv_providers.a1_number IS 'Numéro du formulaire A1 (modèle 4).';
COMMENT ON COLUMN inv_providers.a1_issuer IS 'Organisme émetteur du A1 (modèle 4).';
COMMENT ON COLUMN inv_providers.a1_start IS 'Début de validité du A1.';
COMMENT ON COLUMN inv_providers.a1_end IS 'Fin de validité du A1 : au-delà, retour au modèle 3.';
COMMENT ON COLUMN inv_providers.da_profile_status IS
  'État de la fiche droits d''auteur : complete, incomplete ou a_valider (règle à faire valider par le comptable).';

-- ------------------------------------------------------------
-- 3. Écart de montant : validation manuelle avant paiement
-- ------------------------------------------------------------
-- Pas de nouvelle valeur d'enum inv_invoice_status : les valeurs d'enum
-- ne se retirent pas, et « à vérifier » n'est pas une étape du cycle mais
-- une condition qui peut survenir à plusieurs étapes. L'écart se CALCULE
-- (ai_check.matches = false, ou montant lu ≠ montant prévu) ; seule sa
-- levée est stockée : qui l'a validé et quand.
ALTER TABLE inv_invoices
  ADD COLUMN IF NOT EXISTS ecart_valide_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ecart_valide_by UUID REFERENCES inv_users(id),
  ADD COLUMN IF NOT EXISTS ecart_motif TEXT;

COMMENT ON COLUMN inv_invoices.ecart_valide_at IS
  'Date à laquelle un administrateur a validé l''écart entre le montant facturé et le montant prévu. NULL tant que l''écart n''est pas levé.';

-- Dernier filet : quel que soit le chemin (bouton, rapprochement
-- comptable, import), une facture avec un écart non validé ne passe pas
-- à « payée ». Ne s'applique qu'au passage vers « payée » : une facture
-- déjà payée n'est pas touchée.
CREATE OR REPLACE FUNCTION inv_bloquer_paiement_ecart()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status::TEXT = 'paid'
     AND OLD.status::TEXT IS DISTINCT FROM 'paid'
     AND (NEW.ai_check ->> 'matches') = 'false'
     AND NEW.ecart_valide_at IS NULL THEN
    RAISE EXCEPTION
      'Écart de montant non validé sur la facture % : un administrateur doit le valider avant le paiement.', NEW.number
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t_inv_invoices_bloquer_ecart ON inv_invoices;
CREATE TRIGGER t_inv_invoices_bloquer_ecart
  BEFORE UPDATE OF status ON inv_invoices
  FOR EACH ROW EXECUTE FUNCTION inv_bloquer_paiement_ecart();
