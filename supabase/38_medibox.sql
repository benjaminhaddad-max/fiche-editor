-- Une troisième marque : Medibox.
--
-- Medibox a sa propre direction (Nolwenn), ses propres prestataires et sa
-- propre facturation, mais partage la base et le code. La seule chose à
-- faire côté données est d'élargir la contrainte : tout le reste — portée
-- des lectures, cloisonnement des comptes — passe déjà par `brand`.
--
-- On n'ajoute pas de valeur par défaut : une ligne sans marque explicite
-- reste 'diploma', comme avant. Rien ne bouge pour l'existant.

do $$
declare
  t text;
begin
  foreach t in array array['inv_users', 'inv_providers', 'inv_missions', 'inv_invoices',
                           'inv_coaching_contracts', 'inv_categories']
  loop
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_brand_ck');
    execute format(
      'alter table public.%I add constraint %I check (brand in (''diploma'', ''linova'', ''medibox'', ''all''))',
      t, t || '_brand_ck');
  end loop;
end $$;
