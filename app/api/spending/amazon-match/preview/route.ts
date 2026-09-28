import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { planAmazonMatch } from '@/lib/spending/amazon-match';

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
    return NextResponse.json({
      totalOrders: plan.totalOrders,
      matchedOrders: plan.matchedOrders,
      unmatchedOrders: plan.unmatchedOrders,
      sample: plan.matches.slice(0, 30),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to parse file' }, { status: 400 });
  }
}
