import type { SupabaseClient } from '@supabase/supabase-js';
import { contentHash } from './normalize';
import { guessCategorySlug } from './categorize';
import { resolveRatesForRows } from './fx';
import { matchTransfers } from './transfers';
import type { NormalizedRow, ParsedStatement, SpendingAccountSubtype } from './types';
import type { Currency } from '@/lib/types';

interface ResolvedRow {
  spending_account_id: string;
  family_member_id: string | null;
  tx_date: string;
  description: string;
  merchant: string;
  amount: number;
  currency: Currency;
  amount_gbp: number;
  category_id: string;
  category_confidence: 'auto';
  is_transfer: boolean;
  content_hash: string;
  raw_source: Record<string, unknown>;
}

interface CategoryMaps {
  slugToId: Map<string, string>;
  generalId: string;
  incomeOtherId: string;
  transfersId: string;
}

async function loadCategoryMaps(supabase: SupabaseClient): Promise<CategoryMaps> {
  const { data } = await supabase.from('transaction_categories').select('id, slug');
  const slugToId = new Map<string, string>();
  for (const row of data ?? []) slugToId.set(row.slug, row.id);
  return {
    slugToId,
    generalId: slugToId.get('general')!,
    incomeOtherId: slugToId.get('income.other')!,
    transfersId: slugToId.get('transfers')!,
  };
}

async function loadMerchantRules(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('merchant_category_rules')
    .select('match_text, category:transaction_categories(slug)');
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ match_text: string; category: { slug: string } | { slug: string }[] | null }>) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    if (cat?.slug) map.set(row.match_text, cat.slug);
  }
  return map;
}

async function loadFamilyMembers(supabase: SupabaseClient) {
  const { data } = await supabase.from('family_members').select('id, name');
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function getSelfNames(supabase: SupabaseClient): Promise<string[]> {
  const members = await loadFamilyMembers(supabase);
  return members.map((m) => m.name);
}

function resolveCategoryId(slug: string, maps: CategoryMaps, isInflow: boolean): string {
  return maps.slugToId.get(slug) ?? (isInflow ? maps.incomeOtherId : maps.generalId);
}

function matchCardholder(name: string | null, members: Array<{ id: string; name: string }>): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const found = members.find(
    (m) => lower.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(lower.split(' ')[0])
  );
  return found?.id ?? null;
}

/** Resolves every parsed row into its final DB-ready shape (category, FX, family member) — but not yet deduped/assigned an occurrence index. */
export async function resolveRows(
  supabase: SupabaseClient,
  parsed: ParsedStatement,
  spendingAccountId: string,
  fallbackFamilyMemberId: string | null
): Promise<ResolvedRow[]> {
  const [maps, merchantRules, familyMembers, rateMap] = await Promise.all([
    loadCategoryMaps(supabase),
    loadMerchantRules(supabase),
    loadFamilyMembers(supabase),
    resolveRatesForRows(supabase, parsed.rows),
  ]);

  return parsed.rows.map((row: NormalizedRow) => {
    const isInflow = row.amount > 0;
    let categorySlug: string;
    if (row.is_transfer_hint) {
      categorySlug = 'transfers';
    } else {
      categorySlug = guessCategorySlug({
        merchant: row.merchant,
        description: row.description,
        sourceCategoryHint: row.source_category_hint,
        isInflow,
        merchantRules,
      }).slug;
    }

    const rate = row.currency === 'GBP' ? 1 : rateMap.get(`${row.currency}|${row.tx_date}`) ?? 1;

    return {
      spending_account_id: spendingAccountId,
      family_member_id: matchCardholder(row.cardholder_name, familyMembers) ?? fallbackFamilyMemberId,
      tx_date: row.tx_date,
      description: row.description,
      merchant: row.merchant,
      amount: row.amount,
      currency: row.currency,
      amount_gbp: Math.round(row.amount * rate * 100) / 100,
      category_id: resolveCategoryId(categorySlug, maps, isInflow),
      category_confidence: 'auto',
      is_transfer: row.is_transfer_hint,
      content_hash: contentHash(spendingAccountId, row.tx_date, row.amount, row.description),
      raw_source: row.raw,
    };
  });
}

export interface DedupPlan<T> {
  toInsert: Array<T & { occurrence_index: number }>;
  duplicateCount: number;
}

/** Groups resolved rows by content hash and figures out, against what's already stored, which are genuinely new. */
export async function planDedup<T extends { content_hash: string }>(
  supabase: SupabaseClient,
  spendingAccountId: string,
  rows: T[]
): Promise<DedupPlan<T>> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const arr = groups.get(row.content_hash) ?? [];
    arr.push(row);
    groups.set(row.content_hash, arr);
  }

  const uniqueHashes = [...groups.keys()];
  const existingCounts = new Map<string, number>();
  if (uniqueHashes.length > 0) {
    const { data: existing } = await supabase
      .from('transactions')
      .select('content_hash')
      .eq('spending_account_id', spendingAccountId)
      .in('content_hash', uniqueHashes);
    for (const r of (existing ?? []) as Array<{ content_hash: string }>) {
      existingCounts.set(r.content_hash, (existingCounts.get(r.content_hash) ?? 0) + 1);
    }
  }

  const toInsert: Array<T & { occurrence_index: number }> = [];
  let duplicateCount = 0;

  for (const [hash, group] of groups) {
    const existingCount = existingCounts.get(hash) ?? 0;
    const newOnes = group.slice(existingCount);
    duplicateCount += group.length - newOnes.length;
    newOnes.forEach((row, idx) => {
      toInsert.push({ ...row, occurrence_index: existingCount + idx + 1 });
    });
  }

  return { toInsert, duplicateCount };
}

export interface CommitResult {
  batchId: string;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  transferRows: number;
}

export async function commitImport(
  supabase: SupabaseClient,
  parsed: ParsedStatement,
  spendingAccountId: string,
  fileName: string,
  fallbackFamilyMemberId: string | null
): Promise<CommitResult> {
  const resolved = await resolveRows(supabase, parsed, spendingAccountId, fallbackFamilyMemberId);
  const { toInsert, duplicateCount } = await planDedup(supabase, spendingAccountId, resolved);

  const { data: batch, error: batchError } = await supabase
    .from('import_batches')
    .insert({
      spending_account_id: spendingAccountId,
      file_name: fileName,
      format_detected: parsed.format,
      total_rows: resolved.length,
      new_rows: toInsert.length,
      duplicate_rows: duplicateCount,
      transfer_rows: toInsert.filter((r) => r.is_transfer).length,
    })
    .select()
    .single();
  if (batchError) throw new Error(batchError.message);

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('transactions')
      .insert(toInsert.map((r) => ({ ...r, import_batch_id: batch.id })));
    if (insertError) throw new Error(insertError.message);
  }

  let transferRows = toInsert.filter((r) => r.is_transfer).length;
  if (toInsert.length > 0) {
    const dates = toInsert.map((r) => r.tx_date).sort();
    const matched = await matchTransfers(supabase, dates[0], dates[dates.length - 1]);
    transferRows += matched;
    if (matched > 0) {
      await supabase.from('import_batches').update({ transfer_rows: transferRows }).eq('id', batch.id);
    }
  }

  return {
    batchId: batch.id,
    totalRows: resolved.length,
    newRows: toInsert.length,
    duplicateRows: duplicateCount,
    transferRows,
  };
}

export interface PreviewResult {
  format: string;
  suggestedAccountName: string;
  suggestedInstitution: string;
  suggestedCurrency: Currency;
  suggestedSubtype: SpendingAccountSubtype;
  externalRef: string | null;
  totalRows: number;
  estimatedNewRows: number;
  estimatedDuplicateRows: number;
  sample: Array<{ tx_date: string; description: string; amount: number; currency: Currency; categorySlug: string }>;
}

export async function buildPreview(
  supabase: SupabaseClient,
  parsed: ParsedStatement,
  spendingAccountId: string | null
): Promise<PreviewResult> {
  let estimatedNewRows = parsed.rows.length;
  let estimatedDuplicateRows = 0;

  const maps = await loadCategoryMaps(supabase);
  const merchantRules = await loadMerchantRules(supabase);

  if (spendingAccountId) {
    const tempRows = parsed.rows.map((row) => ({
      content_hash: contentHash(spendingAccountId, row.tx_date, row.amount, row.description),
    }));
    const plan = await planDedup(supabase, spendingAccountId, tempRows);
    estimatedNewRows = plan.toInsert.length;
    estimatedDuplicateRows = plan.duplicateCount;
  }

  const sample = parsed.rows.slice(0, 15).map((row) => {
    const isInflow = row.amount > 0;
    const slug = row.is_transfer_hint
      ? 'transfers'
      : guessCategorySlug({
          merchant: row.merchant,
          description: row.description,
          sourceCategoryHint: row.source_category_hint,
          isInflow,
          merchantRules,
        }).slug;
    return {
      tx_date: row.tx_date,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      categorySlug: maps.slugToId.has(slug) ? slug : isInflow ? 'income.other' : 'general',
    };
  });

  return {
    format: parsed.format,
    suggestedAccountName: parsed.suggested_account_name,
    suggestedInstitution: parsed.suggested_institution,
    suggestedCurrency: parsed.suggested_currency,
    suggestedSubtype: parsed.suggested_subtype,
    externalRef: parsed.external_ref,
    totalRows: parsed.rows.length,
    estimatedNewRows,
    estimatedDuplicateRows,
    sample,
  };
}
