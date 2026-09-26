import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const accountIds = searchParams.get('accountIds')?.split(',').filter(Boolean);
  const categoryIds = searchParams.get('categoryIds')?.split(',').filter(Boolean);
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');

  let query = supabase
    .from('transactions')
    .select('*, spending_account:spending_accounts(*), category:transaction_categories(*)')
    .order('tx_date', { ascending: false })
    .limit(5000);

  if (from) query = query.gte('tx_date', from);
  if (to) query = query.lte('tx_date', to);
  if (accountIds?.length) query = query.in('spending_account_id', accountIds);
  if (categoryIds?.length) query = query.in('category_id', categoryIds);
  if (tag) query = query.eq('tag', tag);
  if (search) query = query.or(`description.ilike.%${search}%,merchant.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
