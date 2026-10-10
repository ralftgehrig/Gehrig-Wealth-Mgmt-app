import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildNetWorthTimeSeries } from '@/lib/calculations/net-worth';
import { getSessionEmail, restrictedAccountIds } from '@/lib/auth/account-restrictions';
import { isBitcoinAccountName } from '@/lib/account-name';
import type { Account, BalanceSnapshot } from '@/lib/types';

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  // Personal display preference (see lib/display-currency.tsx), not the access restriction below.
  const hideBitcoin = searchParams.get('hideBitcoin') === '1';

  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase.from('accounts').select('*'),
    supabase.from('balance_snapshots').select('*').order('snapshot_date'),
  ]);

  if (!accounts || !snapshots) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }

  const email = await getSessionEmail(supabase);
  const hiddenIds = restrictedAccountIds(accounts as Account[], email);
  if (hideBitcoin) {
    for (const a of accounts as Account[]) {
      if (isBitcoinAccountName(a.name)) hiddenIds.add(a.id);
    }
  }
  const visibleAccts = (accounts as Account[]).filter((a) => !hiddenIds.has(a.id));
  const visibleSnaps = (snapshots as BalanceSnapshot[]).filter((s) => !hiddenIds.has(s.account_id));

  const series = buildNetWorthTimeSeries(visibleAccts, visibleSnaps);
  return NextResponse.json(series);
}
