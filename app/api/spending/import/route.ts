import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseStatementFile } from '@/lib/spending/parsers';
import { getSelfNames, commitImport } from '@/lib/spending/import-engine';

export async function POST(req: Request) {
  const supabase = createClient();
  const form = await req.formData();
  const file = form.get('file');
  let spendingAccountId = form.get('spending_account_id') as string | null;

  const newAccountName = form.get('new_account_name') as string | null;
  const newAccountInstitution = form.get('new_account_institution') as string | null;
  const newAccountSubtype = form.get('new_account_subtype') as string | null;
  const newAccountCurrency = form.get('new_account_currency') as string | null;
  const newAccountFamilyMemberId = form.get('new_account_family_member_id') as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const selfNames = await getSelfNames(supabase);
    const parsed = parseStatementFile({ name: file.name, buffer }, selfNames);

    if (!spendingAccountId) {
      if (!newAccountName) {
        return NextResponse.json({ error: 'spending_account_id or new account details required' }, { status: 400 });
      }
      const { data: created, error } = await supabase
        .from('spending_accounts')
        .insert({
          name: newAccountName,
          institution: newAccountInstitution || parsed.suggested_institution || null,
          account_subtype: newAccountSubtype || parsed.suggested_subtype,
          currency: newAccountCurrency || parsed.suggested_currency,
          family_member_id: newAccountFamilyMemberId || null,
          external_ref: parsed.external_ref,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      spendingAccountId = created.id;
    }

    const { data: account } = await supabase
      .from('spending_accounts')
      .select('family_member_id')
      .eq('id', spendingAccountId as string)
      .single();

    const result = await commitImport(
      supabase,
      parsed,
      spendingAccountId as string,
      file.name,
      account?.family_member_id ?? null
    );
    return NextResponse.json({ spendingAccountId, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to import file' }, { status: 400 });
  }
}
