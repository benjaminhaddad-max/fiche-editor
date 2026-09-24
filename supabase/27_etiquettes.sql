-- Des étiquettes libres sur les fiches.
--
-- Les pôles sont fixes et servent à la compta ; les étiquettes servent à
-- s'y retrouver — « professeur », « référent », « commercial », « à
-- relancer ». Elles se créent en écrivant, sans passer par une table de
-- référence : une étiquette qui ne sert plus disparaît d'elle-même quand
-- on la retire de la dernière fiche.

alter table public.inv_providers
  add column if not exists tags text[] not null default '{}';

comment on column public.inv_providers.tags is
  'Étiquettes libres, pour regrouper et filtrer les prestataires.';

create index if not exists inv_providers_tags_idx on public.inv_providers using gin (tags);
