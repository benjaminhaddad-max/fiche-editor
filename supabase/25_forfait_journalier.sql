-- La journée, à côté de l'heure et de la mission.
--
-- Une porte ouverte, une journée de salon, une vacation : ça se compte en
-- journées, pas en heures ni en « missions ». Sans cette unité, les gens
-- écrivaient « 1 mission » à 250 € sans qu'on sache de quoi il s'agissait.

alter type public.inv_pricing_type add value if not exists 'forfait_journalier';
