-- La période qu'un rattrapage concerne, dite explicitement.
--
-- Jusqu'ici on la devinait à partir de la date de la ligne : un travail de
-- septembre devait porter une date de septembre. Mais on rattrape souvent
-- une période depuis le mois en cours — « ce mois-ci, je déclare trois
-- séances oubliées en août ». La date reste celle du travail ; la période
-- rattrapée, elle, s'écrit à part.

alter table public.inv_missions
  add column if not exists regul_period text
    check (regul_period is null or regul_period ~ '^\d{4}-\d{2}$');

comment on column public.inv_missions.regul_period is
  'Mois que ce rattrapage concerne, au format AAAA-MM. Vide si la période est celle de la date.';
