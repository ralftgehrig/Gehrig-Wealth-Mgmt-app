import { groupBy, sumBy } from '@/lib/utils';
import { CATEGORY_PALETTE } from './category-colors';
import type { Transaction, TransactionCategory } from './types';

export interface SankeyNodeDatum {
  name: string;
  color: string;
}

export interface SankeyLinkDatum {
  source: number;
  target: number;
  value: number;
}

export interface SankeyChartData {
  nodes: SankeyNodeDatum[];
  links: SankeyLinkDatum[];
}

export const SANKEY_ROLE_COLORS = {
  income: '#16a34a',
  total: '#0ea5e9',
  spending: '#475569',
  savings: '#22c55e',
  shortfall: '#dc2626',
};

/**
 * Builds an income -> total -> spending/savings -> category -> subcategory flow diagram from
 * already-filtered (period, non-transfer, non-tagged) transactions.
 *
 * Recharts' Sankey forces any node with no outgoing link to the very last column, regardless of
 * its natural distance from the sources (mirroring d3-sankey's "justify" alignment). So every
 * node that isn't meant to be a final leaf — "Savings", and any category with no real
 * subcategory breakdown — gets a synthetic single downstream leaf, or it would get pulled out of
 * its tier and visually mixed in with genuine leaf-level subcategories.
 */
export function buildIncomeExpenseSankey(
  income: Transaction[],
  spending: Transaction[],
  categories: TransactionCategory[]
): SankeyChartData | null {
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const topLevelOf = (categoryId: string | null): TransactionCategory | null => {
    const cat = categoryId ? categoryById[categoryId] : null;
    if (!cat) return null;
    return cat.parent_id ? categoryById[cat.parent_id] ?? cat : cat;
  };

  const totalIncome = sumBy(income, (t) => t.amount_gbp);
  const totalSpend = -sumBy(spending, (t) => t.amount_gbp);
  if (totalIncome <= 0.005 && totalSpend <= 0.005) return null;

  const nodes: SankeyNodeDatum[] = [];
  const links: SankeyLinkDatum[] = [];
  const indexOf = new Map<string, number>();

  const nodeIndex = (key: string, name: string, color: string): number => {
    let idx = indexOf.get(key);
    if (idx === undefined) {
      idx = nodes.length;
      nodes.push({ name, color });
      indexOf.set(key, idx);
    }
    return idx;
  };
  const addLink = (source: number, target: number, value: number) => {
    const v = Math.round(value * 100) / 100;
    if (v > 0.005) links.push({ source, target, value: v });
  };

  const totalIdx = nodeIndex('total', 'Total', SANKEY_ROLE_COLORS.total);

  const incomeGroups = groupBy(income, (t) => t.category_id ?? 'uncategorised');
  for (const [catId, txs] of Object.entries(incomeGroups)) {
    const amount = sumBy(txs, (t) => t.amount_gbp);
    if (amount <= 0.005) continue;
    const name = catId === 'uncategorised' ? 'Other income' : categoryById[catId]?.name ?? 'Other income';
    const idx = nodeIndex(`income:${catId}`, name, SANKEY_ROLE_COLORS.income);
    addLink(idx, totalIdx, amount);
  }

  const shortfall = Math.max(0, totalSpend - totalIncome);
  if (shortfall > 0.005) {
    const idx = nodeIndex('shortfall', 'Shortfall', SANKEY_ROLE_COLORS.shortfall);
    addLink(idx, totalIdx, shortfall);
  }

  let spendingIdx: number | null = null;
  const getSpendingIdx = () => {
    if (spendingIdx === null) spendingIdx = nodeIndex('spending', 'Spending', SANKEY_ROLE_COLORS.spending);
    return spendingIdx;
  };
  if (totalSpend > 0.005) addLink(totalIdx, getSpendingIdx(), totalSpend);

  const savings = Math.max(0, totalIncome - totalSpend);
  if (savings > 0.005) {
    const idx = nodeIndex('savings', 'Savings', SANKEY_ROLE_COLORS.savings);
    addLink(totalIdx, idx, savings);
    const leafIdx = nodeIndex('savings-leaf', 'Savings', SANKEY_ROLE_COLORS.savings);
    addLink(idx, leafIdx, savings);
  }

  const byTop = groupBy(spending, (t) => topLevelOf(t.category_id)?.id ?? 'uncategorised');
  for (const [topId, txs] of Object.entries(byTop)) {
    const total = -sumBy(txs, (t) => t.amount_gbp);
    if (total <= 0.005) continue;
    const topCat = categoryById[topId];
    const topName = topCat?.name ?? 'Uncategorised';
    const topColor = CATEGORY_PALETTE[topCat?.slug ?? 'general'] ?? CATEGORY_PALETTE.general;
    const topIdx = nodeIndex(`cat:${topId}`, topName, topColor);
    addLink(getSpendingIdx(), topIdx, total);

    // Same reasoning as Savings above: every category needs at least one outgoing leaf link,
    // even when it was never broken down into subcategories.
    const byLeaf = groupBy(txs, (t) => (t.category_id && t.category_id !== topId ? t.category_id : 'other'));
    const leafEntries = Object.entries(byLeaf);
    const singleBucket = leafEntries.length === 1;

    for (const [leafId, leafTxs] of leafEntries) {
      const leafTotal = -sumBy(leafTxs, (t) => t.amount_gbp);
      if (leafTotal <= 0.005) continue;
      const leafName = leafId === 'other' ? (singleBucket ? topName : 'Other') : categoryById[leafId]?.name ?? 'Other';
      const leafIdx = nodeIndex(`leaf:${topId}:${leafId}`, leafName, topColor);
      addLink(topIdx, leafIdx, leafTotal);
    }
  }

  return { nodes, links };
}
