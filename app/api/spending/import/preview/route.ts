import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseStatementFile } from '@/lib/spending/parsers';
import { buildPreview } from '@/lib/spending/import-engine';

export async function POST(req: Request) {
  const supabase = createClient();
  const form = await req.formData();
  const file = form.get('file');
  const spendingAccountId = form.get('spending_account_id');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseStatementFile({ name: file.name, buffer });
    const preview = await buildPreview(
      supabase,
      parsed,
      typeof spendingAccountId === 'string' && spendingAccountId ? spendingAccountId : null
    );
    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to parse file' }, { status: 400 });
  }
}
