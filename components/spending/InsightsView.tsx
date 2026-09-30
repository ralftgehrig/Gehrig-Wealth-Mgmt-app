'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingDown, TrendingUp, Plane, Lightbulb } from 'lucide-react';
import { formatDate, groupBy, sumBy } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import { CATEGORY_PALETTE as PALETTE } from '@/lib/spending/category-colors';
import { buildIncomeExpenseSankey } from '@/lib/spending/sankey';
import IncomeExpenseSankey from './IncomeExpenseSankey';
import type { Transaction, TransactionCategory } from '@/lib/spending/types';

interface InsightsViewProps {
  transactions: Transaction[];
  categories: TransactionCategory[];
}

export default function InsightsView({ transactions, categories }: InsightsViewProps) {
  const { fmt, privacyMode } = useDisplayCurrency();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const topLevelOf = (categoryId: string | null): TransactionCategory | null => {
    const cat = categoryId ? categoryById[categoryId] : null;
    if (!cat) return null;
    return cat.parent_id ? categoryById[cat.parent_id] ?? cat : cat;
  };

  const inRange = (t: Transaction) => (!from || t.tx_date >= from) && (!to || t.tx_date <= to);

  const analysable = useMemo(
    () => transactions.filter((t) => !t.is_transfer && !t.tag && inRange(t)),
    [transactions, from, to]
  );
  const spending = analysable.filter((t) => t.amount_gbp < 0);
  const income = analysable.filter((t) => t.amount_gbp > 0);
  const businessTravel = useMemo(
    () => transactions.filter((t) => t.tag === 'business_travel' && inRange(t)),
    [transactions, from, to]
  );

  const totalSpend = -sumBy(spending, (t) => t.amount_gbp);
  const totalIncome = sumBy(income, (t) => t.amount_gbp);

  const spendByCategory = useMemo(() => {
    const groups = groupBy(spending, (t) => topLevelOf(t.category_id)?.id ?? 'uncategorised');
    return Object.entries(groups)
      .map(([catId, txs]) => {
        const cat = categoryById[catId];
        return { id: catId, name: cat?.name ?? 'Uncategorised', slug: cat?.slug ?? 'general', total: -sumBy(txs, (t) => t.amount_gbp) };
      })
      .sort((a, b) => b.total - a.total);
  }, [spending, categoryById]);

  const incomeByCategory = useMemo(() => {
    const groups = groupBy(income, (t) => t.category_id ?? 'uncategorised');
    return Object.entries(groups)
      .map(([catId, txs]) => ({ id: catId, name: categoryById[catId]?.name ?? 'Other income', total: sumBy(txs, (t) => t.amount_gbp) }))
      .sort((a, b) => b.total - a.total);
  }, [income, categoryById]);

  const sankeyData = useMemo(
    () => buildIncomeExpenseSankey(income, spending, categories),
    [income, spending, categories]
  );

  const monthlyTrend = useMemo(() => {
    const groups = groupBy(spending, (t) => t.tx_date.slice(0, 7));
    return Object.entries(groups)
      .map(([month, txs]) => ({ month, label: formatDate(`${month}-01`, 'MMM yy'), total: -sumBy(txs, (t) => t.amount_gbp) }))
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-12);
  }, [spending]);

  const topMerchants = useMemo(() => {
    const groups = groupBy(spending, (t) => t.merchant || t.description);
    return Object.entries(groups)
      .map(([name, txs]) => ({ name, total: -sumBy(txs, (t) => t.amount_gbp), count: txs.length }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [spending]);

  const btExpense = -sumBy(businessTravel.filter((t) => t.amount_gbp < 0), (t) => t.amount_gbp);
  const btReimbursed = sumBy(businessTravel.filter((t) => t.amount_gbp > 0), (t) => t.amount_gbp);

  const maxCatTotal = Math.max(1, ...spendByCategory.map((c) => c.total));

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-sm font-semibold text-gray-900 mb-3">Period</p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full">
            <label className="label">From</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex-1 w-full">
            <label className="label">To</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex-1 w-full sm:pt-6">
            <button className="btn-secondary w-full" onClick={() => { setFrom(''); setTo(''); }}>Clear (all time)</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="card-title">Spending</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-gray-900">{fmt(totalSpend)}</p>
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
        </div>
        <div className="card">
          <p className="card-title">Income</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-green-600">{fmt(totalIncome)}</p>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
        </div>
        <div className="card">
          <p className="card-title">Net</p>
          <p className={`text-2xl font-bold ${totalIncome - totalSpend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {fmt(totalIncome - totalSpend)}
          </p>
        </div>
      </div>

      {sankeyData && (
        <div className="card hidden lg:block">
          <p className="text-sm font-semibold text-gray-900 mb-1">Where your money comes from and where it goes</p>
          <p className="text-xs text-gray-400 mb-4">Income sources on the left, expense categories and subcategories on the right. Hover a flow for the exact amount.</p>
          <IncomeExpenseSankey data={sankeyData} fmt={fmt} />
        </div>
      )}

      {spendByCategory.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 mb-4">Spending by category</p>
          <div className="space-y-2.5">
            {spendByCategory.map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-600">{c.name}</span>
                  <span className="text-xs font-semibold text-gray-700">{fmt(c.total, true)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(c.total / maxCatTotal) * 100}%`, backgroundColor: PALETTE[c.slug] ?? '#64748b' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {monthlyTrend.length > 1 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 mb-4">Monthly spending trend</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v) => privacyMode ? '' : fmt(v, true)} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={50} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', fontSize: '12px' }} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {monthlyTrend.map((_, i) => <Cell key={i} fill="#3b82f6" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {incomeByCategory.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 mb-3">Income by category</p>
          <div className="space-y-2">
            {incomeByCategory.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{c.name}</span>
                <span className="font-semibold text-green-600">{fmt(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topMerchants.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 mb-3">Top merchants</p>
          <div className="divide-y divide-gray-50">
            {topMerchants.map((m) => (
              <div key={m.name} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700 truncate">{m.name}</span>
                <span className="text-gray-400 text-xs mr-2">{m.count}x</span>
                <span className="font-semibold text-gray-900">{fmt(m.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {businessTravel.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <div className="flex gap-3">
            <Plane className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <p className="font-semibold text-amber-900 mb-2">Business travel (excluded from analysis)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-amber-700">Expenses</p>
                  <p className="font-semibold text-amber-900">{fmt(btExpense)}</p>
                </div>
                <div>
                  <p className="text-xs text-amber-700">Reimbursed</p>
                  <p className="font-semibold text-amber-900">{fmt(btReimbursed)}</p>
                </div>
                <div>
                  <p className="text-xs text-amber-700">Outstanding</p>
                  <p className="font-semibold text-amber-900">{fmt(btExpense - btReimbursed)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {spendByCategory[0] && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <div className="flex gap-3">
            <Lightbulb className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Where the savings potential is</p>
              <p className="text-blue-700">
                <strong>{spendByCategory[0].name}</strong> is your biggest spending category at {fmt(spendByCategory[0].total)}
                {spendByCategory[1] && <> — {spendByCategory[1].name} follows at {fmt(spendByCategory[1].total)}</>}.
                Trimming your top category by even 10% would save {fmt(spendByCategory[0].total * 0.1)} over this period.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
