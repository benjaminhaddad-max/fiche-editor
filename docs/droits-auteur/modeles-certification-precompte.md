# Modèles de certification de précompte – Medibox France

Étude du 12/11/2026, demandée par Nolwenn. Les règles sont celles de Nolwenn, déjà vues avec le comptable (message du 12/11). Quand un ancien PDF les contredit, c'est sa règle qui s'applique. Version Word prête à l'emploi : `modeles-certification-precompte.docx`. Depuis le 13/11/2026, les modèles 2, 3 et 4 sont branchés dans Invoice : fiche auteur, modèle figé sur chaque note, déclaration Urssaf trimestrielle.

- Les champs entre `{{ }}` sont remplis à la génération.
- Aucun document nominatif ici. Les anciens PDF (deux anciennes tutrices, 2025) ont servi de références historiques, pas de sources réglementaires.
- Les taux sont ceux de la demande de Nolwenn, qui sont aussi ceux déjà appliqués dans l'application (`src/lib/invoice/net-auteur.ts`). Le plafond de la vieillesse plafonnée est un champ (`{{plafond annuel de la sécurité sociale}}`), rempli avec celui de l'année du versement.

---

## 1. Tronc commun aux trois modèles

### En-tête

| | |
|---|---|
| Titre | **CERTIFICATION DE PRÉCOMPTE {{année du versement}}** (modèles 2 et 3) · **ATTESTATION DE RÉMUNÉRATION – DROITS D'AUTEUR {{année}}** (modèle A1, voir § 4) |
| Sous-titre | À compléter par le diffuseur et à remettre à l'artiste-auteur |
| Références | Articles L. 382-5 et R. 382-27 du code de la sécurité sociale – Arrêté du 19 avril 1995 modifié par l'arrêté du 22 février 2019 – Décret n° 2020-1095 du 28 août 2020 |

### Identification de l'artiste-auteur (mentions 3, 4, 5 et 6 de l'arrêté)

| Champ | Source |
|---|---|
| Nom | {{nom}} |
| Prénom(s) | {{prénoms}} |
| Nom d'usage | {{nom d'usage}} ou « – » |
| N° de sécurité sociale (NIR) | {{NIR}} |
| Adresse postale | {{adresse}}, {{code postal}} {{ville}}, {{pays}} |
| Activité ayant donné lieu à la rémunération | {{nature de l'activité}}, par défaut « Diffusion d'œuvre pédagogique » |
| Situation (modèles 3 et A1 seulement) | Une ligne qui décrit la situation retenue et ses justificatifs (voir § 3 et § 4) |

### Identification du diffuseur (mention 1)

| | |
|---|---|
| Raison sociale | MEDIBOX FRANCE |
| Adresse | 8 B rue de Tunis, 75011 Paris |
| SIRET | 930 619 051 00012 |
| Code APE | 8211Z |

### Organisme destinataire des cotisations (mention 2)

Urssaf Limousin, 11 rue Camille Pelletan, 87000 Limoges.

### Pied de document

| Élément | Contenu |
|---|---|
| Date du versement (mention 10) | {{date du virement}} |
| Fait le | {{date d'émission}}, **au plus tôt le jour du versement** (voir incohérence I-9) |
| Certification | « Je certifie sur l'honneur l'exactitude de ces mentions », suivie du nom et de la qualité du signataire ({{signataire}}, {{qualité}}) et du cachet de Medibox France |
| Référence interne | N° de la note de droits d'auteur : {{numéro de note}} |
| Double | Medibox conserve un double de chaque certification (arrêté, art. 1) : copie archivée dans l'application |

Le RIB ou l'IBAN de l'artiste-auteur **n'apparaît pas** sur la certification. Ce n'est pas une mention obligatoire et c'est une donnée bancaire (voir I-7).

### Annexe réglementaire (reprise des anciens documents)

Les trois anciens modèles reproduisent en bas de page l'article 1 et l'article 2 de l'arrêté du 22 février 2019, ainsi que l'article 3 du décret du 28 août 2020. On peut garder cette annexe. Il faut d'abord vérifier le texte exact sur Légifrance, voir I-10.

---

## 2. MODÈLE 2 – Auteur résident fiscal en France, précompte complet

**Champ d'application :** artiste-auteur domicilié fiscalement en France, affilié au régime français, sans dispense de précompte valide pour l'année du versement.

### Bloc « Renseignements concernant la note de cession de droits »

| Ligne | Assiette | Taux | Montant |
|---|---|---|---|
| Montant de la rémunération brute hors TVA | | | **{{B}}** |
| Cotisation vieillesse plafonnée précomptée (6,90 % du brut HT dans la limite du plafond annuel, dont 0,75 point pris en charge par l'État) | {{B}} | 6,15 % | arrondi(B × 6,15 %) |
| CSG précomptée (9,20 % de 98,25 % du brut HT) | arrondi(B × 98,25 %) | 9,20 % | arrondi(B × 98,25 % × 9,20 %) |
| CRDS précomptée (0,50 % de 98,25 % du brut HT) | arrondi(B × 98,25 %) | 0,50 % | arrondi(B × 98,25 % × 0,50 %) |
| Contribution à la formation professionnelle (CFP) précomptée (0,35 % du brut HT) | {{B}} | 0,35 % | arrondi(B × 0,35 %) |
| **Total des cotisations précomptées** | | | **T = somme des 4 montants arrondis** |
| **Rémunération brute HT minorée du total précompté** | | | **B − T** |

### Bloc « Montants pris en charge par l'État », pour information (mention 11)

| Ligne | Assiette | Taux | Montant |
|---|---|---|---|
| Vieillesse déplafonnée prise en charge par l'État | {{B}} | 0,40 % | arrondi(B × 0,40 %) |
| Part de la vieillesse plafonnée prise en charge par l'État (dans la limite du plafond annuel) | {{B}} | 0,75 % | arrondi(B × 0,75 %) |
| Total pris en charge par l'État | | | somme des deux |

> Ces montants ne sont **ni retenus sur l'auteur ni payés par Medibox** : ils ne se déduisent pas du net. Ils restent dans un bloc séparé, sous le précompte.

### Bloc « Montant net »

**Montant de la rémunération nette hors TVA versée à l'artiste-auteur : B − T** (mention 9)

### Note à l'artiste-auteur (texte de l'ancien modèle, corrigé de ses coquilles)

> Lorsque vous percevez des rémunérations artistiques (droits d'auteur, cessions…), vos diffuseurs prélèvent les cotisations sociales lors du paiement et les reversent à l'Urssaf Limousin. Ce prélèvement, appelé « précompte », est obligatoire, sauf si vous disposez d'une dispense de précompte délivrée par l'Urssaf. La certification de précompte, originale et signée du diffuseur, est un justificatif à conserver : elle permet de justifier du paiement effectif des cotisations auprès de l'Urssaf Limousin, qui peut vous la réclamer.

La note se termine, comme dans les anciens modèles, par : « Pour votre 1re année d'activité, le certificat d'immatriculation de l'Urssaf vaut pour dispense. »

### Règles de calcul

1. **Ligne par ligne, puis somme.** Chaque montant est arrondi au centime, au demi-centime supérieur. Le total est la somme des montants arrondis, et le net vaut B − T. C'est ce que fait déjà `detailPrecompte()` dans l'application.
2. **Brut fixé (cas courant).** On applique directement la règle 1.
3. **Net fixé à l'avance.** Le brut théorique se calcule ainsi : B = Net / (1 − 0,1603), arrondi au centime. On recalcule ensuite les lignes avec la règle 1, puis on vérifie que B − T = Net. **Si l'écart n'est pas nul, on corrige B d'un ou deux centimes jusqu'à retomber exactement sur le net.** Ce cas est fréquent : en simulant tous les nets de 0,01 € à 3 000 €, la formule seule rate le net d'un centime (parfois deux) dans **53 %** des cas. Le taux effectif exact est d'ailleurs 16,03025 %, pas 16,03 %.
4. **Plafond.** La vieillesse plafonnée ne porte que sur la part du brut annuel versé à l'auteur sous le plafond de la sécurité sociale. Le chiffre de 47 100 € des anciens modèles est le plafond 2025 ; celui de 2026 est de 48 060 € (arrêté du 22 décembre 2025). Le modèle imprime celui de l'année du versement. Aucun auteur Medibox n'en approche aujourd'hui, mais la règle doit être codée.

### Contrôle de calcul obligatoire – exemple de la demande (ancienne note du 01/10/2025)

| Ligne | Calcul exact | Arrondi | Attendu | |
|---|---|---|---|---|
| Brut | 800 / 0,8397 = 952,7212 | 952,72 | 952,72 | ✅ |
| Vieillesse plafonnée | 952,72 × 6,15 % = 58,5923 | 58,59 | 58,59 | ✅ |
| Assiette CSG/CRDS | 952,72 × 98,25 % = 936,0474 | 936,05 | 936,05 | ✅ |
| CSG | 936,0474 × 9,20 % = 86,1164 | 86,12 | 86,12 | ✅ |
| CRDS | 936,0474 × 0,50 % = 4,6802 | 4,68 | 4,68 | ✅ |
| CFP | 952,72 × 0,35 % = 3,3345 | 3,33 | 3,33 | ✅ |
| **Total précompté** | 58,59 + 86,12 + 4,68 + 3,33 | **152,72** | 152,72 | ✅ |
| **Net versé** | 952,72 − 152,72 | **800,00** | 800,00 | ✅ |
| État, vieillesse déplafonnée | 952,72 × 0,40 % = 3,8109 | 3,81 | 3,81 | ✅ |
| État, part plafonnée | 952,72 × 0,75 % = 7,1454 | 7,15 | 7,15 | ✅ |
| Total État | | 10,96 | 10,96 | ✅ |

Second contrôle, cette fois avec un écart d'arrondi : pour un net fixé à 1 400,00 €, la formule donne B = 1 667,26 €. Le précompte vaut alors 267,27 € et le net 1 399,99 €. Il faut prendre **B = 1 667,27 €** pour retomber sur 1 400,00 €, ce qu'avait fait l'ancien document.

### Pour la comptabilité, pas sur la certification

La contribution diffuseur est à la charge de Medibox. Elle n'est jamais déduite de l'auteur et **ne figure pas sur la certification**.

- 1,00 % au titre de la sécurité sociale + 0,10 % au titre de la formation, soit 1,10 % du brut HT.
- Elle est déclarée chaque trimestre à l'Urssaf Limousin.
- Dans l'exemple : 9,53 € + 0,95 € = 10,48 €. Le coût total pour Medibox est de 963,20 €.

---

## 3. MODÈLE 3 – Sans A1 : auteur non résident fiscal en France, affilié en France

> Source : la version « sans A1 » du 31/10/2025. Nolwenn a précisé le 12/11 que la partie coupée de son message reprenait ce document. Le modèle est **complet** : lignes, assiettes et taux viennent du PDF, dont Nolwenn a validé les règles avec le comptable. Seule correction : le total et le net suivent la règle d'arrondi de Nolwenn (somme des lignes arrondies).

**Champ d'application :** artiste-auteur non domicilié fiscalement en France, qui reste affilié au régime français (pas de formulaire A1) et dispose d'un certificat de résidence fiscale étranger.

### Ligne « Situation » (sous l'identification de l'auteur)

« Artiste-auteur non domicilié(e) fiscalement en France (certificat de résidence fiscale {{pays}} du {{date du certificat}}) – CSG et CRDS non applicables. »

Dans l'ancien document, la date du certificat ne figurait pas. Elle est ajoutée ici, comme dans le modèle A1.

### Bloc « Renseignements concernant la note de cession de droits »

| Ligne | Assiette | Taux | Montant |
|---|---|---|---|
| Montant de la rémunération brute hors TVA | | | **{{B}}** |
| Cotisation vieillesse plafonnée précomptée (6,90 % du brut HT dans la limite du plafond annuel, dont 0,75 point pris en charge par l'État) | {{B}} | 6,15 % | arrondi(B × 6,15 %) |
| CSG précomptée (9,20 % de 98,25 % du brut HT) – *Non applicable – artiste-auteur non domicilié(e) fiscalement en France* | – | – | 0,00 € |
| CRDS précomptée (0,50 % de 98,25 % du brut HT) – *Non applicable – artiste-auteur non domicilié(e) fiscalement en France* | – | – | 0,00 € |
| CFP précomptée (0,35 % du brut HT) | {{B}} | 0,35 % | arrondi(B × 0,35 %) |
| **Total des cotisations précomptées** | | | **T = somme des 2 montants arrondis** |
| **Rémunération brute HT minorée du total précompté** | | | **B − T** |

### Bloc « Montants pris en charge par l'État », pour information

Ces lignes sont identiques au modèle 2 et reprises du PDF : vieillesse déplafonnée à 0,40 % de B, part plafonnée à 0,75 % de B dans la limite du plafond, puis le total. Elles ne se déduisent pas du net.

### Bloc « Montant net »

**Montant de la rémunération nette hors TVA versée à l'artiste-auteur : B − T**

### Note à l'artiste-auteur (texte de l'ancien document)

> Vous êtes domicilié(e) fiscalement hors de France : la CSG et la CRDS ne sont pas précomptées sur votre rémunération. Faute de formulaire A1 attestant de votre affiliation à un régime de sécurité sociale d'un autre État membre, la cotisation d'assurance vieillesse et la contribution à la formation professionnelle restent précomptées et reversées à l'Urssaf Limousin. La certification de précompte, originale et signée du diffuseur, est un justificatif que vous devez conserver.

### Contrôle sur l'exemple du PDF (brut 1 667,27 €)

| Ligne | Calcul | Montant | PDF | |
|---|---|---|---|---|
| Vieillesse plafonnée | 1 667,27 × 6,15 % = 102,5371 | 102,54 | 102,54 | ✅ |
| CFP | 1 667,27 × 0,35 % = 5,8354 | 5,84 | 5,84 | ✅ |
| **Total** | 102,54 + 5,84 | **108,38** | 108,37 | corrigé : somme des lignes arrondies (I-3) |
| **Net** | 1 667,27 − 108,38 | **1 558,89** | 1 558,90 | corrigé, même règle |
| État | 6,67 + 12,50 | 19,17 | 19,17 | ✅ |

### Net fixé à l'avance (règle de Nolwenn, 12/11)

Le brut se calcule avec le taux de l'auteur, 6,50 %, et non 16,03 %, sinon le net versé dépasse le net convenu : **B = Net / (1 − 0,065)**, arrondi au centime. On recalcule ensuite les lignes et on vérifie que B − T = Net. Si l'écart n'est pas nul, on corrige B d'un centime. En simulant tous les nets de 0,01 € à 3 000 €, la formule seule rate le net d'un centime dans 23 % des cas, et un centime suffit toujours à corriger.

| Exemple (net 1 400,00 €) | Calcul | Montant |
|---|---|---|
| Brut | 1 400,00 / 0,935 = 1 497,326 | **1 497,33** |
| Vieillesse plafonnée | 1 497,33 × 6,15 % = 92,0858 | 92,09 |
| CFP | 1 497,33 × 0,35 % = 5,2407 | 5,24 |
| **Précompte** | 92,09 + 5,24 | **97,33** |
| **Net** | 1 497,33 − 97,33 | **1 400,00** ✅ |
| État (pour information) | 5,99 + 11,23 | 17,22 |

### Pour la comptabilité

La contribution diffuseur de 1,10 % reste due par Medibox, comme dans le modèle 2. L'ancien document et la documentation Urssaf citée par Nolwenn sont d'accord sur ce point.


---

## 4. MODÈLE A1 – Auteur affilié à un régime étranger (formulaire A1)

> Source : la version « avec A1 » du 31/10/2025, que Nolwenn a désignée comme la référence de présentation. Elle a précisé le 12/11 que son message reprenait ce document. Le modèle est **complet** : lignes, libellés et notes viennent du PDF.

**Champ d'application :** artiste-auteur affilié à un régime de sécurité sociale d'un autre État membre, sur présentation d'un formulaire A1 en cours de validité, et non domicilié fiscalement en France.

### En-tête (différent des modèles 2 et 3)

- Titre : « ATTESTATION DE RÉMUNÉRATION – DROITS D'AUTEUR {{année}} » (et non « certification de précompte »).
- Sous-titre : « Artiste-auteur affilié(e) à un régime de sécurité sociale étranger (formulaire A1) – sans précompte ».
- Mêmes références d'articles que le tronc commun du § 1. Le reste de l'en-tête, l'identification, le diffuseur et l'organisme suivent aussi le § 1.

### Lignes « Situation » (sous l'identification de l'auteur)

- « Artiste-auteur affilié(e) au régime de sécurité sociale {{pays}} – formulaire A1 n° {{numéro}} délivré par {{organisme émetteur}} ({{pays}}), valable du {{début}} au {{fin}}. »
- « Non domicilié(e) fiscalement en France – certificat de résidence fiscale {{pays}} du {{date du certificat}}. »

Dans l'ancien document, le numéro, les dates du A1 et la date du certificat **étaient restés en blanc** (I-6). Le futur modèle refuse d'être généré sans eux (voir l'étude, contrôles bloquants). Autre contrôle : la date du versement doit tomber dans la période de validité du A1.

### Paragraphe d'explication (texte de l'ancien document)

> En application du règlement (CE) n° 883/2004 et sur présentation du formulaire A1, l'artiste-auteur relève de la législation de sécurité sociale {{pays}}. Aucune cotisation ni contribution sociale française n'est précomptée sur sa rémunération. La contribution diffuseur (1,1 %) reste due par MEDIBOX FRANCE et est déclarée à l'Urssaf Limousin ; elle n'est pas déduite de la rémunération de l'artiste-auteur.

### Bloc « Renseignements concernant la note de cession de droits »

On garde le tableau complet, chaque ligne à zéro, pour que le document reste comparable aux autres modèles.

| Ligne | Assiette | Taux | Montant |
|---|---|---|---|
| Montant de la rémunération brute hors TVA | | | **{{B}}** |
| Cotisation vieillesse plafonnée précomptée | – | – | 0,00 € |
| CSG précomptée | – | – | 0,00 € |
| CRDS précomptée | – | – | 0,00 € |
| CFP précomptée | – | – | 0,00 € |
| **Total des cotisations précomptées** | | | **0,00 €** |
| **Rémunération brute HT minorée du total précompté** | | | **{{B}}** |

### Bloc « Montants pris en charge par l'État », pour information

Une seule ligne, reprise du PDF : « Néant – aucune cotisation française due », 0,00 €.

### Bloc « Montant net »

**Montant de la rémunération nette hors TVA versée à l'artiste-auteur : {{B}}** (le net est égal au brut).

### Note à l'artiste-auteur (texte de l'ancien document)

> Vous relevez de la sécurité sociale {{pays}} (formulaire A1) et êtes domicilié(e) fiscalement {{« en » ou « aux » + pays}}. Aucune cotisation ni contribution sociale française n'est prélevée sur votre rémunération. Il vous appartient de la déclarer auprès des organismes de sécurité sociale et de l'administration fiscale {{pays}}. Une copie du formulaire A1 et du certificat de résidence fiscale est conservée par le diffuseur.

### Net fixé à l'avance (règle de Nolwenn, 12/11)

Brut = net. Pour un net de 1 400,00 €, le brut est de 1 400,00 €.

### Pour la comptabilité

La contribution diffuseur de 1,10 % reste due par Medibox (1 % + 0,1 %), déclarée à l'Urssaf Limousin, et n'est pas déduite de l'auteur. L'ancien document le dit, et la demande de Nolwenn demande de ne pas supposer que les obligations du diffuseur disparaissent.


---

## 5. Incohérences relevées entre les anciens PDF et les formules

| # | Où | Constat | Conséquence pour les modèles |
|---|---|---|---|
| I-1 | Ancien format, deux notes | Mise en page abîmée : « € - » parasites après chaque montant, texte de l'activité dédoublé (« Activité Diffusion pédagogique d'oeuvre pédagogique »), double parenthèse « ((9,20 % », astérisques « ** » sans renvoi, « précomptées » au pluriel pour la CFPC, « deplafonnée » sans accent, « d''activité », virgules à la place des points dans la note. | Remplacé par le modèle 2 (demande de Nolwenn). |
| I-2 | Ancien format | Bloc État : assiette affichée arrondie à l'euro (« 953 », « 1667 ») alors que le montant est calculé sur le brut exact. | Assiette au centime partout. |
| I-3 | Version « sans A1 » | Total précompté affiché 108,37 €, alors que la somme des lignes arrondies (102,54 + 5,84) fait **108,38 €**. Le total a été calculé à 6,50 % sur le brut puis arrondi, et non additionné. Le net (1 558,90 €) est donc faux d'un centime selon la règle des autres documents (1 558,89 €). | Règle de Nolwenn : somme des lignes arrondies. Corrigé dans le modèle 3. |
| I-4 | Version « sans A1 » | Le brut (1 667,27 €) avait été calculé à 16,03 % pour un net de 1 400 €, mais on n'a retenu que 6,50 %. Le net change donc (1 558,90 €) au lieu de rester à 1 400 €. Pour garder 1 400 € net avec 6,50 %, il aurait fallu un brut de 1 497,33 €. | Règle de Nolwenn : le brut se calcule avec le taux du modèle (6,50 % en modèle 3, brut = net en A1). |
| I-5 | Trois versions de la même note (31/10/2025) | Trois traitements différents pour une même personne et un même versement : précompte complet, précompte partiel, aucun précompte. | Un seul modèle par versement, choisi selon des justificatifs vérifiés. C'est l'objet de l'étude. |
| I-6 | Version « avec A1 » | N° du A1, dates de validité et date du certificat de résidence laissés en blanc (« ___/___/______ »). | Génération bloquée tant que ces champs manquent. |
| I-7 | Tous | L'IBAN de l'auteur est imprimé sur la certification. Ce n'est pas une mention de l'arrêté et c'est une donnée bancaire. | Retiré. |
| I-8 | Tous | « 6,90 % … dans la limite de 47 100 € » : c'est le plafond 2025, alors que les documents seront émis en 2026. Le titre « 2025 » est figé dans le modèle. | Année et plafond tirés de la date du versement. |
| I-9 | Notes du 31/10/2025 | « Fait le 30/10/2025 », soit avant la « date du versement » du 31/10/2025, alors que le document certifie la somme « effectivement perçue ». | Date d'émission ≥ date du versement. |
| I-10 | Annexe réglementaire | L'art. 2 cité renvoie à « l'article R. 282-20 », référence qui paraît erronée (le reste du texte cite les articles R. 382-…). L'arrêté de 2019 est présenté comme « modifiant l'arrêté du 19 avril 1995 » : à garder, mais le texte doit être recopié depuis Légifrance, pas depuis les anciens PDF. | Texte repris tel quel des anciens PDF. |
| I-11 | Tous | Noms flottants : « CFPC », « CFP », « formation professionnelle ». | Un seul libellé : « CFP ». |
| I-12 | Demande, modèle 2 | Formule B = Net / (1 − 0,1603) : elle rate le net d'un centime dans 53 % des cas (simulation de 0,01 € à 3 000 €), et le taux exact est 16,03025 %. | Correction au centime prévue (§ 2, règle 3). |
| I-13 | Version « sans A1 » | La note dit que la vieillesse et la CFP « restent précomptées » faute de A1, alors que la documentation Urssaf citée dans le complément dit qu'il n'y a pas de précompte si l'auteur déclare à l'étranger. | Règle de Nolwenn, vue avec le comptable : on suit le PDF (vieillesse et CFP précomptées). |
| I-14 | Anciennes notes | La « Note à l'artiste-auteur » affirme que le certificat d'immatriculation vaut dispense la 1re année. Si c'est vrai, la note devrait aussi dire qu'on ne précompte pas dans ce cas, or le modèle précompte. | Phrase conservée, comme dans les anciens modèles. |

---

## 6. À faire valider par le comptable

- 6,5 % sans CSG/CRDS pour le non-résident : règle à faire valider par le comptable.
- Modèle 3 : la CSG et la CRDS ne s'appliquent pas à un non-résident fiscal qui reste affilié en France.
- Arrondi : total = somme des lignes arrondies, et non calculé sur le taux global comme dans l'ancien document.
- Plafond de la vieillesse plafonnée : celui de 2026, soit 48 060 € (arrêté du 22 décembre 2025), et non 47 100 €, qui est celui de 2025.
- Le cas d'Aurore G. : sa situation réelle (affiliation et certificat de résidence fiscale) est à clarifier avant de lui appliquer le modèle 3 ou A1.
- Modèle 3 : taux de 6,5 % (vieillesse plafonnée 6,15 % + formation professionnelle 0,35 %), sans CSG ni CRDS. C'est ce qu'applique le code (`net-auteur.ts`).
- Modèle 4 (A1) : aucun précompte, brut = net. La contribution diffuseur de 1,1 % reste due par la société (1,1 % du brut), et elle n'est pas déduite du net. À confirmer.
- Remontée d'un net fixé au brut : l'arrondi peut laisser 1 à 2 centimes d'écart. On calcule le brut au centime, puis on cale le total du précompte sur brut − net en ajustant la première ligne (vieillesse plafonnée), de sorte que brut − précompte = net exactement. Le précompte d'une ligne peut donc différer de 1 à 2 centimes d'un calcul au taux global.
- Numérotation : les notes de droits d'auteur prennent « DA-AAAA-NNNN », une suite continue par société et par année, sans trou. Les 13 notes déjà émises (toutes FACT-2026-0001) passent en DA-2026-0001 à 0013 par ordre d’émission, après accord du centre (Nolwenn, 13/11) ; l’ancien numéro reste dans le journal d’audit. À faire valider : la suite DA peut-elle coexister avec les FACT des indépendants dans le même journal d'achats ?
- Modèle 4 demandé sans A1 valide (absent, pas encore reçu ou expiré) : le code applique le modèle 3 et écrit sur la note « A1 absent ou expiré : modèle 3 appliqué ». À confirmer, notamment quand le A1 arrive après la note (régularisation).

### Ajouts du 13/11/2026 (fiche auteur et déclaration Urssaf)

- **Éligibilité au régime des artistes-auteurs.** Seule une œuvre originale se paie en droits d'auteur : fiches, schémas, QCM, corrigés écrits, création de contenu. Pour tout le reste, Invoice affiche « à valider par le comptable », sans rien bloquer.
  - Tranché le 13/11 (Nolwenn : « il faut des appellations qui passent »). Les intitulés Medibox disent maintenant l'œuvre produite (migration 56) : « Tutorat X — rédaction de fiches, QCM et corrigés », « Actualisation X — révision et réécriture des supports », et une nouvelle catégorie « Création de schémas et illustrations pédagogiques ».
  - Actualisation : éligible quand elle réécrit le support avec un apport original. C'est une œuvre dérivée (adaptation), couverte par la branche écrivains comme l'œuvre première (urssaf.fr, « Vérifier que votre activité relève du régime artiste-auteur » : ouvrages pédagogiques éligibles). Une simple mise en page ou une copie ne l'est pas.
  - Coach et Cours / ED **ne sont pas renommés**. L'article R382-1 du code de la sécurité sociale exclut du régime les auteurs « qui participent à des activités d'enseignement ». Les rebaptiser « création » serait une fausse déclaration. Ces missions doivent passer par un autre statut (salaire ou facture d'indépendant) : à trancher avec le comptable.
  - Au 13/11, notes concernées : Coach seul (Agathe, Aouadi Rania, Camille, Louis Seguin, Marie), Cours / ED seul (Aurore Gay), mélange (Cabanel, Faustine, Kaoutar Mallouh). Tutorat seul (Antoine Tuteur, Mathilde, Rayan) et Kevin (actualisation et schémas) passent avec les nouveaux intitulés.
- **Choix du modèle.** Il est automatique, d'après la fiche :
  - A1 valide → modèle 4 (même pour un résident français) ;
  - sinon résident fiscal français → modèle 2 ;
  - sinon non-résident → modèle 3 ;
  - A1 expiré ou absent → modèle 3, avec une alerte.
  - Tranché le 13/11 : un résident français qui a un A1 valide passe en modèle 4. Le A1 prouve qu'il cotise dans un autre pays de l'UE, et on ne cotise que dans un seul pays (règlement (CE) 883/2004, art. 11) : aucun précompte en France.
- **Modèle figé sur la note.** Le modèle est figé sur chaque note à sa première génération. Corriger une fiche après coup ne change pas les notes déjà émises. Les 13 notes émises avant le 13/11 sont en modèle 2 ; elles sont renumérotées DA-2026-0001 à 0013 et renvoyées aux auteurs au nouveau format (demande de Nolwenn du 13/11). Question : si une fiche se révèle fausse (par exemple la résidence d'Aurore G.), faut-il une note rectificative ?
- **Justificatifs.** L'attestation de résidence fiscale et le A1 sont déposés avec leur date d'expiration, et une alerte part 30 jours avant (validé par Nolwenn le 13/11).
- **Trimestre de déclaration.** On retient la date de versement. Une note émise mais pas encore payée est classée, à titre provisoire, au trimestre de sa date d'émission.
- **Historique (2025, T1 à T3 2026).** Il est importé du tableur tel quel : aucun montant n'est recalculé, et une case vide reste vide. Les lignes importées ne sont pas contrôlées contre les taux : un écart éventuel est celui du tableur.
- **Contribution diffuseur de 1,1 %.** Elle est calculée sur le brut de chaque note, à la charge de Medibox, et affichée par auteur et par trimestre dans l'export.
- **Régularisation du précompte des 12 notes payées : option A, tranchée par Nolwenn le 13/11.** Les 12 notes réglées les 02 et 03/11 ont été payées en net : les DA ont reçu le net de la colonne, sans retenue. Elles sont renvoyées au format DA avec net versé = somme virée, brut remonté selon le modèle (modèle 2 pour les 12, aucun A1 valide) et mention « la somme versée est le net ; le précompte est à la charge de Medibox ». Le précompte est dû par Medibox à l'Urssaf, dans la déclaration du trimestre de paiement (T4 2026, avant le 15/01/2027).
  - Totaux : brut 4 170,13 €, net versé 3 501,66 €, précompte dû par Medibox 668,47 €, et contribution diffuseur 45,87 € en plus. Ce surcoût de 714,34 € n'a pas été payé et reste à verser avec la déclaration.
  - Agathe : net versé 307,60 € d'après son relevé n° 2 (253,60 € de coaching et 54 € de régularisation), confirmé par Nolwenn le 13/11 ; brut 366,32 €. En base, la note garde 371 € (montant jamais versé). Marie : net 89,00 €, brut 105,99 €.
  - Medibox n'utilise pas de logiciel comptable synchronisé : rien à reporter côté outil.
- **Régul Aurore si A1 reçu.** Aurore G. est payée par Nolwenn en net sur sa note en modèle 2 (DA-2026-0013 : brut 1 400,00 €, net 1 175,57 €), sans attendre son A1, demandé et annoncé à 8 semaines. Si le A1 arrive et couvre la période, la note passe en modèle 4, sans précompte : il faudra une note rectificative et une régularisation, soit reverser le précompte à Aurore, soit le récupérer auprès de l'Urssaf. Sa résidence (adresse en Belgique) et la nature de sa mission (cours) sont à confirmer en même temps.
