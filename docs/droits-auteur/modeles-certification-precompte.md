# Modèles de certification de précompte – Medibox France

Étude du 12/11/2026, demandée par Nolwenn. Rien n'est branché dans l'application : ce sont des modèles de travail, à faire valider avant tout développement.

- Les champs entre `{{ }}` sont remplis à la génération.
- Aucun document nominatif ici. Les anciens PDF (deux anciennes tutrices, 2025) ont servi de références historiques, pas de sources réglementaires.
- Les taux sont ceux de la demande de Nolwenn, qui sont aussi ceux déjà appliqués dans l'application (`src/lib/invoice/net-auteur.ts`). Leur millésime (2025 ou 2026) reste à confirmer par le comptable : voir § 5.

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

La phrase des anciens modèles sur la 1re année d'activité (« le certificat d'immatriculation de l'Urssaf vaut pour dispense ») est **retirée en attendant la validation du comptable** (V-6).

### Règles de calcul

1. **Ligne par ligne, puis somme.** Chaque montant est arrondi au centime, au demi-centime supérieur. Le total est la somme des montants arrondis, et le net vaut B − T. C'est ce que fait déjà `detailPrecompte()` dans l'application.
2. **Brut fixé (cas courant).** On applique directement la règle 1.
3. **Net fixé à l'avance.** Le brut théorique se calcule ainsi : B = Net / (1 − 0,1603), arrondi au centime. On recalcule ensuite les lignes avec la règle 1, puis on vérifie que B − T = Net. **Si l'écart n'est pas nul, on corrige B d'un ou deux centimes jusqu'à retomber exactement sur le net.** Ce cas est fréquent : en simulant tous les nets de 0,01 € à 3 000 €, la formule seule rate le net d'un centime (parfois deux) dans **53 %** des cas. Le taux effectif exact est d'ailleurs 16,03025 %, pas 16,03 %.
4. **Plafond.** La vieillesse plafonnée ne porte que sur la part du brut annuel versé à l'auteur sous le plafond de la sécurité sociale. Le chiffre de 47 100 € des anciens modèles est le plafond 2025. Celui de 2026 est à confirmer (V-2). Aucun auteur Medibox n'en approche aujourd'hui, mais la règle doit être codée.

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

> ⚠️ **Modèle incomplet, à ne pas automatiser.** La demande reçue s'arrête au milieu du tableau des cotisations (« Vieillesse plafonnée | Brut × »). Et le complément de mission le dit lui-même : la documentation Urssaf ne donne pas le même traitement que l'ancien modèle. Rien ci-dessous ne doit servir avant l'avis du comptable (V-1).

**Champ d'application (selon la demande) :** artiste-auteur non domicilié fiscalement en France, qui reste affilié au régime français et dispose d'un certificat de résidence fiscale étranger.

### Ce qui est certain (commun aux autres modèles)

- En-tête, identification de l'auteur, du diffuseur et de l'organisme : tronc commun du § 1.
- Une ligne « Situation » : « Artiste-auteur non domicilié(e) fiscalement en France – certificat de résidence fiscale {{pays}} du {{date}}, valable pour {{année}} ».
- Le brut HT, le total précompté, le net versé et la date du versement, avec les mêmes règles d'arrondi que le modèle 2.
- La contribution diffuseur de 1,10 % reste due par Medibox. Les deux sources le disent : l'ancien modèle et la documentation Urssaf citée par Nolwenn.

### Ce que proposait l'ancien document (version « sans A1 » du 31/10/2025), NON VALIDÉ

| Ligne | Traitement dans l'ancien document |
|---|---|
| Vieillesse plafonnée | précomptée à 6,15 % du brut |
| CSG | 0,00 € – « Non applicable – non domiciliée fiscalement en France » |
| CRDS | 0,00 € – même motif |
| CFP | précomptée à 0,35 % du brut |
| Montants pris en charge par l'État | 0,40 % + 0,75 %, comme le modèle 2 |

D'après la demande, la documentation Urssaf dit au contraire que **le précompte ne s'applique pas** quand l'auteur déclare ses revenus fiscalement à l'étranger. Le diffuseur déclare quand même les rémunérations et paie ses contributions. Les deux lectures s'excluent : le comptable doit trancher avant que l'on remplisse le tableau.

### À faire valider par le comptable (modèle 3)

- V-1 : traitement exact du non-résident fiscal affilié en France. Faut-il précompter la vieillesse et la CFP ? Faut-il un précompte ? CSG et CRDS sont-elles bien à 0 ?
- V-3 : faut-il afficher les montants pris en charge par l'État quand la CSG/CRDS n'est pas due ?
- V-4 : quel justificatif exiger (certificat de résidence fiscale, attestation fiscale étrangère, formulaire de l'administration étrangère) et pour quelle durée de validité ?
- Si le net est fixé (V-7) : avec quel taux recalcule-t-on le brut ? L'ancien document gardait le brut calculé à 16,03 % (1 667,27 €) tout en n'appliquant que 6,50 %.
- Le texte de la « Note à l'artiste-auteur » de ce modèle.

---

## 4. MODÈLE A1 – Auteur affilié à un régime étranger (formulaire A1)

> ⚠️ **Modèle partiel.** La partie de la demande consacrée au modèle A1 n'a pas été reçue. Ce qui suit vient de l'ancien document « avec A1 » du 31/10/2025, que Nolwenn a désigné comme référence de présentation. Les règles de fond sont à valider (V-5).

### Ce qui est certain

- Tronc commun du § 1.
- Ligne « Situation » : « Artiste-auteur affilié(e) au régime de sécurité sociale {{pays}} – formulaire A1 n° {{numéro}} délivré par {{organisme émetteur}} ({{pays}}), valable du {{début}} au {{fin}} ».
  - Dans l'ancien document, le numéro et les dates **étaient restés en blanc**. Le futur modèle refuse d'être généré sans eux (voir l'étude, contrôles bloquants).
- Contrôle : la date du versement doit tomber dans la période de validité du A1.
- La contribution diffuseur de 1,10 % reste due par Medibox, déclarée à l'Urssaf Limousin, et n'est pas déduite de l'auteur. L'ancien document le dit, et la demande demande de ne pas supposer que les obligations du diffuseur disparaissent.
- Présentation : on garde le tableau complet des cotisations, chaque ligne à « – / – / 0,00 € », pour que le document reste comparable aux autres modèles.

### Paragraphe de l'ancien document, à faire valider tel quel

> En application du règlement (CE) n° 883/2004 et sur présentation du formulaire A1, l'artiste-auteur relève de la législation de sécurité sociale {{pays}}. Aucune cotisation ni contribution sociale française n'est précomptée sur sa rémunération. La contribution diffuseur (1,1 %) reste due par MEDIBOX FRANCE et est déclarée à l'Urssaf Limousin ; elle n'est pas déduite de la rémunération de l'artiste-auteur.

### À faire valider par le comptable (modèle A1)

- V-5 : un A1 valide écarte-t-il **toutes** les lignes, y compris la CSG/CRDS et la CFP ? Ou seulement les cotisations de sécurité sociale ? La réponse peut dépendre de la résidence fiscale.
- V-5 bis : le titre. Les anciens documents l'appellent « Attestation » et non « Certification », car il n'y a pas de précompte. Le comptable confirme-t-il ce titre et les références (art. L. 382-5, R. 382-27) ?
- Le texte de la « Note à l'artiste-auteur ». L'ancien texte affirme que l'auteur doit déclarer ses revenus à l'étranger : c'est un conseil fiscal, à valider ou à retirer.
- Que faire d'un A1 sans résidence fiscale étrangère, c'est-à-dire un auteur domicilié en France mais affilié ailleurs ?

---

## 5. Incohérences relevées entre les anciens PDF et les formules

| # | Où | Constat | Conséquence pour les modèles |
|---|---|---|---|
| I-1 | Ancien format, deux notes | Mise en page abîmée : « € - » parasites après chaque montant, texte de l'activité dédoublé (« Activité Diffusion pédagogique d'oeuvre pédagogique »), double parenthèse « ((9,20 % », astérisques « ** » sans renvoi, « précomptées » au pluriel pour la CFPC, « deplafonnée » sans accent, « d''activité », virgules à la place des points dans la note. | Remplacé par le modèle 2 (demande de Nolwenn). |
| I-2 | Ancien format | Bloc État : assiette affichée arrondie à l'euro (« 953 », « 1667 ») alors que le montant est calculé sur le brut exact. | Assiette au centime partout. |
| I-3 | Version « sans A1 » | Total précompté affiché 108,37 €, alors que la somme des lignes arrondies (102,54 + 5,84) fait **108,38 €**. Le total a été calculé à 6,50 % sur le brut puis arrondi, et non additionné. Le net (1 558,90 €) est donc faux d'un centime selon la règle des autres documents (1 558,89 €). | Règle unique : somme des lignes arrondies (V-8 pour confirmer). |
| I-4 | Version « sans A1 » | Le brut (1 667,27 €) avait été calculé à 16,03 % pour un net de 1 400 €, mais on n'a retenu que 6,50 %. Le net change donc (1 558,90 €) au lieu de rester à 1 400 €. Pour garder 1 400 € net avec 6,50 %, il aurait fallu un brut de 1 497,33 €. | Le brut se recalcule avec le taux du modèle choisi, quand le net est contractuel (V-7). |
| I-5 | Trois versions de la même note (31/10/2025) | Trois traitements différents pour une même personne et un même versement : précompte complet, précompte partiel, aucun précompte. | Un seul modèle par versement, choisi selon des justificatifs vérifiés. C'est l'objet de l'étude. |
| I-6 | Version « avec A1 » | N° du A1, dates de validité et date du certificat de résidence laissés en blanc (« ___/___/______ »). | Génération bloquée tant que ces champs manquent. |
| I-7 | Tous | L'IBAN de l'auteur est imprimé sur la certification. Ce n'est pas une mention de l'arrêté et c'est une donnée bancaire. | Retiré. |
| I-8 | Tous | « 6,90 % … dans la limite de 47 100 € » : c'est le plafond 2025, alors que les documents seront émis en 2026. Le titre « 2025 » est figé dans le modèle. | Année et plafond tirés de la date du versement (V-2). |
| I-9 | Notes du 31/10/2025 | « Fait le 30/10/2025 », soit avant la « date du versement » du 31/10/2025, alors que le document certifie la somme « effectivement perçue ». | Date d'émission ≥ date du versement. |
| I-10 | Annexe réglementaire | L'art. 2 cité renvoie à « l'article R. 282-20 », référence qui paraît erronée (le reste du texte cite les articles R. 382-…). L'arrêté de 2019 est présenté comme « modifiant l'arrêté du 19 avril 1995 » : à garder, mais le texte doit être recopié depuis Légifrance, pas depuis les anciens PDF. | Vérifier le texte exact avant de l'intégrer. |
| I-11 | Tous | Noms flottants : « CFPC », « CFP », « formation professionnelle ». | Un seul libellé (proposé : « Contribution à la formation professionnelle (CFP) »), à confirmer. |
| I-12 | Demande, modèle 2 | Formule B = Net / (1 − 0,1603) : elle rate le net d'un centime dans 53 % des cas (simulation de 0,01 € à 3 000 €), et le taux exact est 16,03025 %. | Correction au centime prévue (§ 2, règle 3). |
| I-13 | Version « sans A1 » | La note dit que la vieillesse et la CFP « restent précomptées » faute de A1, ce qui contredit la documentation Urssaf citée dans le complément (pas de précompte si l'auteur déclare à l'étranger). | Modèle 3 gelé (V-1). |
| I-14 | Anciennes notes | La « Note à l'artiste-auteur » affirme que le certificat d'immatriculation vaut dispense la 1re année. Si c'est vrai, la note devrait aussi dire qu'on ne précompte pas dans ce cas, or le modèle précompte. | Phrase retirée en attendant V-6. |

---

## 6. Récapitulatif « À faire valider par le comptable »

| Réf. | Question |
|---|---|
| V-1 | Non-résident fiscal français affilié en France : précompte de la vieillesse et de la CFP (ancien modèle), ou aucun précompte (documentation Urssaf citée) ? CSG et CRDS bien non dues ? |
| V-2 | Taux et plafond applicables aux versements de 2026 : les 6,15 %, 9,20 % et 0,50 % sur 98,25 %, et 0,35 % sont-ils inchangés ? Quel est le plafond 2026 à imprimer à la place de 47 100 € ? |
| V-3 | Montants pris en charge par l'État : à afficher dans les modèles 3 et A1, ou seulement dans le modèle 2 ? |
| V-4 | Justificatif de résidence fiscale étrangère accepté, et durée de validité (année civile ? date de délivrance + 1 an ?). |
| V-5 | Effet exact d'un A1 valide : quelles lignes tombent à 0 (sécurité sociale, CSG/CRDS, CFP) ? Titre « Attestation » ou « Certification » ? |
| V-6 | Dispense de précompte (BNC, 1re année) : quels justificatifs, quel document remettre à l'auteur (pas de certification de précompte ?), et que déclare le diffuseur ? |
| V-7 | Net contractuel : quand Medibox fixe un net, le brut se recalcule-t-il avec le taux du modèle de l'auteur ? Pour une régularisation, que fait-on ? |
| V-8 | Arrondi du total : somme des lignes arrondies (proposé, déjà en place dans l'application) ou total arrondi sur le taux global ? |
| V-9 | Lignes « déjà nettes » (pay_basis = net) dans l'application : elles sont versées sans précompte ni contribution diffuseur (voir l'étude, § 8). Le comptable confirme-t-il ce traitement ? |
| V-10 | Libellés et textes : la note à l'auteur de chaque modèle, l'annexe réglementaire, le nom de la CFP. |
