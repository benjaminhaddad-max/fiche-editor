-- La facture hérite de l'école de son prestataire.
--
-- `inv_create_invoice` écrit dans inv_invoices depuis le SQL : aucune
-- recherche dans le code applicatif ne la trouve, et elle échappait donc au
-- recensement des écritures à marquer. Une facture née sans marque prenait
-- « diploma » par défaut — y compris pour un prestataire Linova, dont la
-- facture serait ensuite partie dans la mauvaise comptabilité.
--
-- On ne prend pas la marque du déploiement : on la lit sur le prestataire.
-- Une facture émise par erreur depuis le mauvais site reste ainsi rattachée
-- à la bonne école, au lieu de changer de camp sans bruit.

create or replace function inv_set_invoice_brand()
returns trigger
language plpgsql
as $$
begin
  if new.brand is null or new.brand = 'diploma' then
    select p.brand into new.brand from public.inv_providers p where p.id = new.provider_id;
  end if;
  return new;
end;
$$;

drop trigger if exists t_inv_invoices_brand on public.inv_invoices;
create trigger t_inv_invoices_brand
  before insert on public.inv_invoices
  for each row execute function inv_set_invoice_brand();

comment on function inv_set_invoice_brand() is
  'Reporte sur la facture la marque de son prestataire, quelle que soit la voie d''écriture — y compris inv_create_invoice, qui insère depuis le SQL.';

-- Même raisonnement pour une prestation : elle suit son prestataire.
create or replace function inv_set_mission_brand()
returns trigger
language plpgsql
as $$
begin
  if new.brand is null or new.brand = 'diploma' then
    select p.brand into new.brand from public.inv_providers p where p.id = new.provider_id;
  end if;
  return new;
end;
$$;

drop trigger if exists t_inv_missions_brand on public.inv_missions;
create trigger t_inv_missions_brand
  before insert on public.inv_missions
  for each row execute function inv_set_mission_brand();

comment on function inv_set_mission_brand() is
  'Reporte sur la prestation la marque de son prestataire : un oubli d''écriture côté application ne la range plus dans la mauvaise école.';

-- Et un contrat de coaching, qui crée ensuite des prestations.
create or replace function inv_set_contract_brand()
returns trigger
language plpgsql
as $$
begin
  if new.brand is null or new.brand = 'diploma' then
    select p.brand into new.brand from public.inv_providers p where p.id = new.provider_id;
  end if;
  return new;
end;
$$;

drop trigger if exists t_inv_contracts_brand on public.inv_coaching_contracts;
create trigger t_inv_contracts_brand
  before insert on public.inv_coaching_contracts
  for each row execute function inv_set_contract_brand();

comment on function inv_set_contract_brand() is
  'Reporte sur le contrat la marque de son prestataire.';
