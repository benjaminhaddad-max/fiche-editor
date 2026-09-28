-- La séance, et non plus seulement la journée.
--
-- Jusqu'ici un professeur déclarait « 12 h de cours en septembre » : une
-- date, un nombre d'heures, et rien pour dire quand. Qualiopi exige la
-- traçabilité séance par séance — le créneau exact, le groupe formé, le
-- module dispensé et la modalité. Sans cela le BTS ne peut pas prouver la
-- réalité de la formation lors d'un audit, et une déclaration honnête
-- devient une pièce inutilisable.
--
-- Une ligne de déclaration devient donc une séance. Les champs restent
-- facultatifs au niveau de la base : toutes les prestations ne sont pas des
-- cours, et un enregistreur n'a pas de groupe ni de module. C'est la
-- catégorie qui décide de les exiger, pour qu'on puisse l'imposer au BTS
-- sans l'imposer à tout le monde.

alter table public.inv_missions
  add column if not exists start_time  time,
  add column if not exists end_time    time,
  add column if not exists groupe      text,
  add column if not exists subject     text,
  add column if not exists modality    text,
  add column if not exists location    text;

comment on column public.inv_missions.start_time is
  'Heure de début de la séance. Vide pour une prestation qui n''est pas un cours.';
comment on column public.inv_missions.end_time is
  'Heure de fin. Avec start_time, elle donne la durée réellement dispensée.';
comment on column public.inv_missions.groupe is
  'Le groupe ou la classe formée pendant cette séance — « BTS 1 », « PASS B »…';
comment on column public.inv_missions.subject is
  'Le module ou la matière enseignée, rattachable au programme.';
comment on column public.inv_missions.modality is
  'presentiel | distanciel | hybride — comment la séance s''est tenue.';
comment on column public.inv_missions.location is
  'La salle ou le lieu, quand la modalité seule ne suffit pas à la preuve.';

-- Une fin avant le début n'est pas une séance. On ne vérifie que si les
-- deux sont là : une prestation sans horaires reste parfaitement valable.
alter table public.inv_missions
  drop constraint if exists inv_missions_horaires_ck;
alter table public.inv_missions
  add constraint inv_missions_horaires_ck
    check (start_time is null or end_time is null or end_time > start_time);

alter table public.inv_missions
  drop constraint if exists inv_missions_modality_ck;
alter table public.inv_missions
  add constraint inv_missions_modality_ck
    check (modality is null or modality in ('presentiel', 'distanciel', 'hybride'));

-- Quelles catégories réclament ce détail. Coché pour les enseignements
-- soumis à Qualiopi, laissé vide partout ailleurs : c'est le seul réglage
-- à faire pour qu'une formation devienne auditable.
alter table public.inv_categories
  add column if not exists requires_session boolean not null default false;

comment on column public.inv_categories.requires_session is
  'Vrai quand la déclaration doit se faire séance par séance : créneau, groupe, module et modalité obligatoires (exigence Qualiopi).';

create index if not exists idx_inv_missions_seance
  on public.inv_missions (start_date, start_time)
  where start_time is not null;
