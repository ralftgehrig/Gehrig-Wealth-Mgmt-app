import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionEmail } from '@/lib/auth/account-restrictions';
import { canSeeDivorceSettlement } from '@/lib/auth/divorce-settlement';

export async function GET() {
  const supabase = createClient();
  const email = await getSessionEmail(supabase);
  if (!canSeeDivorceSettlement(email)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('divorce_settlement_debts')
    .select('*')
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const email = await getSessionEmail(supabase);
  if (!canSeeDivorceSettlement(email)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { data, error } = await supabase
    .from('divorce_settlement_debts')
    .insert({ name: body.name, amount_gbp: body.amount_gbp, notes: body.notes ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
