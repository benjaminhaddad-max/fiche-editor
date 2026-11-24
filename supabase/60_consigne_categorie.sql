-- Consigne par catégorie de mission (Nolwenn, 24/11/2026) : un texte libre que
-- le prestataire lit en choisissant la catégorie dans sa déclaration.
alter table inv_categories add column if not exists instruction text null;
