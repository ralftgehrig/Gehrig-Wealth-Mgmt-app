import { randomUUID } from 'crypto';
import { differenceInCalendarDays, addDays, parseISO, format } from 'date-fns';
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_DAY_GAP = 5;
const AMOUNT_TOLERANCE_RATIO = 0.02;
const MIN_AMOUNT_TOLERANCE = 0.5;

interface Candidate {
  id: string;
  spending_account_id: string;
  tx_date: string;
  amount_gbp: number;
}

/**
 * Finds pairs of opposite-sign transactions across *different* spending
 * accounts, within a few days and a close amount (allowing for FX spread),
 * and marks them as transfers rather than spending/income. Scoped to the
 * date range of the batch just imported (±MAX_DAY_GAP) to keep this cheap.
 */
export async function matchTransfers(
  supabase: SupabaseClient,
  fromDateISO: string,
  toDateISO: string
): Promise<number> {
  const windowStart = format(addDays(parseISO(fromDateISO), -MAX_DAY_GAP), 'yyyy-MM-dd');
  const windowEnd = format(addDays(parseISO(toDateISO), MAX_DAY_GAP), 'yyyy-MM-dd');

  const { data: candidates } = await supabase
    .from('transactions')
    .select('id, spending_account_id, tx_date, amount_gbp')
    .eq('is_transfer', false)
    .is('transfer_group_id', null)
    .gte('tx_date', windowStart)
    .lte('tx_date', windowEnd);

  const rows = (candidates ?? []) as Candidate[];
  if (rows.length < 2) return 0;

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
    await supabase.from('transactions').update({ is_transfer: true, transfer_group_id: u.transfer_group_id }).eq('id', u.id);
  }

  return updates.length;
}
