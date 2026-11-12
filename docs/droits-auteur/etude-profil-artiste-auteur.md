# Étude : profil prestataire et situation des artistes-auteurs dans Medibox Invoice

Étude du 12/11/2026, faite à partir du complément de mission de Nolwenn. **Aucun code, aucune base et aucune donnée n'ont été modifiés.** Ce document est à valider par Nolwenn avant tout développement.

Les trois modèles de certification (2, 3 et A1) se trouvent dans [modeles-certification-precompte.md](modeles-certification-precompte.md) et en Word dans `modeles-certification-precompte.docx`. Leurs règles sont celles de Nolwenn, déjà vues avec le comptable (12/11).

---

## 1. État des lieux : ce que le profil contient déjà

Tout le profil tient dans **une seule table, `inv_providers`** (`supabase/01_schema.sql:58`, type `src/lib/types.ts:162`), ce qui permet de garder un profil centralisé.

| Domaine | Champs existants | Réutilisable pour les auteurs ? |
|---|---|---|
| Identité | `legal_name`, `birth_date`, `phone`, `contact_email` | Oui : les nom et prénoms de la certification viennent de `legal_name`. Il n'y a pas de nom d'usage séparé. |
| Adresse | `address_line1/2`, `postal_code`, `city`, `country` (texte libre, « France » par défaut) | Oui, c'est l'adresse postale de la certification. **Mais ce n'est pas l'adresse de résidence fiscale** : on ne doit pas en déduire la résidence fiscale. |
| Statut | `employment_type` (7 valeurs, dont `droits_auteur`, migration 43) | Oui, c'est la porte d'entrée : tout ce qui suit ne concerne que `droits_auteur`. |
| Sécurité sociale | `social_security_number` (migration 41, interdit dans les listes et les emails) | Oui. **Mais `nirValide` (`src/lib/nir.ts:13`) n'accepte que les NIR commençant par 1 ou 2** : un numéro provisoire d'étranger serait refusé. |
| Rémunération | `pay_basis` (brut/net), `pay_mode`, `pay_abatement` | Oui. `pay_basis` intervient dans le choix brut ou net contractuel. |
| Paiement | `iban`, `bic` (modifiables par un admin seulement) | Sert au virement. À retirer de la certification. |
| Social (salariés) | `social_profile`, `silae_matricule`, `social_a_verifier`, dates d'entrée et de sortie | Non : réservé à la paie, à ne pas mélanger. |
| Système | `onboarding_complete`, `tags`, `brand`, `notes` | `brand` limite le dispositif à Medibox. |

**Justificatifs.** La table `inv_documents` (migration 19b) est stockée dans le bucket privé `invoices` et rangée par dossier `<provider_id>/…`. Seuls le propriétaire et les admins peuvent la lire, pas les managers.
- Les types `attestation`, `identite` et `domicile` existent en base (migration 41) mais ne servent nulle part.
- Le prestataire ne peut déposer aujourd'hui que ses factures et ses pièces de paie (`src/lib/social/pieces.ts`), toujours en `kind = 'autre'`.
- **Il n'existe aucun dépôt de A1, d'attestation fiscale ou de dispense.**

**Complétude.**
- `champsManquants` (`src/lib/profil.ts:15`) exige d'un auteur son IBAN et son NIR, rien sur la résidence ou l'affiliation.
- `FicheAcompleter` affiche un bandeau qui ne bloque rien.
- Seule barrière réelle : la facturation automatique du bordereau est sautée si la fiche est incomplète (`src/lib/bordereaux.ts:56`).

**Relances.** Le cron `cycle` envoie l'email `ficheIncomplete` (`src/lib/relances.ts:146`) à L-5 et L-1, par email Brevo et SMS, journalisé dans `inv_email_log`. Il n'y a pas de notification dans l'application.

**Historique.** `inv_audit_log` existe, mais une modification de fiche ne note que le nom des champs, sans l'avant et l'après. Un changement de statut n'est donc pas daté.

**Conclusion.** Rien ne décrit aujourd'hui la résidence fiscale, l'affiliation sociale, le A1 ou une dispense. Le précompte de 16,03 % s'applique à tous les auteurs sans exception (`src/lib/invoice/net-auteur.ts`).

---

## 2. Nouveaux champs réellement nécessaires

Principe : **ce que le prestataire déclare et ce que Medibox a vérifié restent séparés.** Les pièces vont dans `inv_documents`, qui existe déjà. Il n'y a pas de nouvelle table de fichiers.

### a. Sur `inv_providers` (ce que le prestataire déclare)

| Champ proposé | Pourquoi | Existe déjà ? |
|---|---|---|
| `fiscal_resident_fr` (oui/non) | Point de départ du choix du modèle | Non. `country` ne suffit pas : une adresse postale à l'étranger ne prouve pas une résidence fiscale. |
| `fiscal_country` (code ISO) | Pays de résidence fiscale étranger | Non |
| `fiscal_address` (facultatif) | Seulement si elle diffère de l'adresse postale | En partie : on réutilise l'adresse postale par défaut |
| `social_country` (code ISO, « FR » par défaut) | Pays d'affiliation, à ne pas confondre avec la résidence fiscale | Non |
| `foreign_social_id` | Numéro social étranger, si demandé | Non |
| `tax_regime_auteur` (TS / BNC / non renseigné) | Repérer une éventuelle dispense BNC | Non |
| `usage_name` | Nom d'usage, l'une des mentions de la certification | Non : aujourd'hui imprimé « – » |

On n'ajoute **pas** de champ « numéro de sécurité sociale français » : c'est `social_security_number`. On n'ajoute pas non plus d'adresse en double.

### b. Une table `inv_author_situations` (ce que Medibox a vérifié et daté)

Chaque justificatif a une période de validité, et un même auteur peut changer de situation en cours d'année. D'où une ligne par justificatif :

| Champ | Contenu |
|---|---|
| `provider_id` | L'auteur concerné |
| `kind` | `residence_fiscale` / `a1` / `dispense_precompte` |
| `country`, `issuer` | Pays et organisme émetteur (par exemple la SVB pour un A1 néerlandais) |
| `reference` | N° du formulaire ou de l'attestation |
| `valid_from`, `valid_to` | Période couverte (ou l'année de référence) |
| `document_id` | Lien vers `inv_documents`, avec un nouveau `kind` par type de pièce |
| `status` | `manquant` / `en_attente` / `a_verifier` / `valide` / `refuse` / `expire` |
| `verified_by`, `verified_at`, `decision_note` | Qui a validé, quand, pourquoi |

Le statut `expire` n'est pas stocké : il se calcule à partir de `valid_to`, pour éviter qu'un statut devienne faux avec le temps.

### c. Sur la note de droits d'auteur (`inv_invoices`)

| Champ | Pourquoi |
|---|---|
| `author_model` (2 / 3 / A1 / dispense) | Le modèle retenu **au moment du versement** est figé. Une situation qui change plus tard ne doit pas réécrire une note passée. |
| `author_situation_ids` | Les justificatifs sur lesquels repose ce choix |
| `author_model_override`, avec motif et auteur | Correction manuelle par un admin habilité |

---

## 3. Structure du profil proposée

Dans `/profil`, le prestataire auteur voit une nouvelle carte **« Situation fiscale et sociale »**, qui n'apparaît que pour `droits_auteur` et la marque Medibox :

1. **Résidence fiscale** : « Je suis résident(e) fiscal(e) en France : oui / non ». Si non : pays, puis dépôt du certificat de résidence fiscale.
2. **Sécurité sociale** : « Je suis affilié(e) en France : oui / non ». Si non : pays, organisme, puis dépôt du A1 (numéro, émetteur, dates de validité).
3. **Dispense de précompte** (facultatif) : « J'ai une dispense de précompte de l'Urssaf pour {{année}} ». Si oui : dépôt de l'attestation.

Chaque bloc affiche son statut (« À vérifier par Medibox », « Validé jusqu'au 31/12/2026 », « Expiré »).

Côté admin, sur la fiche prestataire :
- un bloc « Situation auteur » qui montre les pièces ;
- les boutons Valider / Refuser, avec un motif obligatoire ;
- le modèle qui en découle pour le prochain versement.

---

## 4. Parcours selon la situation

| Situation | Ce que fait le prestataire | Ce que fait Medibox | Résultat |
|---|---|---|---|
| A. Résident fiscal en France, affilié en France (presque tous les auteurs) | Répond « oui / oui » une fois. **Aucune pièce demandée.** | Rien | Modèle 2 |
| B. Non-résident fiscal, affilié en France | Répond « non », indique le pays, dépose le certificat | Vérifie la pièce et sa période | Modèle 3 |
| C. Affilié à l'étranger avec un A1 | Dépose le A1 (et le certificat de résidence le cas échéant) | Vérifie le pays, l'émetteur et la période, et confirme qu'elle couvre la date du versement | Modèle A1 |
| D. Dispense de précompte (BNC) | Dépose l'attestation Urssaf de l'année | Vérifie l'année | **Pas de certification de précompte.** Note sans retenue ; document à remettre à préciser avec Nolwenn. |
| E. Réponses incomplètes ou contradictoires (adresse aux Pays-Bas mais « résident français », A1 expiré…) | Reçoit une demande précise | Alerte sur la fiche et dans la liste des notes à vérifier | Aucun modèle automatique tant que l'admin n'a pas tranché |

Ce qui ne change pas pour les prestataires qui ne sont pas auteurs : rien du tout. La carte ne s'affiche pas pour eux.

---

## 5. Notifications et relances

On réutilise ce qui existe déjà : le cron `cycle`, l'email Brevo, `inv_email_log` et la relance manuelle depuis `validation/manquants`. Il n'y a pas de canal WhatsApp dans l'application, et on n'en ajoute pas.

| Déclencheur | Envoi | Relance |
|---|---|---|
| Lancement de la fonctionnalité : auteurs Medibox qui n'ont pas répondu aux deux questions | Un email : « Afin de mettre à jour votre dossier administratif… indiquez votre pays de résidence fiscale. » Lien direct vers la carte du profil. | Avec la relance de fiche incomplète existante (L-5, L-1), **au plus 2 fois par mois** |
| Réponse « non résident » ou « affilié à l'étranger » sans pièce | Email qui nomme la pièce attendue | Même rythme |
| A1 ou certificat qui expire dans moins de 30 jours | « Votre formulaire A1 arrive à expiration… » | Une fois à J-30 et une fois à J-7 |
| Pièce refusée par Medibox | Email avec le motif | — |
| Pièce validée | Rien (pas de bruit) | — |

Sur le site, le bandeau `FicheAcompleter` existant ajoute une ligne : « Il manque votre certificat de résidence fiscale ». Il **ne bloque jamais la connexion**.

Les résidents français qui ont répondu « oui / oui » ne reçoivent plus rien.

---

## 6. Contrôles

### Bloquants (sur l'opération, jamais sur la connexion)

1. Pas de modèle 3, A1 ou dispense **sur la seule déclaration du prestataire** : il faut une pièce au statut `valide`.
2. Pas de modèle A1 si la date du versement sort de la période du A1.
3. Pas de génération si un champ obligatoire du modèle manque : n° du A1, dates, émetteur, NIR, adresse. C'est la fin des « ___/___/______ ».
4. Pas de **mise en paiement** d'une note dont le modèle est indéterminé (situation E). La note reste « à vérifier ».
5. Une note payée ne change jamais de modèle. Une correction passe par une régularisation, comme aujourd'hui avec `ajouterRegularisation`.
6. Les modèles 3 et A1 suivent les règles de Nolwenn, vues avec le comptable : ils peuvent être générés dès que la pièce est validée.

### Non bloquants (alertes)

- Auteur Medibox qui n'a pas répondu aux deux questions : le modèle 2 reste appliqué, comme aujourd'hui, avec un bandeau et une relance. C'est le comportement actuel, donc rien ne change pour lui tant qu'il ne déclare rien.
- Adresse postale hors de France avec « résident fiscal français » : alerte à vérifier.
- Pièce qui expire bientôt.
- Le NIR provisoire d'un étranger est accepté avec un avertissement. Aujourd'hui `nirValide` le refuse.

---

## 7. Règles de sélection du modèle

L'évaluation se fait **à la date du versement**, uniquement sur des pièces validées :

```
si employment_type ≠ droits_auteur ou marque ≠ Medibox   → hors dispositif (rien ne change)
si dispense de précompte validée couvrant l'année        → « dispense » (pas de certification de précompte)
sinon si A1 validé couvrant la date du versement          → modèle A1
sinon si résidence fiscale étrangère validée              → modèle 3
sinon si déclaration « non résident » ou « affilié ailleurs » sans pièce validée
                                                           → indéterminé : alerte, décision admin
sinon                                                      → modèle 2
```

- L'ordre des règles (dispense, puis A1, puis non-résidence) est une proposition. **Nolwenn doit le confirmer**, notamment pour un auteur à la fois dispensé et non résident.
- Correction manuelle : un admin seulement (pas un manager), avec un motif obligatoire. Elle est journalisée dans `inv_audit_log` **avec l'avant et l'après**, ce qui n'est pas le cas aujourd'hui.

---

## 8. Points réglés et points encore ouverts

Réglés par Nolwenn le 12/11 (règles vues avec le comptable) :

1. **Non-résident fiscal affilié en France (modèle 3)** : vieillesse et CFP précomptées, CSG et CRDS non applicables, comme dans l'ancien PDF.
2. **A1 (modèle A1)** : aucune cotisation française, net = brut, titre « Attestation de rémunération ». La contribution diffuseur de 1,1 % reste due par Medibox.
3. **Arrondi** : chaque ligne arrondie, total = somme des lignes.
4. **Plafond** : celui de l'année du versement, imprimé par le modèle.
5. **Net fixé à l'avance** : le brut se calcule avec le taux du modèle de l'auteur (modèle 2 : 16,03 % ; modèle 3 : 6,5 %, soit 1 400 € net → 1 497,33 € brut ; A1 : brut = net). Le taux de 6,5 % sans CSG/CRDS pour le non-résident reste une règle à faire valider par le comptable.

Encore ouverts, à voir avec Nolwenn en même temps que cette étude :

1. **Dispense BNC et 1re année** : quel justificatif et quel document remettre à l'auteur.
2. **Lignes « déjà nettes »** : dans l'application, une ligne `pay_basis = net` est versée telle quelle. Elle **n'a aucun précompte et n'entre pas dans l'assiette de la contribution diffuseur** du récapitulatif Urssaf (≈ 142 € de lignes nettes sur le T4 2026). Faut-il remonter ces lignes en brut ?

---

## 9. Fonctionnalités touchées

| Fonctionnalité | Fichiers | Effet |
|---|---|---|
| Profil prestataire | `src/components/profile/ProfileForm.tsx`, `src/app/(app)/profil/actions.ts`, `src/lib/profil.ts` | Nouvelle carte, nouvelles exigences, réservées aux auteurs |
| Fiche admin et correction | `admin/prestataires/[providerId]/page.tsx`, `FicheFacturationForm.tsx`, `admin/actions.ts` | Bloc situation, validation des pièces, historique avant/après. **À noter : un manager peut aujourd'hui changer le statut et le NIR.** |
| Calcul du précompte | `src/lib/invoice/net-auteur.ts` | Les lignes deviennent fonction du modèle. Les taux actuels restent ceux du modèle 2. |
| Net estimé à la saisie | `DeclarationForm.tsx`, `missions/actions.ts` | Doit lire le modèle de l'auteur |
| PDF de la note | `src/lib/invoice/pdf-medibox.tsx`, `store.ts` (`auteurDe`) | Choix du gabarit. La phrase fixe « En cas de dispense… » disparaît. |
| Certification de précompte | nouveau gabarit PDF | Un document par note payée |
| Récap Urssaf et export CSV | `recap-auteurs.ts`, `admin/droits-auteur`, `api/droits-auteur` | Une colonne modèle. Les auteurs sans précompte restent déclarés, avec la contribution diffuseur. |
| Régularisation | `admin/factures/correction-actions.ts` | Utilise le modèle figé de la note |
| Bordereaux, facturation auto | `src/lib/bordereaux.ts` | Une note au modèle indéterminé est créée mais reste « à vérifier » |
| Pennylane | `src/lib/invoice/pennylane.ts` | Il envoie déjà le brut et rapproche sur `total_ttc`. Un auteur payé en net n'est vraisemblablement pas rapproché automatiquement, **déjà aujourd'hui**. Le pays est forcé à « FR » (l. 218). |
| Documents | `inv_documents` (nouveaux `kind`), `/documents` | Dépôt de pièces côté prestataire, lecture admin seulement |
| Relances | `src/lib/relances.ts`, `api/cron/cycle` | Nouveaux messages, même calendrier |

**Ce qui doit rester intact :** les auto-entrepreneurs, les vacataires et les salariés. Toute la logique est derrière `estAuteur` **et** la marque Medibox. Les règles du précompte restent dans `src/lib/invoice/`, à part de la TVA et de la facturation des indépendants.

---

## 10. Risques de régression et tests à prévoir

### Risques

| Risque | Parade |
|---|---|
| Un auteur qui ne répond pas cesse d'être payé | Il reste en modèle 2 (contrôle non bloquant). Seule une déclaration contradictoire bloque. |
| Une note passée est réécrite quand la situation change | Modèle figé sur la note (`author_model`) |
| Exonération accordée sur simple déclaration | Le modèle 3, A1 ou dispense n'est possible qu'avec une pièce `valide` |
| Fuite de pièces fiscales | Bucket privé, RLS propriétaire + admin (déjà en place), pas d'accès manager, pas de NIR ni de pièce dans les emails. Chaque consultation est journalisée. |
| Écart d'un centime entre la certification, le PDF et le virement | Un seul calcul (`detailPrecompte`) pour les trois, plus la correction du brut au centime (I-12) |
| Les relances agacent tout le monde | Ciblées sur les auteurs Medibox, au plus 2 par mois, plus rien une fois la fiche à jour |
| Effet sur les autres marques ou statuts | Garde `estAuteur` + Medibox, avec des tests de non-régression |

### Tests

- **Unitaires** (`node --test`, à côté de `net-auteur.test.mjs`, qui compte 11 tests) :
  - **Modèle 2** :
    - 952,72 → 152,72 → 800,00 ;
    - 1 400 net → brut corrigé 1 667,27 ;
    - simulation 0,01–3 000 € : net retrouvé au centime ;
    - plafond annuel.
  - **Sélection**, un cas par ligne du § 7 :
    - A1 expiré la veille du versement ;
    - A1 qui commence le lendemain ;
    - pièce `a_verifier` ;
    - dispense d'une autre année ;
    - contradiction entre l'adresse et la déclaration.
  - **Contrôles bloquants** : génération refusée sans n° de A1 ou sans NIR.
- **Non-régression** :
  - les 41 tests actuels ;
  - une facture d'auto-entrepreneur et une de vacataire identiques au centime avant et après ;
  - le récap Urssaf T4 2026 identique pour les auteurs en modèle 2 (13 notes : brut 4 965,06, précompte 772,98, net 4 192,08).
- **Tests à ajouter là où il n'y en a pas** : `champsManquants`, `nirValide`, `trimestre`, `recap-auteurs`.
- **Parcours** dans la préview, avec le compte de test prestataire :
  - répondre aux questions, déposer une pièce ;
  - côté admin, valider puis refuser ;
  - vérifier que la connexion et l'accès aux anciens documents restent possibles sans pièce.

---

## Ordre de développement proposé (après validation)

1. Modèle 2 seul :
   - gabarit de la certification ;
   - correction du brut au centime ;
   - retrait de l'IBAN ;
   - date d'émission postérieure ou égale au versement.

   Rien d'autre ne change, et c'est utilisable tout de suite.
2. Champs de déclaration, pièces et validation admin, sans effet sur le calcul.
3. Règles de sélection et modèles 3, A1 et dispense, **activés un par un après la validation de l'étude par Nolwenn**.
4. Relances et alertes d'expiration.
