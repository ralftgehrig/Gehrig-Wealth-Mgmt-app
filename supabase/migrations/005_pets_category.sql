-- ─── Pets category ────────────────────────────────────────────────────────────
INSERT INTO transaction_categories (slug, name, is_income, sort_order) VALUES
  ('pets', 'Pets', FALSE, 15);

INSERT INTO transaction_categories (slug, name, parent_id, is_income, sort_order)
SELECT v.slug, v.name, p.id, p.is_income, v.sort_order
FROM (VALUES
  ('pets.food_supplies',   'Food & Supplies',        'pets', 0),
  ('pets.veterinary',      'Veterinary & Health',    'pets', 1),
  ('pets.grooming',        'Grooming',               'pets', 2),
  ('pets.insurance',       'Insurance',              'pets', 3),
  ('pets.boarding_sitting','Boarding & Pet-sitting', 'pets', 4)
) AS v(slug, name, parent_slug, sort_order)
JOIN transaction_categories p ON p.slug = v.parent_slug;
