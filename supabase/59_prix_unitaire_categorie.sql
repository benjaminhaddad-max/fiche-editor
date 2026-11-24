-- Prix unitaire facultatif sur la catégorie de mission.
-- Rempli : le prestataire ne saisit que la quantité, le total se calcule seul
-- (le serveur impose ce prix, quoi que le formulaire envoie).
-- Vide : la catégorie fonctionne comme avant.
-- Montant stocké comme partout ailleurs (« HT » ; pour un non-assujetti à la
-- TVA, c'est simplement le montant versé).
alter table inv_categories add column if not exists unit_price_ht numeric(10,2) null check (unit_price_ht is null or unit_price_ht >= 0);
