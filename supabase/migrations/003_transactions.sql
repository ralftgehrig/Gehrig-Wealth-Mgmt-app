-- ─── Spending accounts (bank accounts / cards that transaction statements come from) ──
CREATE TABLE spending_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  institution TEXT,
  account_subtype TEXT NOT NULL DEFAULT 'other' CHECK (account_subtype IN (
    'current','savings','credit_card','emoney','other'
  )),
  currency TEXT NOT NULL DEFAULT 'GBP',
  family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
  external_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Transaction categories (hierarchical: top-level + sub-categories) ────────────────
CREATE TABLE transaction_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES transaction_categories(id) ON DELETE CASCADE,
  is_income BOOLEAN NOT NULL DEFAULT FALSE,
  color TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Learned merchant → category rules (built from user corrections) ─────────────────
CREATE TABLE merchant_category_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_text TEXT NOT NULL UNIQUE,
  category_id UUID NOT NULL REFERENCES transaction_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Import batches (one per uploaded statement file) ────────────────────────────────
CREATE TABLE import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spending_account_id UUID NOT NULL REFERENCES spending_accounts(id) ON DELETE CASCADE,
  file_name TEXT,
  format_detected TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  new_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  transfer_rows INT NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Transactions ─────────────────────────────────────────────────────────────────────
-- amount / amount_gbp: signed, positive = money in, negative = money out (original currency / GBP)
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spending_account_id UUID NOT NULL REFERENCES spending_accounts(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES import_batches(id) ON DELETE SET NULL,
  family_member_id UUID REFERENCES family_members(id) ON DELETE SET NULL,
  tx_date DATE NOT NULL,
  description TEXT NOT NULL,
  merchant TEXT,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL,
  amount_gbp DECIMAL(15,2) NOT NULL,
  category_id UUID REFERENCES transaction_categories(id) ON DELETE SET NULL,
  category_confidence TEXT NOT NULL DEFAULT 'auto' CHECK (category_confidence IN ('auto','manual')),
  is_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_group_id UUID,
  tag TEXT CHECK (tag IN ('business_travel')),
  content_hash TEXT NOT NULL,
  occurrence_index INT NOT NULL DEFAULT 1,
  raw_source JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (spending_account_id, content_hash, occurrence_index)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_transactions_account_date ON transactions(spending_account_id, tx_date DESC);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_transfer_group ON transactions(transfer_group_id);
CREATE INDEX idx_transactions_date ON transactions(tx_date DESC);
CREATE INDEX idx_transaction_categories_parent ON transaction_categories(parent_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────────────
ALTER TABLE spending_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all" ON spending_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON transaction_categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON merchant_category_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON import_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all" ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Seed: default category taxonomy ──────────────────────────────────────────────────
-- Top-level categories
INSERT INTO transaction_categories (slug, name, is_income, sort_order) VALUES
  ('income',                'Income',                  TRUE,  0),
  ('transfers',             'Transfers',               FALSE, 1),
  ('groceries',             'Groceries',               FALSE, 2),
  ('eating_out',            'Eating Out & Takeaway',   FALSE, 3),
  ('transport',             'Transport',               FALSE, 4),
  ('shopping',              'Shopping',                FALSE, 5),
  ('entertainment',         'Entertainment & Leisure', FALSE, 6),
  ('travel',                'Travel & Holidays',       FALSE, 7),
  ('health_personal_care',  'Health & Personal Care',  FALSE, 8),
  ('bills_utilities',       'Bills & Utilities',       FALSE, 9),
  ('housing',               'Housing',                 FALSE, 10),
  ('family_kids',           'Family & Kids',           FALSE, 11),
  ('fees_charges',          'Fees & Charges',          FALSE, 12),
  ('gifts_donations',       'Gifts & Donations',       FALSE, 13),
  ('general',               'General / Uncategorised', FALSE, 14);

-- Sub-categories
INSERT INTO transaction_categories (slug, name, parent_id, is_income, sort_order)
SELECT v.slug, v.name, p.id, p.is_income, v.sort_order
FROM (VALUES
  ('income.salary',                 'Salary & Wages',          'income', 0),
  ('income.interest',               'Interest & Dividends',    'income', 1),
  ('income.refund',                 'Refunds & Credits',       'income', 2),
  ('income.other',                  'Other Income',            'income', 3),

  ('eating_out.restaurants',        'Restaurants',              'eating_out', 0),
  ('eating_out.cafes',              'Cafes & Coffee',           'eating_out', 1),
  ('eating_out.takeaway',           'Takeaway & Delivery',      'eating_out', 2),
  ('eating_out.bars',               'Bars & Pubs',              'eating_out', 3),

  ('transport.fuel',                'Fuel',                     'transport', 0),
  ('transport.parking',             'Parking',                  'transport', 1),
  ('transport.public_transport',    'Public Transport',         'transport', 2),
  ('transport.rideshare',           'Taxis & Rideshare',        'transport', 3),
  ('transport.tolls',               'Tolls',                    'transport', 4),
  ('transport.maintenance',         'Car Maintenance',          'transport', 5),

  ('shopping.general',              'General Shopping',         'shopping', 0),
  ('shopping.clothing',             'Clothing',                 'shopping', 1),
  ('shopping.electronics',          'Electronics',               'shopping', 2),
  ('shopping.online_marketplace',   'Online Marketplace',       'shopping', 3),

  ('entertainment.cinema_theatre',  'Cinema & Theatre',         'entertainment', 0),
  ('entertainment.events',          'Events & Attractions',     'entertainment', 1),
  ('entertainment.hobbies_gaming',  'Hobbies & Gaming',         'entertainment', 2),
  ('entertainment.subscriptions',   'Streaming Subscriptions',  'entertainment', 3),

  ('travel.flights',                'Flights',                  'travel', 0),
  ('travel.hotels',                 'Hotels & Accommodation',   'travel', 1),
  ('travel.holiday_activities',     'Holiday Activities',       'travel', 2),

  ('health_personal_care.pharmacy',     'Pharmacy',              'health_personal_care', 0),
  ('health_personal_care.medical',      'Medical',               'health_personal_care', 1),
  ('health_personal_care.personal_care','Personal Care & Beauty','health_personal_care', 2),
  ('health_personal_care.fitness',      'Fitness',               'health_personal_care', 3),

  ('bills_utilities.phone_internet', 'Phone & Internet',        'bills_utilities', 0),
  ('bills_utilities.insurance',      'Insurance',                'bills_utilities', 1),
  ('bills_utilities.energy',         'Energy',                   'bills_utilities', 2),
  ('bills_utilities.subscriptions',  'Software & Subscriptions', 'bills_utilities', 3),
  ('bills_utilities.council_tax',    'Council Tax & Rates',      'bills_utilities', 4),

  ('housing.rent_mortgage',         'Rent & Mortgage',          'housing', 0),
  ('housing.maintenance',           'Home Maintenance',         'housing', 1),

  ('family_kids.childcare',         'Childcare',                'family_kids', 0),
  ('family_kids.education',         'Education',                'family_kids', 1),

  ('fees_charges.bank_fees',        'Bank & Card Fees',         'fees_charges', 0),
  ('fees_charges.fx_fees',          'FX & International Fees',  'fees_charges', 1),
  ('fees_charges.cash_withdrawal',  'Cash & ATM Withdrawal',    'fees_charges', 2),
  ('fees_charges.debt_collection',  'Debt Collection & Legal',  'fees_charges', 3)
) AS v(slug, name, parent_slug, sort_order)
JOIN transaction_categories p ON p.slug = v.parent_slug;
