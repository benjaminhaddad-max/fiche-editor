-- Une adresse qui n'a jamais rien reçu, dite à voix haute.
--
-- Brevo accepte un envoi puis le bloque à sa porte quand l'adresse a déjà
-- rebondi : la boîte n'existe pas, et plus rien ne repart jamais. Notre
-- journal, lui, écrivait « envoyé » — il enregistrait la réponse de l'API,
-- pas le sort du message. Dix-sept invitations ont ainsi été « envoyées » à
-- un professeur dont la boîte n'existe pas, sans que rien ne le signale ;
-- son silence passait pour de la négligence.
--
-- On garde donc le verdict de Brevo à côté du compte, pour qu'une adresse
-- morte se voie à l'écran au lieu de se deviner.

alter table public.inv_users
  add column if not exists email_unreachable_at timestamptz,
  add column if not exists email_unreachable_reason text;

comment on column public.inv_users.email_unreachable_at is
  'Date du constat : Brevo a bloqué tous les envois à cette adresse, aucun n''a été livré. Vide = adresse joignable.';
comment on column public.inv_users.email_unreachable_reason is
  'Ce que le serveur du destinataire a répondu — « boîte inexistante », « désinscrit »…';
