import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { merchantRuleKey } from '@/lib/spending/categorize';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const body = await req.json();

  const updates: Record<string, unknown> = { ...body };
  if (body.category_id) updates.category_confidence = 'manual';

  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Learn from manual category corrections so future imports of this merchant categorise automatically.
  if (body.category_id && data?.merchant) {
    const matchText = merchantRuleKey(data.merchant, data.amount_gbp >= 0);
    await supabase
      .from('merchant_category_rules')
      .upsert({ match_text: matchText, category_id: body.category_id }, { onConflict: 'match_text' });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
