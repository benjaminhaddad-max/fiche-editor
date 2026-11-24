-- Groupes de prestataires avec leur propre échéancier (Nolwenn, 24/11/2026,
-- « comme les promotions dans Medibox Lab »).
-- Un groupe dit quels mois il n'y a PAS de versement ; le travail de ces mois
-- part avec le premier mois payé suivant. Un prestataire sans groupe garde
-- l'échéancier par défaut (tuteurs/coachs Medibox : pas de versement en novembre).
create table if not exists inv_echeancier_groupes (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  name text not null,
  mois_sans_versement int[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint mois_valides check (mois_sans_versement <@ array[1,2,3,4,5,6,7,8,9,10,11,12])
);
alter table inv_echeancier_groupes enable row level security;
alter table inv_providers
  add column if not exists echeancier_groupe_id uuid null references inv_echeancier_groupes(id) on delete set null;
