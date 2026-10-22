-- Les catégories de Medibox, reprises de leur formulaire.
--
-- Les neuf catégories existantes portaient « all » : elles se voyaient donc
-- de partout, alors qu'elles disent le vocabulaire de Diploma — « Pédagogie
-- - Admin (Coaching / Secrétariat) », « Impression », « Télépro / Closers ».
-- Nolwenn les aurait trouvées dans sa liste de déclaration.
--
-- Elles passent à « diploma », sauf « Autres » qui reste commune : c'est la
-- seule que Linova utilise, et elle ne dit rien d'une école en particulier.
--
-- Medibox reçoit les siennes, telles que son formulaire les énumère — la
-- ville dans l'intitulé, parce que c'est ainsi qu'ils raisonnent et que la
-- déclaration n'a pas de champ de ville distinct.

UPDATE inv_categories SET brand = 'diploma'
WHERE brand = 'all' AND name <> 'Autres';

INSERT INTO inv_categories (name, provider_label, pole, requires_session, is_active, sort_order, brand)
VALUES
  ('Coach Medibox Marseille',    'Coach Medibox — Marseille',    'coaching',       FALSE, TRUE, 10, 'medibox'),
  ('Coach Medibox Lille',        'Coach Medibox — Lille',        'coaching',       FALSE, TRUE, 11, 'medibox'),
  ('Coach Medibox Bordeaux',     'Coach Medibox — Bordeaux',     'coaching',       FALSE, TRUE, 12, 'medibox'),
  ('Coach Medibox Montpellier',  'Coach Medibox — Montpellier',  'coaching',       FALSE, TRUE, 13, 'medibox'),
  ('Coach Hermione',             'Coach Hermione',               'coaching',       FALSE, TRUE, 14, 'medibox'),

  ('Cours / ED Marseille',       'Cours / ED — Marseille',       'professeur',     TRUE,  TRUE, 20, 'medibox'),
  ('Cours / ED Lille',           'Cours / ED — Lille',           'professeur',     TRUE,  TRUE, 21, 'medibox'),
  ('Cours / ED Bordeaux',        'Cours / ED — Bordeaux',        'professeur',     TRUE,  TRUE, 22, 'medibox'),
  ('Cours / ED Montpellier',     'Cours / ED — Montpellier',     'professeur',     TRUE,  TRUE, 23, 'medibox'),

  ('Tutorat Marseille',          'Tutorat — fiches, QCM, réponses aux questions, création CCB (Marseille)',   'referent', FALSE, TRUE, 30, 'medibox'),
  ('Tutorat Lille',              'Tutorat — fiches, QCM, réponses aux questions, création CCB (Lille)',       'referent', FALSE, TRUE, 31, 'medibox'),
  ('Tutorat Bordeaux',           'Tutorat — fiches, QCM, réponses aux questions, création CCB (Bordeaux)',    'referent', FALSE, TRUE, 32, 'medibox'),
  ('Tutorat Montpellier',        'Tutorat — fiches, QCM, réponses aux questions, création CCB (Montpellier)', 'referent', FALSE, TRUE, 33, 'medibox'),

  ('Actualisation Marseille',    'Actualisation des supports — Marseille',    'referent', FALSE, TRUE, 40, 'medibox'),
  ('Actualisation Lille',        'Actualisation des supports — Lille',        'referent', FALSE, TRUE, 41, 'medibox'),
  ('Actualisation Bordeaux',     'Actualisation des supports — Bordeaux',     'referent', FALSE, TRUE, 42, 'medibox'),
  ('Actualisation Montpellier',  'Actualisation des supports — Montpellier',  'referent', FALSE, TRUE, 43, 'medibox'),

  ('Prise de note Marseille',    'Prise de note — Marseille',    'enregistrement', FALSE, TRUE, 50, 'medibox'),
  ('Prise de note Lille',        'Prise de note — Lille',        'enregistrement', FALSE, TRUE, 51, 'medibox'),

  ('Missions diverses',          'Missions diverses',            'autres',         FALSE, TRUE, 90, 'medibox')
ON CONFLICT DO NOTHING;
