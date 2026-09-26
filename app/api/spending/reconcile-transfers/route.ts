import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { reconcileTransfers } from '@/lib/spending/import-engine';

export async function POST() {
  const supabase = createClient();
  try {
    const result = await reconcileTransfers(supabase);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to reconcile transfers' }, { status: 500 });
  }
}
