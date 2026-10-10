import type {
  Account,
  BalanceSnapshot,
  NetWorthSnapshot,
  AssetCategory,
  AccountType,
} from '../types';
import { ACCOUNT_CATEGORY } from '../types';

export function computeNetWorth(
  accounts: Account[],
  latestSnapshots: Record<string, BalanceSnapshot>
): NetWorthSnapshot {
  const date = new Date().toISOString().split('T')[0];
  const byMember: Record<string, number> = {};
  const byCategory: Record<AssetCategory, number> = {
    equity: 0,
    pension: 0,
    property: 0,
    cash: 0,
    crypto: 0,
    debt: 0,
  };
  const byType: Record<AccountType, number> = {} as Record<AccountType, number>;

  let assets = 0;
  let liabilities = 0;

  for (const account of accounts) {
    if (!account.is_active) continue;
    const snap = latestSnapshots[account.id];
    if (!snap) continue;

    const gbp = snap.gbp_balance;
    const signed = account.is_liability ? -gbp : gbp;

    // By member
    if (!byMember[account.family_member_id]) byMember[account.family_member_id] = 0;
    byMember[account.family_member_id] += signed;

    // By category
    const cat = ACCOUNT_CATEGORY[account.account_type] ?? 'cash';
    byCategory[cat] = (byCategory[cat] ?? 0) + signed;

    // By type
    byType[account.account_type] = (byType[account.account_type] ?? 0) + signed;

    if (account.is_liability) {
      liabilities += gbp;
    } else {
      assets += gbp;
    }
  }

  return {
    date,
    total_gbp: assets - liabilities,
    by_member: byMember,
    by_category: byCategory,
    by_type: byType,
    assets_gbp: assets,
    liabilities_gbp: liabilities,
  };
}

/** Build a time series of net worth from historical snapshots */
export function buildNetWorthTimeSeries(
  accounts: Account[],
  allSnapshots: BalanceSnapshot[]
): Array<{ date: string; total: number }> {
  // Group snapshots by date
  const byDate: Record<string, BalanceSnapshot[]> = {};
  for (const snap of allSnapshots) {
    if (!byDate[snap.snapshot_date]) byDate[snap.snapshot_date] = [];
    byDate[snap.snapshot_date].push(snap);
  }

  // For each date, use latest snapshot per account up to that date
  const dates = Object.keys(byDate).sort();
  const result: Array<{ date: string; total: number }> = [];

  // Running state: latest snapshot per account
  const latest: Record<string, BalanceSnapshot> = {};

  for (const date of dates) {
    // Update latest for any accounts snapshotted on this date
    for (const snap of byDate[date]) {
      const prev = latest[snap.account_id];
      if (!prev || snap.snapshot_date > prev.snapshot_date) {
        latest[snap.account_id] = snap;
      }
    }

    // Sum up all accounts we have snapshots for
    let total = 0;
    for (const [accountId, snap] of Object.entries(latest)) {
      const account = accounts.find((a) => a.id === accountId);
      if (!account || !account.is_active) continue;
      total += account.is_liability ? -snap.gbp_balance : snap.gbp_balance;
    }

    result.push({ date, total });
  }

  return result;
}

export interface NetWorthHistoryPoint {
  date: string;
  total: number;
}

export interface PeriodGrowth {
  change: number | null;
  changePct: number | null;
}

/**
 * The net worth total as of a cutoff date (history is balance-snapshot-driven and sparse/
 * irregular, so an exact reading for that day rarely exists). When the cutoff falls between two
 * known snapshots, linearly interpolate between them to estimate the likely figure on that date.
 * When the cutoff is after the last known snapshot, use that latest known value (nothing later to
 * interpolate with). When there's no snapshot on or before the cutoff, there's nothing to go on.
 */
function valueAsOf(history: NetWorthHistoryPoint[], cutoffDate: string): number | null {
  let before: NetWorthHistoryPoint | null = null;
  for (const point of history) {
    if (point.date <= cutoffDate) {
      before = point;
      continue;
    }
    if (!before) return null;
    const beforeTime = new Date(before.date).getTime();
    const afterTime = new Date(point.date).getTime();
    const cutoffTime = new Date(cutoffDate).getTime();
    const frac = (cutoffTime - beforeTime) / (afterTime - beforeTime);
    return before.total + (point.total - before.total) * frac;
  }
  return before ? before.total : null;
}

function growthBetween(history: NetWorthHistoryPoint[], startCutoff: string, endCutoff: string): PeriodGrowth {
  const startValue = valueAsOf(history, startCutoff);
  const endValue = valueAsOf(history, endCutoff);
  if (startValue === null || endValue === null) return { change: null, changePct: null };
  const change = endValue - startValue;
  const changePct = startValue ? change / startValue : null;
  return { change, changePct };
}

/**
 * Growth for each of the last `years` complete calendar years (e.g. 2023/2024/2025 when run in
 * 2026), the cumulative growth across that whole span, and year-to-date growth for the current,
 * still-in-progress year — each measured against the nearest known balance at the relevant
 * year-end cutoff.
 */
export function buildNetWorthGrowth(history: NetWorthHistoryPoint[], years = 3, today: Date = new Date()) {
  const currentYear = today.getFullYear();
  const lastCompleteYear = currentYear - 1;
  const firstYear = lastCompleteYear - years + 1;

  const byYear = Array.from({ length: years }, (_, i) => {
    const year = firstYear + i;
    return { year, ...growthBetween(history, `${year - 1}-12-31`, `${year}-12-31`) };
  });

  const cumulative = {
    fromYear: firstYear,
    toYear: lastCompleteYear,
    ...growthBetween(history, `${firstYear - 1}-12-31`, `${lastCompleteYear}-12-31`),
  };

  const ytd = {
    year: currentYear,
    ...growthBetween(history, `${currentYear - 1}-12-31`, today.toISOString().slice(0, 10)),
  };

  return { byYear, cumulative, ytd };
}
