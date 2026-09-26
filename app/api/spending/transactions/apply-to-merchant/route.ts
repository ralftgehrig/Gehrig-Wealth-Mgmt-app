import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { merchantRuleKey } from '@/lib/spending/categorize';
import { normalizeMerchant } from '@/lib/spending/normalize';
import { fetchAllPages } from '@/lib/spending/db-utils';

export async function POST(req: Request) {
  const supabase = createClient();
  const { transactionId } = await req.json();

  const { data: source, error: sourceError } = await supabase
    .from('transactions')
    .select('id, merchant, amount_gbp, category_id')
    .eq('id', transactionId)
    .single();
  if (sourceError || !source) {
    return NextResponse.json({ error: sourceError?.message ?? 'Transaction not found' }, { status: 404 });
  }
  if (!source.category_id) {
    return NextResponse.json({ error: 'Transaction has no category to apply' }, { status: 400 });
  }
  if (!normalizeMerchant(source.merchant)) {
    return NextResponse.json({ error: 'This transaction has no merchant name to match on' }, { status: 400 });
  }

  const isInflow = source.amount_gbp >= 0;
  const key = merchantRuleKey(source.merchant, isInflow);

  const all = await fetchAllPages<{ id: string; merchant: string | null; amount_gbp: number }>((from, to) =>
    supabase.from('transactions').select('id, merchant, amount_gbp').not('merchant', 'is', null).range(from, to)
  );

  const matchingIds = all
    .filter((t) => t.id !== source.id && merchantRuleKey(t.merchant ?? '', t.amount_gbp >= 0) === key)
    .map((t) => t.id);

  if (matchingIds.length > 0) {
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ category_id: source.category_id, category_confidence: 'manual' })
      .in('id', matchingIds);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase
    .from('merchant_category_rules')
    .upsert({ match_text: key, category_id: source.category_id }, { onConflict: 'match_text' });

  return NextResponse.json({ merchant: source.merchant, updatedCount: matchingIds.length });
}
