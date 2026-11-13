# Contrôle des trois notes de droits d'auteur de novembre 2026 (Medibox)

Relecture en lecture seule, le 13/11/2026. Aucune donnée n'a été modifiée : ni les notes, ni les montants payés. Les trois notes portent le même numéro, FACT-2026-0001, car la numérotation était propre à chaque auteur ; les prochaines notes de droits d'auteur seront numérotées DA-AAAA-NNNN, par société et par année.

Le calcul « attendu » ci-dessous utilise les règles de la nouvelle version du code (`src/lib/invoice/net-auteur.ts`). Rappel : modèle 2 = précompte 16,03 % ; modèle 3 = 6,5 % sans CSG ni CRDS ; modèle 4 = aucun précompte.

## Tableau de contrôle

| | Marie | Agathe | Aurore |
|---|---|---|---|
| Statut de la note | payée le 03/11 | payée le 03/11 | validée, non payée |
| Modèle de l'auteur | 2 | 2 | 4 demandé, mais A1 non reçu : **3 appliqué** |
| Lignes | 89,00 € **net** (coaching 12 élèves) | 317,00 € brut + 54,00 € **net** | 7 lignes de 200,00 € brut (1 400,00 €) |
| Base totale facturée | 89,00 € | 371,00 € (somme des deux lignes) | 1 400,00 € |
| Brut de la note | 105,99 € (89,00 remonté au brut) | 381,31 € (317,00 + 64,31) | 1 400,00 € |
| Précompte | 16,99 € | 61,13 € | modèle 3 : 91,00 € |
| **Net attendu** | **89,00 €** | **320,18 €** | **1 309,00 €** (modèle 3) |
| Calculé par l'ancien code | 89,00 € | 320,18 € | 1 175,57 € (modèle 2) |
| Écart sur le net | 0,00 € | 0,00 € | 133,43 € en trop retenus par l'ancien calcul |
| Écart de brut déclaré | note à 89,00 € brut au lieu de 105,99 € : 16,99 € de brut non déclaré | note à 371,00 € au lieu de 381,31 € : 10,31 € de brut non déclaré | aucun |

### Aurore, selon le modèle

| Modèle | Précompte | Net | Contribution diffuseur 1,1 % |
|---|---|---|---|
| 2 (ancien calcul) | 224,43 € | 1 175,57 € | 15,40 € |
| **3 (appliqué tant que le A1 manque)** | **91,00 €** : vieillesse plafonnée 86,10 € + formation 4,90 € | **1 309,00 €** | 15,40 € |
| 4 (si le A1 est reçu et valide) | 0,00 € | **1 400,00 €** | 15,40 € |

Si le A1 arrive après le paiement, la différence entre les modèles 3 et 4 (91,00 €) est à régulariser avec l'auteur ; c'est un point à valider avec le comptable.

## Ce qu'il faut retenir

- **Marie.** Le net de 89,00 € est juste : c'est un net convenu. En revanche, la note affichait 89,00 € de brut, alors que le brut correspondant en modèle 2 est 105,99 € (précompte 16,99 €). Le virement n'est pas en cause, la déclaration Urssaf du trimestre l'est : brut et précompte sous-déclarés.
- **Agathe.** Le net de 320,18 € est juste d'après les lignes saisies (266,18 € de net sur la ligne brute + 54,00 € de net convenu). Même remarque sur le brut déclaré (381,31 € au lieu de 371,00 €).
- **Agathe, l'écart de montant.** Le PDF qu'elle a déposé le 01/11 indique 307,60 € alors que la plateforme prévoyait 371,00 €. Le contrôle automatique l'a signalé, mais la note a quand même été transmise, poussée en comptabilité puis marquée payée le 03/11 sans que personne ne lève l'écart. Le montant réellement viré n'est pas enregistré dans la base : il est à lire sur le relevé bancaire. Ni 307,60 € ni 371,00 € ne correspondent au net attendu de 320,18 €, d'où le besoin d'un contrôle humain. Le correctif de cette livraison empêche que cela se reproduise (voir ci-dessous).
- **Aurore.** L'ancien code retenait le précompte complet du modèle 2 (224,43 €) alors que sa situation relève du modèle 3 faute de A1 : 133,43 € de net en moins que prévu. Sa note n'est pas payée : elle peut être refaite avant paiement (le code ne régénère aucune note payée).

## Ce qui n'a pas été fait

- Aucune note n'a été corrigée, renumérotée ou régénérée, et aucun paiement n'a été modifié.
- La fiche d'Aurore (modèle 4 demandé, A1 en attente) n'a pas été saisie en base : les colonnes `da_model`, `a1_*` n'existent qu'une fois la migration `supabase/52_notes_droits_auteur.sql` appliquée.
