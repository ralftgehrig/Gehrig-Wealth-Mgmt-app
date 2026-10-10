-- ─── Divorce settlement (restricted feature) ──────────────────────────────────────────
-- Gated to specific login emails in lib/auth/divorce-settlement.ts, not by RLS — consistent
-- with how the rest of this app enforces access (every "family member" login is otherwise
-- fully trusted; see 007_account_restrictions.sql for the same pattern on individual accounts).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_joint BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS divorce_settlement_debts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  amount_gbp DECIMAL(15,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE divorce_settlement_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON divorce_settlement_debts FOR ALL TO authenticated USING (true) WITH CHECK (true);
