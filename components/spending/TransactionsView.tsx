'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2, ArrowLeftRight, Plane, X, Layers, ArrowUpDown, Pencil, Check } from 'lucide-react';
import CategorySelect from './CategorySelect';
import EmptyState from '@/components/ui/EmptyState';
import { cn, formatDate, groupBy, sumBy } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import type { Transaction, SpendingAccount, TransactionCategory } from '@/lib/spending/types';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: SpendingAccount[];
  categories: TransactionCategory[];
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onApplyToMerchant: (transactionId: string) => Promise<{ merchant: string; updatedCount: number }>;
}

const PAGE_SIZE = 80;

type SortBy = 'date' | 'amount' | 'merchant';
type GroupMode = 'month' | 'category' | 'account' | 'none';

const SORT_LABELS: Record<SortBy, string> = { date: 'Date', amount: 'Amount', merchant: 'Merchant' };
const GROUP_LABELS: Record<GroupMode, string> = { month: 'Month', category: 'Category', account: 'Account', none: 'No grouping' };

export default function TransactionsView({ transactions, accounts, categories, onUpdate, onDelete, onApplyToMerchant }: TransactionsViewProps) {
  const { fmt } = useDisplayCurrency();

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [showTransfers, setShowTransfers] = useState(false);
  const [showTagged, setShowTagged] = useState(false);
  const [travelReview, setTravelReview] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupMode, setGroupMode] = useState<GroupMode>('month');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categoryById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const accountById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (travelReview) {
        // Travel review always shows both the tagged expenses and their reimbursements,
        // regardless of the transfer/tag/category toggles — those don't apply here.
        if (t.tag !== 'business_travel') return false;
      } else {
        if (!showTransfers && t.is_transfer) return false;
        if (!showTagged && t.tag) return false;
        if (categoryFilter) {
          const cat = categoryById[t.category_id ?? ''];
          const matchesDirect = t.category_id === categoryFilter;
          const matchesParent = cat?.parent_id === categoryFilter;
          if (!matchesDirect && !matchesParent) return false;
        }
      }
      if (from && t.tx_date < from) return false;
      if (to && t.tx_date > to) return false;
      if (accountFilter && t.spending_account_id !== accountFilter) return false;
      if (term && !(t.description.toLowerCase().includes(term) || t.merchant?.toLowerCase().includes(term) || t.custom_title?.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [transactions, from, to, accountFilter, categoryFilter, showTransfers, showTagged, travelReview, search, categoryById]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = a.tx_date < b.tx_date ? -1 : a.tx_date > b.tx_date ? 1 : 0;
      else if (sortBy === 'amount') cmp = Math.abs(a.amount_gbp) - Math.abs(b.amount_gbp);
      else cmp = (a.custom_title || a.merchant || a.description).localeCompare(b.custom_title || b.merchant || b.description);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const visible = sorted.slice(0, visibleCount);

  const groupKeyOf = (t: Transaction): string => {
    if (groupMode === 'month') return t.tx_date.slice(0, 7);
    if (groupMode === 'category') return t.category_id ?? 'uncategorised';
    if (groupMode === 'account') return t.spending_account_id;
    return 'all';
  };
  const groupLabelOf = (key: string): string => {
    if (groupMode === 'month') return formatDate(`${key}-01`, 'MMMM yyyy');
    if (groupMode === 'category') return categoryById[key]?.name ?? 'Uncategorised';
    if (groupMode === 'account') return accountById[key]?.name ?? 'Unknown account';
    return 'All transactions';
  };

  const groups = groupBy(visible, groupKeyOf);
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (groupMode === 'month') return sortDir === 'desc' ? (a < b ? 1 : -1) : a < b ? -1 : 1;
    if (groupMode === 'none') return 0;
    return Math.abs(sumBy(groups[b], (t) => t.amount_gbp)) - Math.abs(sumBy(groups[a], (t) => t.amount_gbp));
  });

  const totalOut = filtered.filter((t) => t.amount_gbp < 0).reduce((s, t) => s + t.amount_gbp, 0);
  const totalIn = filtered.filter((t) => t.amount_gbp > 0).reduce((s, t) => s + t.amount_gbp, 0);
  const net = totalIn + totalOut;

  const travelExpense = -sumBy(filtered.filter((t) => t.amount_gbp < 0), (t) => t.amount_gbp);
  const travelReimbursed = sumBy(filtered.filter((t) => t.amount_gbp > 0), (t) => t.amount_gbp);

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

        {!travelReview && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <CategorySelect categories={categories} value={categoryFilter || null} onChange={setCategoryFilter} />
          </div>
        )}
        {travelReview && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <select className="input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => <option key={s} value={s}>Sort: {SORT_LABELS[s]}</option>)}
          </select>
          <button
            type="button"
            className="btn-secondary justify-start"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title="Toggle sort direction"
          >
            <ArrowUpDown className="w-4 h-4" /> {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
          <select className="input" value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)}>
            {(Object.keys(GROUP_LABELS) as GroupMode[]).map((g) => <option key={g} value={g}>Group: {GROUP_LABELS[g]}</option>)}
          </select>
          <button
            type="button"
            className={travelReview ? 'btn-primary justify-start' : 'btn-secondary justify-start'}
            onClick={() => setTravelReview((v) => !v)}
            title="Show only business travel expenses and reimbursements, to check they match up"
          >
            <Plane className="w-4 h-4" /> Travel review
          </button>
        </div>

        {!travelReview && (
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
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <p className="card-title">Spending</p>
          <p className="text-xl font-bold text-gray-900">{fmt(totalOut)}</p>
        </div>
        <div className="card">
          <p className="card-title">Income</p>
          <p className="text-xl font-bold text-green-600">{fmt(totalIn)}</p>
        </div>
        <div className="card">
          <p className="card-title">Net</p>
          <p className={`text-xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(net)}</p>
        </div>
      </div>

      {travelReview && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">Business travel reconciliation</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-amber-700">Expenses</p>
              <p className="font-semibold text-amber-900">{fmt(travelExpense)}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700">Reimbursed</p>
              <p className="font-semibold text-amber-900">{fmt(travelReimbursed)}</p>
            </div>
            <div>
              <p className="text-xs text-amber-700">Outstanding</p>
              <p className="font-semibold text-amber-900">{fmt(travelExpense - travelReimbursed)}</p>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <EmptyState
          icon={travelReview ? Plane : Search}
          title={travelReview ? 'No business travel tagged yet' : 'No transactions'}
          description={
            travelReview
              ? 'Tag an expense or reimbursement with the plane icon to have it show up here.'
              : 'Try adjusting your filters, or upload a statement to get started.'
          }
        />
      )}

      {groupKeys.map((key) => {
        const groupTxs = groups[key];
        const groupOut = groupTxs.filter((t) => t.amount_gbp < 0).reduce((s, t) => s + t.amount_gbp, 0);
        const groupIn = groupTxs.filter((t) => t.amount_gbp > 0).reduce((s, t) => s + t.amount_gbp, 0);
        return (
          <div key={key} className="card">
            {groupMode !== 'none' && (
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{groupLabelOf(key)}</p>
                <p className="text-xs text-gray-400">
                  {groupOut < 0 && <span className="text-gray-600 font-medium">{fmt(groupOut)}</span>}
                  {groupOut < 0 && groupIn > 0 && ' · '}
                  {groupIn > 0 && <span className="text-green-600 font-medium">+{fmt(groupIn)}</span>}
                </p>
              </div>
            )}
            <div className="divide-y divide-gray-200">
              {groupTxs.map((t) => (
                <TransactionRow
                  key={t.id}
                  tx={t}
                  account={accountById[t.spending_account_id]}
                  categories={categories}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onApplyToMerchant={onApplyToMerchant}
                  fmt={fmt}
                />
              ))}
            </div>
          </div>
        );
      })}

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
  onApplyToMerchant,
  fmt,
}: {
  tx: Transaction;
  account: SpendingAccount | undefined;
  categories: TransactionCategory[];
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onApplyToMerchant: (transactionId: string) => Promise<{ merchant: string; updatedCount: number }>;
  fmt: (v: number, compact?: boolean) => string;
}) {
  const [applying, setApplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const currentTitle = tx.custom_title || tx.merchant || tx.description || '';

  const startEditingTitle = () => {
    // Pre-fill with the title as currently shown, not blank — the user is renaming it, not starting from scratch.
    setTitleDraft(currentTitle);
    setEditingTitle(true);
  };

  const saveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (trimmed === (tx.custom_title ?? '') || (!tx.custom_title && trimmed === currentTitle)) {
      setEditingTitle(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(tx.id, { custom_title: trimmed || null });
      setEditingTitle(false);
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToMerchant = async () => {
    setApplying(true);
    try {
      const { merchant, updatedCount } = await onApplyToMerchant(tx.id);
      if (updatedCount === 0) {
        alert(`No other transactions found from "${merchant}".`);
      } else {
        alert(`Applied this category to ${updatedCount} other transaction${updatedCount === 1 ? '' : 's'} from "${merchant}".`);
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="py-2.5 space-y-1.5">
      {/* Full title — never truncated. A custom title can override the raw merchant/description. */}
      {editingTitle ? (
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            autoFocus
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveTitle(); }
              if (e.key === 'Escape') setEditingTitle(false);
            }}
          />
          <button className="btn-ghost p-1.5 text-gray-400 hover:text-green-600 disabled:opacity-40" title="Save" onClick={saveTitle} disabled={saving}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-40" title="Cancel" onClick={() => setEditingTitle(false)} disabled={saving}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-1.5">
          <p className="text-sm font-medium text-gray-900 break-words flex-1">{currentTitle}</p>
          <button className="btn-ghost p-1 text-gray-300 hover:text-blue-600 flex-shrink-0" title="Rename this transaction" onClick={startEditingTitle}>
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
      {tx.custom_title && !editingTitle && (
        <p className="text-xs text-gray-400 -mt-1">Originally: {tx.merchant || tx.description}</p>
      )}

      {/* Meta row: date/badges on the left, controls on the right. On narrow viewports the controls
          cluster wraps onto its own line(s) rather than forcing the page to scroll horizontally. */}
      <div className="flex items-center justify-between gap-x-3 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(tx.tx_date, 'd MMM yyyy')}</span>
          {account && <span className="badge badge-gray flex-shrink-0">{account.name}</span>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CategorySelect
            categories={categories}
            value={tx.category_id}
            onChange={(categoryId) => onUpdate(tx.id, { category_id: categoryId })}
            className="input !py-1.5 !text-[13px] w-32 sm:w-40 flex-shrink-0"
          />

          <div className="text-right flex-shrink-0 w-24">
            <p className={`text-sm font-semibold ${tx.amount_gbp < 0 ? 'text-gray-900' : 'text-green-600'}`}>
              {tx.amount_gbp < 0 ? '−' : '+'}{fmt(Math.abs(tx.amount_gbp))}
            </p>
            {tx.currency !== 'GBP' && (
              <p className="text-xs text-gray-400">{tx.currency} {Math.abs(tx.amount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}</p>
            )}
          </div>

          {/* Grouped so these four wrap onto a new line together, rather than splitting mid-group. */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              className="btn-ghost p-1.5 text-gray-400 hover:text-blue-600 disabled:opacity-40"
              title="Apply this category to all other transactions from this merchant"
              onClick={handleApplyToMerchant}
              disabled={applying}
            >
              <Layers className="w-3.5 h-3.5" />
            </button>
            <button
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                tx.tag === 'business_travel' ? 'bg-amber-100 text-amber-600' : 'text-gray-400 hover:bg-gray-100 hover:text-amber-600'
              )}
              title={tx.tag === 'business_travel' ? 'Remove business travel tag' : 'Tag as business travel (reimbursable)'}
              onClick={() => onUpdate(tx.id, { tag: tx.tag === 'business_travel' ? null : 'business_travel' })}
            >
              <Plane className="w-3.5 h-3.5" />
            </button>
            <button
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                tx.is_transfer ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-100 hover:text-purple-600'
              )}
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
      </div>
    </div>
  );
}
