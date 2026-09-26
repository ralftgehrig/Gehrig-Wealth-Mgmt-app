import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAllPages } from '@/lib/spending/db-utils';
import type { Transaction } from '@/lib/spending/types';

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const accountIds = searchParams.get('accountIds')?.split(',').filter(Boolean);
  const categoryIds = searchParams.get('categoryIds')?.split(',').filter(Boolean);
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');

  const buildQuery = () => {
    // Ordering by tx_date alone isn't a stable sort across pages when many rows
    // share a date, so tie-break on id — otherwise paging can skip or repeat rows.
    let query = supabase
      .from('transactions')
      .select('*, spending_account:spending_accounts(*), category:transaction_categories(*)')
      .order('tx_date', { ascending: false })
      .order('id', { ascending: true });

    if (from) query = query.gte('tx_date', from);
    if (to) query = query.lte('tx_date', to);
    if (accountIds?.length) query = query.in('spending_account_id', accountIds);
    if (categoryIds?.length) query = query.in('category_id', categoryIds);
    if (tag) query = query.eq('tag', tag);
    if (search) query = query.or(`description.ilike.%${search}%,merchant.ilike.%${search}%`);

    return query;
  };

  try {
    // Supabase/PostgREST caps a single request at its configured max row count
    // (1000 by default) regardless of a higher `.limit()`, so this pages
    // through the full result set rather than risk silently truncating it.
    const data = await fetchAllPages<Transaction>((rangeFrom, rangeTo) => buildQuery().range(rangeFrom, rangeTo));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load transactions' }, { status: 500 });
  }
}
