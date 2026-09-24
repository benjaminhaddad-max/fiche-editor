-- L'abattement du passage en contrat.
--
-- Le montant convenu avec le manager est celui qu'on aurait versé à un
-- auto-entrepreneur. Passée en contrat, la personne coûte davantage en
-- charges : le montant qui lui revient est diminué d'un pourcentage convenu.
--
-- Le taux vit sur la fiche, parce qu'il tient à la personne et non à la
-- mission ; il est recopié sur chaque prestation au moment où elle est
-- écrite, pour qu'une prestation passée ne bouge plus si le taux change.

alter table public.inv_providers
  add column if not exists pay_abatement numeric(5,2) not null default 0
    check (pay_abatement >= 0 and pay_abatement < 100);

comment on column public.inv_providers.pay_abatement is
  'Pourcentage retiré du montant convenu, du fait du passage en contrat. 0 pour un indépendant.';

alter table public.inv_missions
  add column if not exists abatement_rate numeric(5,2) not null default 0
    check (abatement_rate >= 0 and abatement_rate < 100);

comment on column public.inv_missions.abatement_rate is
  'Taux appliqué à cette prestation : total_ht vaut déjà quantité × prix moins ce pourcentage.';
