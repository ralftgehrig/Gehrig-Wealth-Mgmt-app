-- ─── Per-login account restrictions ───────────────────────────────────────────────────
-- Lets a specific account be hidden — including from all derived net-worth stats/analytics —
-- from one or more login emails, while remaining fully visible to everyone else. Enforced in
-- the API routes (app/api/accounts, balances, net-worth-history, debug-net-worth, insights),
-- not via RLS, consistent with this app's existing "any authenticated family member" trust model.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS restricted_emails TEXT[] NOT NULL DEFAULT '{}';

-- Hide the Bitcoin account from Shannon's login.
UPDATE accounts
SET restricted_emails = array_append(restricted_emails, 'shannon@shannonfeely.com')
WHERE name ILIKE '%bitcoin%'
  AND NOT ('shannon@shannonfeely.com' = ANY(restricted_emails));
