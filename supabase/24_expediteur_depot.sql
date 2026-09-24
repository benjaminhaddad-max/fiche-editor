-- D'où vient une facture reçue par email, et qui l'a envoyée.
--
-- Jusqu'ici, un message venu d'une adresse inconnue était écarté sans
-- laisser de trace : la facture disparaissait et personne ne le savait.
-- Désormais on garde l'adresse, et la facture attend d'être rattachée à un
-- manager à la main. Rien n'entre en compta tant que ce n'est pas fait.

alter table public.inv_invoices
  add column if not exists inbound_from text,
  add column if not exists inbound_match text
    check (inbound_match is null or inbound_match in ('adresse', 'ia', 'manuel'));

comment on column public.inv_invoices.inbound_from is
  'Adresse qui a envoyé la facture sur la boîte de dépôt.';
comment on column public.inv_invoices.inbound_match is
  'Comment le manager a été retrouvé : adresse connue, déduction de l’IA, ou rattachement à la main. Vide = encore à rattacher.';

create index if not exists inv_invoices_a_rattacher_idx
  on public.inv_invoices (created_at desc)
  where channel = 'email' and submitted_by is null;
