import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionEmail, visibleAccounts } from '@/lib/auth/account-restrictions';

export async function GET() {
  const supabase = createClient();

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select(`
      *,
      family_member:family_members(*)
    `)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const email = await getSessionEmail(supabase);
  const visible = visibleAccounts(accounts ?? [], email);

  // Attach latest snapshot to each account
  const { data: latestSnaps } = await supabase
    .from('latest_snapshots')
    .select('*');

  const snapByAccount: Record<string, unknown> = {};
  for (const snap of latestSnaps ?? []) {
    snapByAccount[(snap as { account_id: string }).account_id] = snap;
  }

  const enriched = visible.map((a) => ({
    ...a,
    latest_snapshot: snapByAccount[a.id] ?? null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('accounts')
    .insert(body)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
