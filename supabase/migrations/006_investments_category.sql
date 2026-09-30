-- ─── Investments category ─────────────────────────────────────────────────────
INSERT INTO transaction_categories (slug, name, is_income, sort_order) VALUES
  ('investments', 'Investments', FALSE, 16);

INSERT INTO transaction_categories (slug, name, parent_id, is_income, sort_order)
SELECT v.slug, v.name, p.id, p.is_income, v.sort_order
FROM (VALUES
  ('investments.brokerage',    'Stocks & Shares',              'investments', 0),
  ('investments.pension',      'Pensions & Retirement',        'investments', 1),
  ('investments.robo_advisor', 'Robo-Advisors & Managed Funds','investments', 2),
  ('investments.crypto',       'Cryptocurrency',                'investments', 3)
) AS v(slug, name, parent_slug, sort_order)
JOIN transaction_categories p ON p.slug = v.parent_slug;
