-- ============================================================
-- DROITS D'AUTEUR — libellés de prestation (Nolwenn, 13/11/2026)
-- ============================================================
-- Nolwenn : les catégories étaient « mal nommées », il faut des intitulés
-- qui disent l'œuvre réellement produite. Règle tenue ici : renommer
-- seulement ce qui EST une création (fiches, QCM, corrigés écrits,
-- schémas, réécriture de supports). Les cours, ED et le coaching restent
-- nommés comme tels : l'article R382-1 du code de la sécurité sociale
-- exclut du régime des artistes-auteurs les auteurs « qui participent à
-- des activités d'enseignement ». Les rebaptiser « création » serait une
-- fausse déclaration à l'Urssaf.
--
-- Sources : urssaf.fr, « Vérifier que votre activité relève du régime
-- artiste-auteur » (ouvrages pédagogiques éligibles, branche écrivains,
-- qui couvre aussi les adaptations) ; CSS art. R382-1 (enseignement exclu).
--
-- Rejouable. Aucun montant, aucune note, aucun paiement n'est touché :
-- seuls les libellés changent (les notes déjà émises gardent leur PDF).

-- Tutorat : ce qui est payé, ce sont des fiches, des QCM et des corrections
-- écrites (« création CCB », « création de QCMs » dans les détails).
UPDATE inv_categories
   SET name = name || ' — rédaction de fiches, QCM et corrigés',
       provider_label = NULL
 WHERE brand = 'medibox'
   AND name ~ '^Tutorat (Bordeaux|Lille|Marseille|Montpellier)$';

-- Actualisation : réécrire un support existant en y apportant un apport
-- original, c'est une œuvre dérivée (adaptation), éligible comme l'œuvre
-- première. Un simple rangement ou une copie ne l'est pas : l'intitulé le dit.
UPDATE inv_categories
   SET name = name || ' — révision et réécriture des supports',
       provider_label = NULL
 WHERE brand = 'medibox'
   AND name ~ '^Actualisation (Bordeaux|Lille|Marseille|Montpellier)$';

-- Schémas : n'avaient pas de catégorie, ils partaient en « Missions
-- diverses » (Kevin). Nouvelle catégorie Medibox.
-- Même responsable par défaut que les catégories Actualisation.
INSERT INTO inv_categories (name, provider_label, visible_to_provider, is_active, sort_order, pole, requires_session, brand, default_manager_id)
SELECT 'Création de schémas et illustrations pédagogiques', NULL, true, true, 44, 'referent', false, 'medibox',
       (SELECT default_manager_id FROM inv_categories WHERE brand = 'medibox' AND name LIKE 'Actualisation Bordeaux%' LIMIT 1)
 WHERE NOT EXISTS (
   SELECT 1 FROM inv_categories WHERE brand = 'medibox' AND name = 'Création de schémas et illustrations pédagogiques'
 );
