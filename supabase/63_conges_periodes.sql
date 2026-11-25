-- Plusieurs périodes par mois pour les congés payés, sans solde et arrêts.
-- Chaque élément : {"du":"2026-11-27","au":"2026-11-30","jours":2}.
-- Les colonnes *_days / *_start / *_end restent remplies (total, première et dernière date).
alter table inv_payroll_inputs
  add column if not exists paid_leave_periods jsonb not null default '[]'::jsonb,
  add column if not exists unpaid_leave_periods jsonb not null default '[]'::jsonb,
  add column if not exists sick_leave_periods jsonb not null default '[]'::jsonb;
