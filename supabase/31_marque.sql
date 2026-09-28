-- Deux écoles, un seul code, une seule base.
--
-- Diploma Lab et Medibox Lab tournent déjà ainsi : le même dépôt déployé
-- plusieurs fois, chaque déploiement portant sa marque dans
-- NEXT_PUBLIC_BRAND, et une colonne `brand` qui dit à qui chaque ligne
-- appartient. On reprend exactement ce dispositif pour que Linova Invoice
-- existe sans dupliquer la plateforme — ni la base, ni le code.
--
-- Ce que la marque sépare : les personnes et ce qui les concerne. Un compte
-- Linova ne se connecte pas à Diploma Invoice, et les prestations, factures
-- et contrats d'une école ne se lisent pas depuis l'autre.
--
-- La marque est portée aussi par les prestations et les factures, alors
-- qu'elle se déduirait du prestataire. C'est délibéré : sans elle, chaque
-- lecture devrait passer par une jointure, et la première requête qui
-- l'oublierait laisserait filtrer les lignes de l'autre école sans bruit.

alter table public.inv_users
  add column if not exists brand text not null default 'diploma';
alter table public.inv_providers
  add column if not exists brand text not null default 'diploma';
alter table public.inv_missions
  add column if not exists brand text not null default 'diploma';
alter table public.inv_invoices
  add column if not exists brand text not null default 'diploma';
alter table public.inv_coaching_contracts
  add column if not exists brand text not null default 'diploma';

-- Les catégories, elles, peuvent être communes : « Enregistrement de cours »
-- veut dire la même chose partout. « all » les rend visibles aux deux.
alter table public.inv_categories
  add column if not exists brand text not null default 'all';

comment on column public.inv_users.brand is
  'École à laquelle ce compte appartient. Il ne peut se connecter qu''au déploiement de cette marque.';
comment on column public.inv_categories.brand is
  '« all » pour une catégorie commune aux deux écoles, sinon la marque qui la voit.';

do $$
declare
  t text;
begin
  foreach t in array array['inv_users', 'inv_providers', 'inv_missions', 'inv_invoices',
                           'inv_coaching_contracts', 'inv_categories']
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_brand_ck');
    execute format(
      'alter table public.%I add constraint %I check (brand in (''diploma'', ''linova'', ''all''))',
      t, t || '_brand_ck');
    execute format(
      'create index if not exists %I on public.%I (brand)',
      'idx_' || t || '_brand', t);
  end loop;
end $$;
