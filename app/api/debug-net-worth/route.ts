import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionEmail, restrictedAccountIds } from '@/lib/auth/account-restrictions';
import type { Account, BalanceSnapshot } from '@/lib/types';

// Returns per-account net worth breakdown for every date in a range.
// Usage: /api/debug-net-worth?from=2025-10-01&to=2026-03-01
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? '2025-10-01';
  const to   = searchParams.get('to')   ?? '2026-03-01';

  const supabase = createClient();
  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('balance_snapshots')
      .select('*')
      .order('snapshot_date'),
  ]);

  if (!accounts || !snapshots) return NextResponse.json({ error: 'load failed' }, { status: 500 });

  const email = await getSessionEmail(supabase);
  const hiddenIds = restrictedAccountIds(accounts as Account[], email);
  const visibleAccts = (accounts as Account[]).filter((a) => !hiddenIds.has(a.id));
  const visibleSnaps = (snapshots as BalanceSnapshot[]).filter((s) => !hiddenIds.has(s.account_id));

  const acctMap = Object.fromEntries(visibleAccts.map((a) => [a.id, a]));

  // Build running latest per account up to `from`
  const latest: Record<string, BalanceSnapshot> = {};
  for (const snap of visibleSnaps) {
    if (snap.snapshot_date < from) {
      const prev = latest[snap.account_id];
      if (!prev || snap.snapshot_date > prev.snapshot_date) latest[snap.account_id] = snap;
    }
  }

  // Collect dates in range
  const byDate: Record<string, BalanceSnapshot[]> = {};
  for (const snap of visibleSnaps) {
    if (snap.snapshot_date >= from && snap.snapshot_date <= to) {
      if (!byDate[snap.snapshot_date]) byDate[snap.snapshot_date] = [];
      byDate[snap.snapshot_date].push(snap);
    }
  }

  const result = [];
  for (const date of Object.keys(byDate).sort()) {
    for (const snap of byDate[date]) {
      const prev = latest[snap.account_id];
      if (!prev || snap.snapshot_date > prev.snapshot_date) latest[snap.account_id] = snap;
    }

    let total = 0;
    const breakdown = [];
    for (const [accountId, snap] of Object.entries(latest)) {
      const acct = acctMap[accountId];
      if (!acct || !acct.is_active) continue;
      const signed = acct.is_liability ? -snap.gbp_balance : snap.gbp_balance;
      total += signed;
      breakdown.push({
        account: acct.name,
        provider: acct.provider,
        is_liability: acct.is_liability,
        snap_date: snap.snapshot_date,
        gbp_balance: snap.gbp_balance,
        signed,
      });
    }

    breakdown.sort((a, b) => a.signed - b.signed);
    result.push({ date, total: Math.round(total), breakdown });
  }

  return NextResponse.json(result);
}
