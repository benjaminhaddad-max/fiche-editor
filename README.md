# Diploma Invoice

Plateforme de déclaration des prestations et de facturation des prestataires de
Diploma Santé.

## Le flux

```
Prestataire            Manager         Admin                  Pennylane
-----------            ---------------         -----                  ---------
déclare une      →     valide ou refuse   →    valide          →      facture d'achat
prestation             (motif obligatoire)     définitivement          (PDF + ventilation)
                                                     ↓
                                            le prestataire génère
                                            SA facture depuis les
                                            prestations validées
```

La facture est **générée par la plateforme**, jamais rédigée par le prestataire.
C'est ce qui règle le problème historique de rapprochement Pennylane : le nom du
fournisseur vient de son `pennylane_supplier_id`, et les montants sont ceux qui
ont été validés, au centime près.

## Rôles

| Rôle | Ce qu'il fait |
|---|---|
| `prestataire` | Déclare ses prestations, complète son profil de facturation, génère et transmet ses factures. |
| `manager` | Manager : valide ou refuse les prestations qui lui sont soumises. |
| `admin` | Validation finale, gestion des prestataires, catégories, comptes, synchronisation Pennylane. |

## Installation

### 1. Base de données

Dans **Supabase → SQL Editor**, exécuter dans l'ordre :

```
supabase/01_schema.sql          tables, types, index
supabase/02_rls.sql             fonctions d'accès, RLS, numérotation
supabase/03_seed.sql            catégories de missions, bucket PDF
supabase/04_invoice_function.sql  création atomique d'une facture
```

> `01_schema.sql` supprime les tables de l'ancien projet fiche-editor
> (`fiches`, `fiche_users`). Exporter avant si besoin.

### 2. Premier administrateur

1. **Authentication → Users → Add user** (cocher *Auto Confirm User*).
2. Copier l'UUID, puis :

```sql
INSERT INTO inv_users (auth_id, email, full_name, role)
VALUES ('<UUID>', 'vous@diploma-sante.fr', 'Votre Nom', 'admin');
```

Tous les autres comptes se créent ensuite depuis **Admin → Utilisateurs**.

### 3. Variables d'environnement

Copier `.env.example` vers `.env.local` et compléter. Les variables
`NEXT_PUBLIC_COMPANY_*` alimentent le bloc « Facturé à » des PDF.

### 4. Lancer

```bash
npm install
npm run dev
```

## Pennylane

La synchronisation utilise l'API v2 en trois temps :

1. `POST /file_attachments` — upload du PDF
2. `POST /supplier_invoices/import` — création de la facture d'achat
3. `PUT /supplier_invoices/{id}/categories` — ventilation analytique

Scopes nécessaires : `file_attachments:all`, `supplier_invoices:all`,
`suppliers:all`, `categories:readonly`.

> Les `id_pennylane` des catégories de missions sont des **ID de catégories
> Pennylane** (vérifié contre l'API : `21634805` = « Pédagogie - Professeur »),
> pas des comptes du plan comptable — ceux-ci ont des ID à 13 chiffres. La
> ventilation se pose sur la facture entière, au prorata du montant de chaque
> ligne, les poids d'un même groupe devant totaliser exactement 1.

Deux prérequis avant de pouvoir synchroniser une facture :

- le prestataire a un **ID fournisseur Pennylane** (Admin → Prestataires) ;
- chaque catégorie de mission a un **id_pennylane** (Admin → Catégories).

Sans `PENNYLANE_API_TOKEN`, la plateforme fonctionne normalement : seul le bouton
de synchronisation est désactivé.

## Facture : générée ou déposée

Chaque prestataire choisit dans son profil :

- **générée par la plateforme** (défaut) — numérotation, mentions légales et
  coordonnées bancaires remplies automatiquement ;
- **déposée** — il fournit son propre PDF.

Dans les deux cas les **montants restent ceux validés en base**. Un PDF déposé
n'est qu'une pièce jointe : il n'est jamais lu comme source de vérité, et c'est
toujours le montant validé qui part dans Pennylane. En mode « déposée », la
facture ne peut pas être transmise tant que le PDF n'est pas là.

## Emails (Brevo)

`src/lib/email/` — client Brevo, gabarits HTML, et journal `inv_email_log`.
Trois envois automatiques : prestation refusée, prestations devenues
facturables, facture reçue (aux admins).

Les relances tournent par `npm run relances` (aperçu) / `-- --apply` (envoi) :
factures émises jamais transmises, et prestations validées dormantes. À
programmer une fois par jour.

Sans `BREVO_API_KEY`, rien n'est envoyé et tout est journalisé en `skipped` —
la plateforme fonctionne normalement.

## Garde-fous

- Une prestation partie en validation n'est plus modifiable par le prestataire.
- Une prestation refusée revient modifiable, avec le motif affiché.
- La création de facture est **atomique** (`inv_create_invoice`) : numérotation,
  lignes et verrouillage des prestations dans une seule transaction.
- La facture fige un **snapshot** de l'émetteur : modifier son profil après coup
  ne change pas une facture déjà émise.
- La numérotation est une séquence continue **par prestataire**, verrou en base
  contre le double clic.
