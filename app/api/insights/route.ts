import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analyseReturns } from '@/lib/calculations/returns';
import { getSessionEmail, restrictedAccountIds } from '@/lib/auth/account-restrictions';

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  const [{ data: accounts }, { data: snapshots }, { data: contributions }] = await Promise.all([
    supabase.from('accounts').select('id, name, is_liability, restricted_emails').eq('is_active', true),
    supabase.from('balance_snapshots').select('*').order('snapshot_date'),
    supabase.from('contributions').select('*').order('contribution_date'),
  ]);

  if (!accounts || !snapshots || !contributions) {
    return NextResponse.json({ error: 'Failed to load data' }, { status: 500 });
  }

  const email = await getSessionEmail(supabase);
  const hiddenIds = restrictedAccountIds(accounts, email);

  const results = accounts
    .filter((a) => !a.is_liability && !hiddenIds.has(a.id))
    .map((account) => {
      const acctSnaps = snapshots.filter((s) => s.account_id === account.id);
      const acctContribs = contributions.filter((c) => c.account_id === account.id);
      return analyseReturns(account.id, account.name, acctSnaps as never, acctContribs as never, from, to);
    })
    .filter(Boolean);

  return NextResponse.json(results);
}
