-- Deux choses qu'un professeur doit pouvoir écrire sur sa ligne.
--
-- 1. La formation concernée. « 3 h de colle » ne dit pas pour qui : sans
--    elle, personne ne sait imputer la dépense ni vérifier la cohérence.
-- 2. Le rattrapage d'un mois déjà clos. Un travail de septembre déclaré en
--    octobre garde sa vraie date — c'est elle qui fait foi — mais il est
--    signalé comme régularisation et part sur le bordereau en cours.

alter table public.inv_missions
  add column if not exists formation text,
  add column if not exists regularisation boolean not null default false;

comment on column public.inv_missions.formation is
  'Formation concernée, telle que le prestataire l’a écrite (PASS, LAS, Terminale Santé…).';
comment on column public.inv_missions.regularisation is
  'Rattrapage d’un mois déjà clos : la date reste celle du travail, le paiement suit le cycle en cours.';

-- Retrouver les régularisations d'un coup d'œil au moment de vérifier.
create index if not exists inv_missions_regularisation_idx
  on public.inv_missions (regularisation)
  where regularisation;
