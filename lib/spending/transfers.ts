import { randomUUID } from 'crypto';
import { differenceInCalendarDays, addDays, parseISO, format } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from './db-utils';

const MAX_DAY_GAP = 10;
const AMOUNT_TOLERANCE_RATIO = 0.02;
const MIN_AMOUNT_TOLERANCE = 0.5;

interface Candidate {
  id: string;
  spending_account_id: string;
  tx_date: string;
  amount_gbp: number;
}

export interface MatchTransfersResult {
  matchedCount: number;
  /** How many candidate (untagged) transactions were considered, and across how many accounts — lets the caller tell "no data to match against" from "a real gap". */
  candidateCount: number;
  accountsInvolved: number;
}

/**
 * Finds pairs of opposite-sign transactions across *different* spending
 * accounts, within a short window and a close amount (allowing for FX
 * spread), and marks them as transfers rather than spending/income — e.g. a
 * credit card payment matched against the debit in the current account it
 * was paid from, or a savings top-up matched against the debit that funded
 * it. This is the *only* mechanism that excludes a row from analysis:
 * nothing at parse time guesses at transfers, since that can't confirm the
 * other side is actually one of the user's own imported accounts.
 *
 * Scoped to the date range of the batch just imported (±MAX_DAY_GAP) to keep
 * this cheap; run after every import so newly uploaded rows are checked
 * against everything already stored in that window, in either direction.
 */
export async function matchTransfers(
  supabase: SupabaseClient,
  fromDateISO: string,
  toDateISO: string
): Promise<MatchTransfersResult> {
  const { data: transfersCategory } = await supabase
    .from('transaction_categories')
    .select('id')
    .eq('slug', 'transfers')
    .single();
  const transfersCategoryId = transfersCategory?.id as string | undefined;

  const windowStart = format(addDays(parseISO(fromDateISO), -MAX_DAY_GAP), 'yyyy-MM-dd');
  const windowEnd = format(addDays(parseISO(toDateISO), MAX_DAY_GAP), 'yyyy-MM-dd');

  const rows = await fetchAllPages<Candidate>((from, to) =>
    supabase
      .from('transactions')
      .select('id, spending_account_id, tx_date, amount_gbp')
      .eq('is_transfer', false)
      .is('transfer_group_id', null)
      .gte('tx_date', windowStart)
      .lte('tx_date', windowEnd)
      .range(from, to)
  );

  const candidateCount = rows.length;
  const accountsInvolved = new Set(rows.map((r) => r.spending_account_id)).size;
  if (rows.length < 2) return { matchedCount: 0, candidateCount, accountsInvolved };

  const used = new Set<string>();
  const updates: Array<{ id: string; transfer_group_id: string }> = [];

  for (const a of rows) {
    if (used.has(a.id) || a.amount_gbp === 0) continue;
    let best: Candidate | null = null;
    let bestScore = Infinity;

    for (const b of rows) {
      if (a.id === b.id || used.has(b.id)) continue;
      if (b.spending_account_id === a.spending_account_id) continue;
      if (Math.sign(b.amount_gbp) === Math.sign(a.amount_gbp)) continue;

      const amountDiff = Math.abs(Math.abs(a.amount_gbp) - Math.abs(b.amount_gbp));
      const tolerance = Math.max(MIN_AMOUNT_TOLERANCE, Math.abs(a.amount_gbp) * AMOUNT_TOLERANCE_RATIO);
      if (amountDiff > tolerance) continue;

      const dayDiff = Math.abs(differenceInCalendarDays(parseISO(b.tx_date), parseISO(a.tx_date)));
      if (dayDiff > MAX_DAY_GAP) continue;

      const score = amountDiff + dayDiff * 0.01;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }

    if (best) {
      const groupId = randomUUID();
      used.add(a.id);
      used.add(best.id);
      updates.push({ id: a.id, transfer_group_id: groupId }, { id: best.id, transfer_group_id: groupId });
    }
  }

  for (const u of updates) {
    await supabase
      .from('transactions')
      .update({
        is_transfer: true,
        transfer_group_id: u.transfer_group_id,
        ...(transfersCategoryId ? { category_id: transfersCategoryId, category_confidence: 'auto' } : {}),
      })
      .eq('id', u.id);
  }

  return { matchedCount: updates.length, candidateCount, accountsInvolved };
}
