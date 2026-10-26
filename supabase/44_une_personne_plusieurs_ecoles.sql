-- ============================================================
-- UNE PERSONNE, PLUSIEURS ÉCOLES
-- ============================================================
-- Meryeme dirige la facturation de Linova et donne des cours pour Diploma.
-- Florine enseigne chez Diploma et rejoint Medibox. Le modèle ne le
-- permettait pas : l'email et l'identifiant de connexion étaient uniques
-- pour toute la plateforme, donc une personne = un compte = une école.
-- Les créer ailleurs échouait sur « cette adresse existe déjà », sans que
-- personne puisse voir où, puisque la recherche est cloisonnée.
--
-- Désormais une même identité de connexion porte un profil par école. On
-- ne touche pas aux trente-neuf politiques de sécurité : ce sont leurs
-- fonctions qui apprennent à choisir le bon profil.
--
-- Quelle école ? Celle que l'application annonce dans l'en-tête `x-marque`
-- de sa requête. Cet en-tête ne peut rien ouvrir : il ne sert qu'à départager
-- les profils de la personne déjà authentifiée. Sans lui — le cron, un
-- traitement interne — le premier profil fait foi, comme avant.

ALTER TABLE inv_users DROP CONSTRAINT IF EXISTS inv_users_auth_id_key;
ALTER TABLE inv_users DROP CONSTRAINT IF EXISTS inv_users_email_key;
ALTER TABLE inv_users ADD CONSTRAINT inv_users_auth_id_brand_key UNIQUE (auth_id, brand);
ALTER TABLE inv_users ADD CONSTRAINT inv_users_email_brand_key   UNIQUE (email, brand);

/* L'école annoncée par l'application pour cette requête, s'il y en a une. */
CREATE OR REPLACE FUNCTION inv_marque_demandee()
RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT nullif(current_setting('request.headers', true)::json ->> 'x-marque', '');
$$;

/* Mon compte, pour l'école en cours. À défaut, le plus ancien. */
CREATE OR REPLACE FUNCTION inv_me()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM inv_users
  WHERE auth_id = auth.uid() AND is_active
  ORDER BY (brand = coalesce(inv_marque_demandee(), brand)) DESC, created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION inv_my_role()
RETURNS inv_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM inv_users
  WHERE auth_id = auth.uid() AND is_active
  ORDER BY (brand = coalesce(inv_marque_demandee(), brand)) DESC, created_at
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION inv_my_brand()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT brand FROM inv_users
  WHERE auth_id = auth.uid() AND is_active
  ORDER BY (brand = coalesce(inv_marque_demandee(), brand)) DESC, created_at
  LIMIT 1;
$$;

/* Ma fiche de prestataire dans l'école en cours. */
CREATE OR REPLACE FUNCTION inv_my_provider_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
  FROM inv_providers p
  JOIN inv_users u ON u.id = p.user_id
  WHERE u.auth_id = auth.uid() AND u.is_active
  ORDER BY (p.brand = coalesce(inv_marque_demandee(), p.brand)) DESC, p.created_at
  LIMIT 1;
$$;

/*
 * Cette ligne est-elle visible d'ici ?
 *
 * Il faut que la personne ait un profil dans l'école de la ligne, et que
 * cette école soit celle qu'elle regarde. « all » traverse dans les deux
 * sens : une catégorie commune se voit de partout, et la direction qui
 * suit toutes les écoles voit tout.
 */
CREATE OR REPLACE FUNCTION inv_brand_ok(cible TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cible IS NULL
      OR cible = 'all'
      OR (
        (inv_marque_demandee() IS NULL OR cible = inv_marque_demandee())
        AND EXISTS (
          SELECT 1 FROM inv_users u
          WHERE u.auth_id = auth.uid() AND u.is_active
            AND (u.brand = 'all' OR u.brand = cible)
        )
      );
$$;
