# Family Wealth App — Setup Guide

## What you need

- A [Supabase](https://supabase.com) account (free tier is fine)
- A [Vercel](https://vercel.com) account (free tier is fine)
- This repository pushed to GitHub

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `family-wealth`, pick the **London (eu-west-2)** region, set a strong DB password
3. Wait ~2 minutes for it to provision

## Step 2 — Run the database migrations

1. In your Supabase dashboard → **SQL Editor**
2. Open `supabase/migrations/001_schema.sql` from this repo, paste the entire contents and click **Run**
3. Do the same for `002_performance_income.sql` and `003_transactions.sql`, in order

This creates all tables, indexes, RLS policies, and seeds the default scenarios and spending categories.

## Step 3 — Create your login user

1. Supabase dashboard → **Authentication** → **Users** → **Add user**
2. Enter your email and a strong password
3. That's the only login for the app

## Step 4 — Get your Supabase keys

In Supabase → **Settings** → **API**, note:
- **Project URL** (e.g. `https://abcdefgh.supabase.co`)
- **anon/public** key
- **service_role** key (keep secret)

## Step 5 — Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo
3. In the **Environment Variables** section, add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service_role key |

4. Click **Deploy** — it takes ~2 minutes

## Step 6 — Install on your phone (PWA)

**iPhone/Safari:**
1. Open your Vercel URL in Safari
2. Log in
3. Tap the Share button → **Add to Home Screen**
4. Done — you now have a native-looking app icon

**Android/Chrome:**
1. Open the URL in Chrome
2. Chrome will show an "Add to Home Screen" banner, or tap ⋮ → **Add to Home Screen**

---

## First-time usage

1. Go to **Settings** → add family members (yourself, wife, children with their dates of birth)
2. Go to **Accounts** → add all your accounts (Vanguard ISA, Aviva pension, Barclays current, Coinbase, etc.)
3. **Update balances** for each account — enter the current balance from each provider's app/website
4. When updating non-GBP accounts, the app will auto-fetch the live exchange rate

## Quarterly update workflow

1. Open each provider's app/website at quarter end
2. Go to **Accounts** in Family Wealth → tap the refresh icon next to each account
3. Enter the current balance and how much you contributed since last time
4. The **Insights** page will then show your investment return vs. your contributions

## Infosys RSU tracking

1. Go to **Income** → **Add source**
2. Select **RSU / Stock Options** as the type
3. Enter your grant details and add each vesting tranche with date and number of shares
4. When a vest date arrives, tap **Mark vested** and enter the actual value and tax withheld

## Spending tracking

1. Go to **Spending** → **Upload statement**
2. Pick a CSV or Excel export from your bank/card (Barclays, Wise and Amex are auto-detected; other banks fall back to a best-effort column-matching parser)
3. Confirm which account it belongs to (or create a new one) and review the preview, then **Import transactions**
4. Re-uploading a statement later (e.g. covering an overlapping date range) automatically skips anything already imported — only genuinely new transactions are added
5. Money moving between your own accounts is detected automatically and marked as a transfer, excluded from spending/income analysis
6. Tap the plane icon on a transaction to mark it as business travel (reimbursable) — tagged expenses and their reimbursements are excluded from analysis but reconciled in **Insights**
7. Correcting a transaction's category is remembered — future imports from that merchant use your correction automatically

---

## Exchange rate integration

FX rates are fetched automatically from [frankfurter.app](https://api.frankfurter.app) (free, ECB-based, no API key required) whenever you update a non-GBP balance.

## Bank integrations (future)

| Provider | Status |
|---|---|
| Exchange rates | ✅ Automatic |
| Barclays | 🔜 UK Open Banking (planned) |
| Coinbase | 🔜 API key integration (planned) |
| Vanguard UK | ❌ No public API — manual only |
| Aviva | ❌ No public API — manual only |
| Amex UK | 🔜 Limited Open Banking (planned) |
