-- ============================================================
-- DIPLOMA INVOICE — CREATION ATOMIQUE D'UNE FACTURE
-- A executer APRES 03_seed.sql
-- ============================================================
-- Tout se passe dans UNE transaction : numerotation, snapshot de
-- l'emetteur, lignes et verrouillage des prestations. Impossible
-- d'obtenir une facture a moitie creee ou deux fois le meme numero.

DROP FUNCTION IF EXISTS inv_create_invoice(UUID, UUID[]);

CREATE OR REPLACE FUNCTION inv_create_invoice(
  p_provider_id UUID,
  p_mission_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_provider   inv_providers%ROWTYPE;
  v_email      TEXT;
  v_invoice_id UUID;
  v_number     TEXT;
  v_lines      INTEGER;
BEGIN
  -- ---- Controle d'acces : sa propre fiche, ou admin.
  IF NOT (inv_my_provider_id() = p_provider_id OR inv_my_role() = 'admin') THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;

  -- Verrou : bloque une seconde facture concurrente pour ce prestataire.
  SELECT * INTO v_provider FROM inv_providers WHERE id = p_provider_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prestataire introuvable.';
  END IF;

  IF v_provider.legal_name IS NULL OR v_provider.address_line1 IS NULL
     OR v_provider.postal_code IS NULL OR v_provider.city IS NULL THEN
    RAISE EXCEPTION 'Profil de facturation incomplet : renseignez votre raison sociale et votre adresse.';
  END IF;

  SELECT email INTO v_email FROM inv_users WHERE id = v_provider.user_id;

  v_number := inv_next_invoice_number(p_provider_id);

  -- ---- 1. Coquille de la facture (totaux calcules a l'etape 3).
  INSERT INTO inv_invoices (
    provider_id, number, status, issue_date, due_date,
    issuer_snapshot, vat_rate, issued_at
  ) VALUES (
    p_provider_id,
    v_number,
    'issued',
    CURRENT_DATE,
    CURRENT_DATE + (v_provider.payment_terms_days || ' days')::INTERVAL,
    jsonb_build_object(
      'legal_name',    v_provider.legal_name,
      'legal_form',    v_provider.legal_form,
      'siret',         v_provider.siret,
      'vat_number',    v_provider.vat_number,
      'address_line1', v_provider.address_line1,
      'address_line2', v_provider.address_line2,
      'postal_code',   v_provider.postal_code,
      'city',          v_provider.city,
      'country',       v_provider.country,
      'email',         v_email,
      'phone',         v_provider.phone,
      'iban',          v_provider.iban,
      'bic',           v_provider.bic,
      'vat_regime',    v_provider.vat_regime
    ),
    v_provider.vat_rate,
    NOW()
  )
  RETURNING id INTO v_invoice_id;

  -- ---- 2. Lignes, depuis les prestations validees et non encore facturees.
  WITH billable AS (
    SELECT m.*, c.name AS category_name, c.pennylane_category_id
    FROM inv_missions m
    JOIN inv_categories c ON c.id = m.category_id
    WHERE m.provider_id = p_provider_id
      AND m.id = ANY(p_mission_ids)
      AND m.status = 'approved'
      AND m.invoice_id IS NULL
  )
  INSERT INTO inv_invoice_lines (
    invoice_id, mission_id, description, category_name,
    pennylane_category_id, pricing_type, quantity, unit_amount_ht,
    total_ht, vat_rate, vat_amount, total_ttc, period_label, sort_order
  )
  SELECT
    v_invoice_id,
    b.id,
    b.detail,
    b.category_name,
    b.pennylane_category_id,
    b.pricing_type,
    b.quantity,
    b.unit_amount_ht,
    b.total_ht,
    v_provider.vat_rate,
    ROUND(b.total_ht * v_provider.vat_rate / 100, 2),
    b.total_ht + ROUND(b.total_ht * v_provider.vat_rate / 100, 2),
    CASE
      WHEN b.end_date IS NULL OR b.end_date = b.start_date
        THEN TO_CHAR(b.start_date, 'DD/MM/YYYY')
      ELSE 'du ' || TO_CHAR(b.start_date, 'DD/MM/YYYY') || ' au ' || TO_CHAR(b.end_date, 'DD/MM/YYYY')
    END,
    ROW_NUMBER() OVER (ORDER BY b.start_date, b.created_at)
  FROM billable b;

  GET DIAGNOSTICS v_lines = ROW_COUNT;
  IF v_lines = 0 THEN
    -- Annule tout, y compris l'increment du compteur de numerotation :
    -- pas de trou dans la sequence des factures.
    RAISE EXCEPTION 'Aucune prestation validée et non facturée dans cette sélection.';
  END IF;

  -- ---- 3. Rattachement des prestations, puis totaux depuis les lignes.
  UPDATE inv_missions m
     SET status = 'invoiced', invoice_id = v_invoice_id
   WHERE m.provider_id = p_provider_id
     AND m.id = ANY(p_mission_ids)
     AND m.status = 'approved'
     AND m.invoice_id IS NULL;

  UPDATE inv_invoices i
     SET subtotal_ht   = t.subtotal,
         vat_amount    = t.vat,
         total_ttc     = t.subtotal + t.vat,
         period_start  = p.period_start,
         period_end    = p.period_end
    FROM (
      SELECT SUM(total_ht) AS subtotal, SUM(vat_amount) AS vat
      FROM inv_invoice_lines WHERE invoice_id = v_invoice_id
    ) t,
    (
      SELECT MIN(start_date) AS period_start,
             MAX(COALESCE(end_date, start_date)) AS period_end
      FROM inv_missions WHERE invoice_id = v_invoice_id
    ) p
   WHERE i.id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION inv_create_invoice(UUID, UUID[]) TO authenticated;
