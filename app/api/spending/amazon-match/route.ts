import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { planAmazonMatch, applyAmazonMatch } from '@/lib/spending/amazon-match';

export async function POST(req: Request) {
  const supabase = createClient();
  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const text = await file.text();
    const plan = await planAmazonMatch(supabase, text);
    const appliedCount = await applyAmazonMatch(supabase, plan.matches);
    return NextResponse.json({
      totalOrders: plan.totalOrders,
      matchedOrders: plan.matchedOrders,
      unmatchedOrders: plan.unmatchedOrders,
      appliedCount,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to match Amazon orders' }, { status: 400 });
  }
}
