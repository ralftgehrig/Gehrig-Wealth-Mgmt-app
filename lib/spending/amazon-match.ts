import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAmazon } from './parsers/amazon';
import { guessCategorySlug } from './categorize';
import { resolveRatesForRows } from './fx';
import { fetchAllPages } from './db-utils';
import type { NormalizedRow } from './types';

/**
 * Candidate transactions must already look Amazon-ish (by merchant/description) to be
 * considered — amount+date proximity alone isn't enough to safely retitle a transaction.
 */
const AMAZON_MERCHANT_PATTERN = /\b(AMAZON|AMZN|AUDIBLE|KINDLE|PRIME\s*VIDEO)\b/i;

/** Bank settlement typically lands within a few days of the Amazon order date, never before it. */
const MATCH_WINDOW_DAYS = 4;

interface CandidateTransaction {
  id: string;
  tx_date: string;
  description: string;
  merchant: string | null;
  amount_gbp: number;
}

export interface AmazonMatch {
  transactionId: string;
  txDate: string;
  oldTitle: string;
  newTitle: string;
  categorySlug: string;
  amountGbp: number;
}

export interface AmazonMatchPlan {
  matches: AmazonMatch[];
  totalOrders: number;
  matchedOrders: number;
  unmatchedOrders: number;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The product/subscription name if the parser found one, otherwise a fallback that still reads sensibly after the "Amazon: " prefix. */
function labelFor(row: NormalizedRow): string {
  if (row.merchant && row.merchant !== 'Amazon') return row.merchant;
  const orderId = (row.raw as { order_id?: string } | undefined)?.order_id;
  return orderId ? `Order ${orderId}` : 'Purchase';
}

async function loadCategorySlugMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await supabase.from('transaction_categories').select('id, slug');
  const map = new Map<string, string>();
  for (const row of data ?? []) map.set(row.slug, row.id);
  return map;
}

/**
 * Matches a parsed Amazon order-history CSV against already-imported transactions by
 * (amount, date-proximity), so they can be retitled with the actual product name and
 * recategorised — this never creates a new account or new transaction rows, it only
 * proposes updates to rows that already exist from a bank/card statement import.
 *
 * Each Amazon order is consumed by at most one transaction and vice versa (a greedy
 * nearest-date match within same-amount buckets), so two orders of the same amount in
 * the same window can't both land on one transaction.
 */
export async function planAmazonMatch(supabase: SupabaseClient, csvText: string): Promise<AmazonMatchPlan> {
  const parsed = parseAmazon(csvText, 'amazon-orders.csv');
  const spendRows = parsed.rows.filter((r) => r.amount < 0);
  if (spendRows.length === 0) {
    return { matches: [], totalOrders: 0, matchedOrders: 0, unmatchedOrders: 0 };
  }

  const rateMap = await resolveRatesForRows(supabase, spendRows);
  const orders = spendRows
    .map((row) => {
      const rate = row.currency === 'GBP' ? 1 : rateMap.get(`${row.currency}|${row.tx_date}`) ?? 1;
      return { row, amountGbp: Math.round(row.amount * rate * 100) / 100 };
    })
    .sort((a, b) => a.row.tx_date.localeCompare(b.row.tx_date));

  const from = orders[0].row.tx_date;
  const to = addDays(orders[orders.length - 1].row.tx_date, MATCH_WINDOW_DAYS);

  const candidates = await fetchAllPages<CandidateTransaction>((rangeFrom, rangeTo) =>
    supabase
      .from('transactions')
      .select('id, tx_date, description, merchant, amount_gbp')
      .is('custom_title', null)
      .lt('amount_gbp', 0)
      .gte('tx_date', from)
      .lte('tx_date', to)
      .range(rangeFrom, rangeTo)
  );

  // Bucket by exact GBP amount (as a 2dp string), candidates within each bucket sorted by date.
  const pool = new Map<string, CandidateTransaction[]>();
  for (const c of candidates) {
    const haystack = `${c.merchant ?? ''} ${c.description}`;
    if (!AMAZON_MERCHANT_PATTERN.test(haystack)) continue;
    const key = c.amount_gbp.toFixed(2);
    const arr = pool.get(key) ?? [];
    arr.push(c);
    pool.set(key, arr);
  }
  for (const arr of pool.values()) arr.sort((a, b) => a.tx_date.localeCompare(b.tx_date));

  const merchantRules = new Map<string, string>(); // keyword rules in categorize.ts already cover Amazon's own products

  const matches: AmazonMatch[] = [];
  for (const order of orders) {
    const key = order.amountGbp.toFixed(2); // both sides are negative (spend), so they're directly comparable
    const arr = pool.get(key);
    if (!arr || arr.length === 0) continue;

    const windowEnd = addDays(order.row.tx_date, MATCH_WINDOW_DAYS);
    const idx = arr.findIndex((c) => c.tx_date >= order.row.tx_date && c.tx_date <= windowEnd);
    if (idx === -1) continue;

    const candidate = arr.splice(idx, 1)[0];
    const label = labelFor(order.row);
    const newTitle = `Amazon: ${label}`;
    const categorySlug = guessCategorySlug({
      merchant: label,
      description: label,
      sourceCategoryHint: null,
      isInflow: false,
      merchantRules,
    }).slug;

    matches.push({
      transactionId: candidate.id,
      txDate: candidate.tx_date,
      oldTitle: candidate.merchant || candidate.description,
      newTitle,
      categorySlug,
      amountGbp: candidate.amount_gbp,
    });
  }

  return {
    matches,
    totalOrders: orders.length,
    matchedOrders: matches.length,
    unmatchedOrders: orders.length - matches.length,
  };
}

/** Applies a previously computed match plan: sets custom_title and category on each matched transaction. Never touches merchant/description or writes merchant_category_rules — each match is specific to one purchase, not a rule to generalise from. */
export async function applyAmazonMatch(supabase: SupabaseClient, matches: AmazonMatch[]): Promise<number> {
  if (matches.length === 0) return 0;
  const slugToId = await loadCategorySlugMap(supabase);

  let applied = 0;
  for (const m of matches) {
    const categoryId = slugToId.get(m.categorySlug);
    const { error } = await supabase
      .from('transactions')
      .update({
        custom_title: m.newTitle,
        ...(categoryId ? { category_id: categoryId, category_confidence: 'manual' } : {}),
      })
      .eq('id', m.transactionId)
      .is('custom_title', null); // don't clobber a title set since the preview was generated
    if (!error) applied++;
  }
  return applied;
}
