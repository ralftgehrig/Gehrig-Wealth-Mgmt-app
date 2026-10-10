import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionEmail } from '@/lib/auth/account-restrictions';
import { canSeeDivorceSettlement } from '@/lib/auth/divorce-settlement';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const email = await getSessionEmail(supabase);
  if (!canSeeDivorceSettlement(email)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { data, error } = await supabase
    .from('divorce_settlement_debts')
    .update({ name: body.name, amount_gbp: body.amount_gbp, notes: body.notes ?? null })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const email = await getSessionEmail(supabase);
  if (!canSeeDivorceSettlement(email)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('divorce_settlement_debts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
