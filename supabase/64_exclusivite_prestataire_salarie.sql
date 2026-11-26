-- ============================================================
-- Une personne est soit prestataire (facture), soit salariée (bulletin)
-- (Shirel, 26/11/2026)
-- ============================================================
-- Côté « salarié » : un statut payé en salaire (vacataire, alternant,
-- salarié, salarié enseignant, intérim) ou une fiche rattachée à l'Espace
-- Social. Côté « prestataire » : tout le reste (indépendant, droits d'auteur).
--
-- 1. Une même fiche ne peut pas être des deux côtés (profil social sur une
--    fiche d'indépendant).
-- 2. Deux fiches de la même école ne peuvent pas désigner la même personne
--    de part et d'autre : même compte, même email, même numéro de sécurité
--    sociale ou même nom (mots du nom dans le désordre, accents ignorés).
--
-- Le blocage ne joue qu'à la création ou au changement de côté / d'identité :
-- rien n'est supprimé ni déplacé. Les cas déjà en base se lisent dans
-- inv_doublons_prestataire_salarie(), affichés dans Espace Social → Salariés.
--
-- Rejouable.

CREATE OR REPLACE FUNCTION inv_cote_salarie(p_employment TEXT, p_social TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_social IS NOT NULL
      OR p_employment IN ('vacataire', 'alternant', 'salarie', 'salarie_enseignant', 'interim')
$$;

-- « YAMIN Julien » et « Julien Yamin » : la même clé.
CREATE OR REPLACE FUNCTION inv_cle_personne(p_nom TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(string_agg(w, ' ' ORDER BY w), '')
  FROM unnest(regexp_split_to_array(
         translate(lower(coalesce(p_nom, '')), 'éèêëàâäîïôöùûüçÿñ', 'eeeeaaaiioouuucyn'),
         '[^a-z]+')) AS w
  WHERE w <> '' AND w NOT IN ('prof', 'coach', 'dr', 'mr', 'm', 'mme', 'monsieur', 'madame', 'ei', 'eirl', 'eurl', 'sarl', 'sas', 'sasu', 'me')
$$;

-- Les fiches de l'autre côté qui désignent la même personne.
CREATE OR REPLACE FUNCTION inv_autre_cote(
  p_id UUID, p_brand TEXT, p_salarie BOOLEAN, p_user UUID, p_email TEXT, p_nir TEXT, p_nom TEXT
)
RETURNS TABLE (provider_id UUID, legal_name TEXT, lien TEXT)
LANGUAGE sql STABLE AS $$
  SELECT o.id, o.legal_name,
         CASE
           WHEN p_user IS NOT NULL AND o.user_id = p_user THEN 'même compte'
           WHEN p_email <> '' AND lower(coalesce(u.email, o.contact_email, '')) = p_email THEN 'même email'
           WHEN p_nir <> '' AND regexp_replace(coalesce(o.social_security_number, ''), '\s', '', 'g') = p_nir THEN 'même numéro de sécurité sociale'
           ELSE 'même nom'
         END
  FROM inv_providers o
  LEFT JOIN inv_users u ON u.id = o.user_id
  WHERE o.id <> p_id
    AND o.brand IS NOT DISTINCT FROM p_brand
    AND inv_cote_salarie(o.employment_type::text, o.social_profile) <> p_salarie
    AND (
         (p_user IS NOT NULL AND o.user_id = p_user)
      OR (p_email <> '' AND lower(coalesce(u.email, o.contact_email, '')) = p_email)
      OR (p_nir <> '' AND regexp_replace(coalesce(o.social_security_number, ''), '\s', '', 'g') = p_nir)
      OR (inv_cle_personne(p_nom) IS NOT NULL AND inv_cle_personne(o.legal_name) = inv_cle_personne(p_nom))
    )
$$;

CREATE OR REPLACE FUNCTION inv_garde_exclusivite()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_salarie BOOLEAN := inv_cote_salarie(NEW.employment_type::text, NEW.social_profile);
  v_email TEXT;
  v_autre RECORD;
BEGIN
  -- Profil social sur un statut de prestataire : jamais (sauf fiche déjà ainsi, inchangée).
  IF NEW.social_profile IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.social_profile IS NULL OR OLD.employment_type IS DISTINCT FROM NEW.employment_type)
     AND NOT inv_cote_salarie(NEW.employment_type::text, NULL) THEN
    RAISE EXCEPTION 'EXCLUSIVITE: % ne peut pas être à la fois dans l''Espace Social et prestataire (statut %). Une personne est soit prestataire (facture), soit salariée (fiche de paie) : retirez-la d''abord de l''Espace Social, ou donnez-lui un statut de salarié (vacataire, alternant…).',
      NEW.legal_name, NEW.employment_type
      USING ERRCODE = 'P0001';
  END IF;

  -- Rien ne change de côté ni d'identité : on laisse passer (un cas ancien
  -- reste lisible dans les anomalies, il n'empêche pas de travailler).
  IF TG_OP = 'UPDATE'
     AND inv_cote_salarie(OLD.employment_type::text, OLD.social_profile) = v_salarie
     AND OLD.user_id IS NOT DISTINCT FROM NEW.user_id
     AND OLD.contact_email IS NOT DISTINCT FROM NEW.contact_email
     AND OLD.social_security_number IS NOT DISTINCT FROM NEW.social_security_number
     AND inv_cle_personne(OLD.legal_name) IS NOT DISTINCT FROM inv_cle_personne(NEW.legal_name)
     AND OLD.brand IS NOT DISTINCT FROM NEW.brand
     AND (OLD.social_profile IS NULL) = (NEW.social_profile IS NULL) THEN
    RETURN NEW;
  END IF;

  SELECT lower(email) INTO v_email FROM inv_users WHERE id = NEW.user_id;
  v_email := coalesce(v_email, lower(NEW.contact_email), '');

  SELECT * INTO v_autre FROM inv_autre_cote(
    NEW.id, NEW.brand, v_salarie, NEW.user_id, v_email,
    regexp_replace(coalesce(NEW.social_security_number, ''), '\s', '', 'g'), NEW.legal_name
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'EXCLUSIVITE: % existe déjà côté % (fiche « % », %). Une personne est soit prestataire (facture), soit salariée (fiche de paie), jamais les deux.',
      NEW.legal_name,
      CASE WHEN v_salarie THEN 'prestataire' ELSE 'salarié' END,
      v_autre.legal_name, v_autre.lien
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS t_inv_providers_exclusivite ON inv_providers;
CREATE TRIGGER t_inv_providers_exclusivite
  BEFORE INSERT OR UPDATE ON inv_providers
  FOR EACH ROW EXECUTE FUNCTION inv_garde_exclusivite();

-- Les personnes déjà des deux côtés (anomalies à trancher par l'équipe paie).
CREATE OR REPLACE FUNCTION inv_doublons_prestataire_salarie(p_brand TEXT)
RETURNS TABLE (
  salarie_id UUID, salarie_nom TEXT, salarie_statut TEXT,
  prestataire_id UUID, prestataire_nom TEXT, prestataire_statut TEXT, lien TEXT
)
LANGUAGE sql STABLE AS $$
  -- Une même fiche des deux côtés.
  SELECT p.id, p.legal_name, coalesce(p.social_profile, p.employment_type::text),
         p.id, p.legal_name, p.employment_type::text, 'même fiche : profil social sur un statut de prestataire'
  FROM inv_providers p
  WHERE p.brand = p_brand AND p.social_profile IS NOT NULL
    AND NOT inv_cote_salarie(p.employment_type::text, NULL)
  UNION ALL
  -- Une fiche salariée qui a émis des factures.
  SELECT p.id, p.legal_name, coalesce(p.social_profile, p.employment_type::text),
         p.id, p.legal_name, p.employment_type::text,
         'fiche salariée avec ' || count(i.id) || ' facture(s) de prestataire'
  FROM inv_providers p JOIN inv_invoices i ON i.provider_id = p.id
  WHERE p.brand = p_brand AND inv_cote_salarie(p.employment_type::text, p.social_profile)
  GROUP BY p.id
  UNION ALL
  -- Deux fiches pour la même personne, de part et d'autre.
  SELECT s.id, s.legal_name, coalesce(s.social_profile, s.employment_type::text),
         a.provider_id, a.legal_name, o.employment_type::text, a.lien
  FROM inv_providers s
  LEFT JOIN inv_users u ON u.id = s.user_id
  CROSS JOIN LATERAL inv_autre_cote(
    s.id, s.brand, TRUE, s.user_id, lower(coalesce(u.email, s.contact_email, '')),
    regexp_replace(coalesce(s.social_security_number, ''), '\s', '', 'g'), s.legal_name
  ) a
  JOIN inv_providers o ON o.id = a.provider_id
  WHERE s.brand = p_brand AND inv_cote_salarie(s.employment_type::text, s.social_profile)
$$;
