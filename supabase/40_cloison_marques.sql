-- ============================================================
-- CLOISONNEMENT DES MARQUES, AU NIVEAU DE LA BASE
-- ============================================================
-- Nolwenn, qui dirige Medibox, a ouvert « Bons de mission » et vu les
-- prestataires de Diploma. La cause n'est pas dans l'application : trente-neuf
-- politiques de sécurité accordent la lecture sur `inv_my_role() = 'admin'`,
-- sans un mot sur la marque. Un administrateur d'une école voyait donc les
-- lignes de toutes les autres — c'était vrai pour Linova depuis le premier
-- jour, personne ne s'était connecté pour s'en apercevoir.
--
-- On ne réécrit pas ces trente-neuf politiques : chacune porte des règles
-- propres qu'on risquerait de casser en les retouchant. On ajoute une
-- politique RESTRICTIVE par table. PostgreSQL les combine par ET avec les
-- permissives existantes : quoi qu'autorise une politique, celle-ci peut
-- encore refuser. La règle de marque est ainsi écrite une fois, au même
-- endroit, et une politique oubliée ne peut plus rien ouvrir.
--
-- Le rôle de service n'est pas concerné : il contourne la RLS. Le cron et
-- les traitements d'administration continuent de travailler sur toutes les
-- écoles, et c'est `activeBrandId()` qui les cadre côté application.

CREATE OR REPLACE FUNCTION inv_my_brand()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT brand FROM inv_users WHERE auth_id = auth.uid() AND is_active LIMIT 1;
$$;

-- Cette ligne est-elle visible depuis ma marque ?
--
-- `NULL` laisse passer : une ligne qu'on n'a pas su rattacher ne doit pas
-- disparaître sans bruit. « all » traverse dans les deux sens — une catégorie
-- commune se voit de partout, et la direction qui suit toutes les écoles voit
-- tout.
CREATE OR REPLACE FUNCTION inv_brand_ok(cible TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT cible IS NULL
      OR cible = 'all'
      OR inv_my_brand() = 'all'
      OR inv_my_brand() = cible;
$$;

-- La marque d'un prestataire, d'un contrat, d'une facture.
CREATE OR REPLACE FUNCTION inv_brand_of_provider(p UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT brand FROM inv_providers WHERE id = p $$;

CREATE OR REPLACE FUNCTION inv_brand_of_invoice(i UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT brand FROM inv_invoices WHERE id = i $$;

CREATE OR REPLACE FUNCTION inv_brand_of_contract(c UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT brand FROM inv_coaching_contracts WHERE id = c $$;

CREATE OR REPLACE FUNCTION inv_brand_of_thread(t UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT inv_brand_of_provider(provider_id) FROM inv_threads WHERE id = t $$;

CREATE OR REPLACE FUNCTION inv_brand_of_user(u UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT brand FROM inv_users WHERE id = u $$;

-- Les tables qui portent déjà leur marque.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inv_providers', 'inv_missions', 'inv_invoices',
                           'inv_coaching_contracts', 'inv_categories']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cloison_marque ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY cloison_marque ON public.%I AS RESTRICTIVE FOR ALL
         USING (inv_brand_ok(brand)) WITH CHECK (inv_brand_ok(brand))', t);
  END LOOP;
END $$;

-- Celles qui la tiennent de leur parent.
DO $$
DECLARE
  t TEXT;
  expr TEXT;
  paires TEXT[][] := ARRAY[
    ['inv_mission_orders',       'inv_brand_of_provider(provider_id)'],
    ['inv_threads',              'inv_brand_of_provider(provider_id)'],
    ['inv_statements',           'inv_brand_of_provider(provider_id)'],
    ['inv_documents',            'inv_brand_of_provider(provider_id)'],
    ['inv_payroll_inputs',       'inv_brand_of_provider(provider_id)'],
    ['inv_email_log',            'inv_brand_of_provider(provider_id)'],
    ['inv_import_lines',         'inv_brand_of_provider(provider_id)'],
    ['inv_messages',             'inv_brand_of_thread(thread_id)'],
    ['inv_thread_reads',         'inv_brand_of_thread(thread_id)'],
    ['inv_contract_instalments', 'inv_brand_of_contract(contract_id)'],
    ['inv_invoice_lines',        'inv_brand_of_invoice(invoice_id)'],
    ['inv_invitations',          'inv_brand_of_user(user_id)']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(paires, 1) LOOP
    t := paires[i][1];
    expr := paires[i][2];
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS cloison_marque ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY cloison_marque ON public.%I AS RESTRICTIVE FOR ALL
         USING (inv_brand_ok(%s)) WITH CHECK (inv_brand_ok(%s))', t, expr, expr);
  END LOOP;
END $$;
