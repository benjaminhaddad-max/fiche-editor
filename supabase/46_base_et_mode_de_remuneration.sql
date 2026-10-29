-- Deux réglages qui tiennent à la personne, et non à chaque ligne saisie.
--
-- 1. La base convenue — brut ou net.
--
--    Avec un vacataire salarié, on se met d'accord sur un net à payer. La
--    plateforme, elle, posait la question ligne par ligne : une case
--    « Montant net » à cocher sur chaque prestation, qui partait décochée.
--    Personne ne la cochait, et tout remontait en brut au service paie —
--    611 lignes sans mention, 30 en brut, 17 en net. Shirel a vu « 908 €
--    brut » là où on avait promis du net.
--
--    La base vit donc sur la fiche : convenue une fois, au contrat, et
--    reprise sur chaque ligne. Elle reste recopiée sur la prestation au
--    moment où on l'écrit, pour qu'une prestation passée ne bouge plus si
--    la fiche change.
--
-- 2. Le mode — montant fixe ou variable.
--
--    Un vacataire à montant identique chaque mois n'a rien à redéclarer :
--    il n'y a qu'à valider. On ne doit donc pas le relancer comme un
--    prestataire qui facture ce qu'il a fait. Faute de ce réglage, tout le
--    monde était relancé de la même façon.

alter table public.inv_providers
  add column if not exists pay_basis text
    check (pay_basis is null or pay_basis in ('brut', 'net')),
  add column if not exists pay_mode text
    check (pay_mode is null or pay_mode in ('fixe', 'variable'));

comment on column public.inv_providers.pay_basis is
  'Base convenue avec la personne : brut ou net. Reprise par défaut sur ses '
  'prestations. Vide pour un indépendant, qui facture.';

comment on column public.inv_providers.pay_mode is
  'fixe : même montant chaque mois, rien à redéclarer, on valide. '
  'variable : déclare chaque mois ce qu''elle a fait. Vide = variable.';

-- Les vacataires sont payés sur un net convenu : c'est la règle, pas une
-- exception. Les alternants et les salariés ont au contraire un salaire
-- fixe dont les éléments s'expriment en brut : on ne touche pas à leur fiche.
update public.inv_providers
   set pay_basis = 'net'
 where employment_type = 'vacataire'
   and pay_basis is null;
