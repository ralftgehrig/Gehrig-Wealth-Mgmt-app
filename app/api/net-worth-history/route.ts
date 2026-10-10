import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildNetWorthTimeSeries } from '@/lib/calculations/net-worth';
import { getSessionEmail, restrictedAccountIds } from '@/lib/auth/account-restrictions';
import type { Account, BalanceSnapshot } from '@/lib/types';

export async function GET() {
  const supabase = createClient();

  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('balance_snapshots').select('*').order('snapshot_date'),
  ]);

  if (!accounts || !snapshots) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }

  const email = await getSessionEmail(supabase);
  const hiddenIds = restrictedAccountIds(accounts as Account[], email);
  const visibleAccts = (accounts as Account[]).filter((a) => !hiddenIds.has(a.id));
  const visibleSnaps = (snapshots as BalanceSnapshot[]).filter((s) => !hiddenIds.has(s.account_id));

  const series = buildNetWorthTimeSeries(visibleAccts, visibleSnaps);
  return NextResponse.json(series);
}
