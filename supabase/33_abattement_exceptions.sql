-- L'abattement de contrat, avec ses exceptions.
--
-- Un salarié touche le montant convenu diminué d'un pourcentage, parce que
-- le contrat porte des charges que l'auto-entreprise n'a pas. Jusqu'ici ce
-- taux valait pour tout ce que la personne faisait, ou pour rien : Danial
-- était donc entré à 0 %, ce qui exonérait aussi ses missions d'enregistreur
-- ou de commercial, qui n'avaient aucune raison de l'être.
--
-- On garde donc le taux, et on nomme à part les pôles qui en sont exemptés.
-- Pour Danial : le coaching, et lui seul. Le reste suit le contrat.
--
-- L'exception se décide par pôle et non par catégorie : c'est le métier
-- exercé qui la justifie, pas la ligne comptable sur laquelle il tombe.

alter table public.inv_providers
  add column if not exists abatement_exempt_poles text[] not null default '{}';

comment on column public.inv_providers.abatement_exempt_poles is
  'Pôles auxquels l''abattement de contrat ne s''applique pas, pour cette personne. Vide = l''abattement vaut partout.';

comment on column public.inv_providers.pay_abatement is
  'Pourcentage retiré du montant convenu, du fait des charges du contrat. Ne s''applique pas aux pôles listés dans abatement_exempt_poles.';

-- Le taux retenu sur une prestation reste figé sur la ligne : une
-- prestation passée ne doit pas bouger si la règle change ensuite. C'est
-- aussi ce qui permet de lever l'abattement sur une ligne précise, sans
-- toucher à la règle générale.
comment on column public.inv_missions.abatement_rate is
  'Taux réellement retenu sur cette prestation, figé à sa création. Mis à 0 à la main quand on lève l''abattement sur un cas particulier.';
