'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2, ArrowLeftRight, Plane, X } from 'lucide-react';
import CategorySelect from './CategorySelect';
import EmptyState from '@/components/ui/EmptyState';
import { formatDate, groupBy } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import type { Transaction, SpendingAccount, TransactionCategory } from '@/lib/spending/types';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: SpendingAccount[];
  categories: TransactionCategory[];
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PAGE_SIZE = 80;

export default function TransactionsView({ transactions, accounts, categories, onUpdate, onDelete }: TransactionsViewProps) {
  const { fmt } = useDisplayCurrency();

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showTransfers, setShowTransfers] = useState(false);
  const [showTagged, setShowTagged] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (!showTransfers && t.is_transfer) return false;
      if (!showTagged && t.tag) return false;
      if (from && t.tx_date < from) return false;
      if (to && t.tx_date > to) return false;
      if (accountFilter && t.spending_account_id !== accountFilter) return false;
      if (categoryFilter) {
        const cat = categoryById[t.category_id ?? ''];
        const matchesDirect = t.category_id === categoryFilter;
        const matchesParent = cat?.parent_id === categoryFilter;
        if (!matchesDirect && !matchesParent) return false;
      }
      if (term && !(t.description.toLowerCase().includes(term) || t.merchant?.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [transactions, from, to, accountFilter, categoryFilter, showTransfers, showTagged, search, categoryById]);

  const visible = filtered.slice(0, visibleCount);
  const groups = groupBy(visible, (t) => t.tx_date.slice(0, 7));
  const monthKeys = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  const totalOut = filtered.filter((t) => t.amount_gbp < 0).reduce((s, t) => s + t.amount_gbp, 0);
  const totalIn = filtered.filter((t) => t.amount_gbp > 0).reduce((s, t) => s + t.amount_gbp, 0);

  const monthLabel = (key: string) => formatDate(`${key}-01`, 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input pl-9"
            placeholder="Search merchant or description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE); }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <select className="input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <CategorySelect categories={categories} value={categoryFilter || null} onChange={setCategoryFilter} />
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {categoryFilter && (
            <button className="badge badge-blue" onClick={() => setCategoryFilter('')}>
              {categoryById[categoryFilter]?.name} <X className="w-3 h-3" />
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} className="rounded border-gray-300" />
            Show transfers
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input type="checkbox" checked={showTagged} onChange={(e) => setShowTagged(e.target.checked)} className="rounded border-gray-300" />
            Show business travel (excluded)
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <p className="card-title">Spending</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalOut)}</p>
        </div>
        <div className="card">
          <p className="card-title">Income</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalIn)}</p>
        </div>
      </div>

      {filtered.length === 0 && (
        <EmptyState icon={Search} title="No transactions" description="Try adjusting your filters, or upload a statement to get started." />
      )}

      {monthKeys.map((key) => (
        <div key={key} className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{monthLabel(key)}</p>
          <div className="divide-y divide-gray-50">
            {groups[key].map((t) => (
              <TransactionRow key={t.id} tx={t} account={accounts.find((a) => a.id === t.spending_account_id)} categories={categories} onUpdate={onUpdate} onDelete={onDelete} fmt={fmt} />
            ))}
          </div>
        </div>
      ))}

      {filtered.length > visible.length && (
        <button className="btn-secondary w-full" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Show more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  );
}

function TransactionRow({
  tx,
  account,
  categories,
  onUpdate,
  onDelete,
  fmt,
}: {
  tx: Transaction;
  account: SpendingAccount | undefined;
  categories: TransactionCategory[];
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  fmt: (v: number, compact?: boolean) => string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-gray-900 truncate">{tx.merchant || tx.description}</p>
          {account && <span className="badge badge-gray flex-shrink-0">{account.name}</span>}
          {tx.is_transfer && <span className="badge badge-purple flex-shrink-0"><ArrowLeftRight className="w-3 h-3" /> Transfer</span>}
          {tx.tag === 'business_travel' && <span className="badge badge-amber flex-shrink-0"><Plane className="w-3 h-3" /> Business travel</span>}
        </div>
        <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.tx_date, 'd MMM yyyy')}</p>
      </div>

      <CategorySelect
        categories={categories}
        value={tx.category_id}
        onChange={(categoryId) => onUpdate(tx.id, { category_id: categoryId })}
        className="input !py-1.5 !text-[13px] w-40 flex-shrink-0"
      />

      <div className="text-right flex-shrink-0 w-24">
        <p className={`text-sm font-semibold ${tx.amount_gbp < 0 ? 'text-gray-900' : 'text-green-600'}`}>
          {tx.amount_gbp < 0 ? '−' : '+'}{fmt(Math.abs(tx.amount_gbp))}
        </p>
        {tx.currency !== 'GBP' && (
          <p className="text-xs text-gray-400">{tx.currency} {Math.abs(tx.amount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}</p>
        )}
      </div>

      <div className="flex gap-1 flex-shrink-0">
        <button
          className="btn-ghost p-1.5 text-gray-400 hover:text-amber-600"
          title={tx.tag === 'business_travel' ? 'Remove business travel tag' : 'Tag as business travel (reimbursable)'}
          onClick={() => onUpdate(tx.id, { tag: tx.tag === 'business_travel' ? null : 'business_travel' })}
        >
          <Plane className="w-3.5 h-3.5" />
        </button>
        <button
          className="btn-ghost p-1.5 text-gray-400 hover:text-purple-600"
          title={tx.is_transfer ? 'Unmark as transfer' : 'Mark as transfer'}
          onClick={() => onUpdate(tx.id, { is_transfer: !tx.is_transfer, transfer_group_id: null })}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
        </button>
        <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete" onClick={() => onDelete(tx.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
