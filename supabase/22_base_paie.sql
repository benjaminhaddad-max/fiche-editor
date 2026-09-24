-- Net ou brut : sans cette distinction, le total envoyé au social est faux.
--
-- Un CDD vacataire a un forfait de coaching exprimé en NET (« 2 666,66 € net
-- par semestre ») et des missions complémentaires exprimées en BRUT (70 € la
-- demi-journée d'enregistrement). Additionner les deux ne veut rien dire.
-- On note donc, sur chaque prestation d'un salarié, la base du montant.
-- Un indépendant facture : la colonne reste vide pour lui.

alter table public.inv_missions
  add column if not exists pay_basis text
    check (pay_basis is null or pay_basis in ('brut', 'net'));

comment on column public.inv_missions.pay_basis is
  'Base du montant pour un salarié : brut ou net. Vide pour un indépendant, qui facture.';

-- Le contrat porte la base de ses échéances : elle est reprise telle quelle
-- quand l'échéance devient une prestation.
alter table public.inv_coaching_contracts
  add column if not exists pay_basis text
    check (pay_basis is null or pay_basis in ('brut', 'net'));

comment on column public.inv_coaching_contracts.pay_basis is
  'Base des montants du contrat pour un salarié : brut ou net.';
