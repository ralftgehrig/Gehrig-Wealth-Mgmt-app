import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessionEmail, isAccountRestricted } from '@/lib/auth/account-restrictions';
import { canSeeDivorceSettlement } from '@/lib/auth/divorce-settlement';

async function assertVisible(supabase: ReturnType<typeof createClient>, id: string) {
  const email = await getSessionEmail(supabase);
  const { data: account } = await supabase.from('accounts').select('id, restricted_emails').eq('id', id).single();
  // Treat a restricted account as not found, same as a genuinely missing id — the client has no
  // business learning it exists at all.
  return !account || isAccountRestricted(account, email);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (await assertVisible(supabase, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  delete body.restricted_emails; // not settable through the regular account-edit form
  if (!canSeeDivorceSettlement(await getSessionEmail(supabase))) delete body.is_joint;

  const { data, error } = await supabase
    .from('accounts')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  if (await assertVisible(supabase, params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase.from('accounts').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
