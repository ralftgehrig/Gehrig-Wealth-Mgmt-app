'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Plus, Wallet, RefreshCw, ChevronDown, ChevronUp, Edit2, Trash2, Clock, List } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import AccountForm from '@/components/accounts/AccountForm';
import BalanceUpdateForm from '@/components/accounts/BalanceUpdateForm';
import HistoryEntryForm from '@/components/accounts/HistoryEntryForm';
import SnapshotHistoryModal from '@/components/accounts/SnapshotHistoryModal';
import DivorceSettlement from '@/components/accounts/DivorceSettlement';
import EmptyState from '@/components/ui/EmptyState';
import { formatDate, groupBy } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS, CATEGORY_COLORS, ACCOUNT_CATEGORY } from '@/lib/types';
import { useDisplayCurrency, filterHiddenAccounts } from '@/lib/display-currency';
import { useFeatureFlags } from '@/lib/auth/feature-flags';
import type { Account, FamilyMember, BalanceSnapshot, AssetCategory } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORY_ORDER: AssetCategory[] = ['equity', 'pension', 'property', 'cash', 'crypto', 'debt'];
const CATEGORY_LABELS: Record<AssetCategory, string> = {
  equity: 'Equities',
  pension: 'Pensions',
  property: 'Property',
  cash: 'Cash',
  crypto: 'Crypto',
  debt: 'Debt',
};

export default function AccountsPage() {
  const { data: rawAccounts = [], isLoading } = useSWR<Account[]>('/api/accounts', fetcher);
  const { data: members = [] } = useSWR<FamilyMember[]>('/api/family-members', fetcher);

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [updatingAccount, setUpdatingAccount] = useState<Account | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null);
  const [viewingHistory, setViewingHistory] = useState<Account | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const { fmt, mask, hideBitcoin } = useDisplayCurrency();
  const { canSeeDivorceSettlement } = useFeatureFlags();

  // "Hide Bitcoin" is a personal display preference (see lib/display-currency.tsx) — it only
  // filters what's rendered here, it's not the access restriction that hides it from Shannon.
  const accounts = filterHiddenAccounts(rawAccounts, hideBitcoin);

  const byMember = groupBy(accounts, (a) => a.family_member_id);

  const handleAddAccount = async (data: Record<string, unknown>) => {
    await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate('/api/accounts');
    setShowAddAccount(false);
  };

  const handleEditAccount = async (data: Record<string, unknown>) => {
    if (!editingAccount) return;
    await fetch(`/api/accounts/${editingAccount.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate('/api/accounts');
    setEditingAccount(null);
  };

  const handleDeleteAccount = async (account: Account) => {
    if (!confirm(`Delete "${account.name}"? All balance history for this account will also be deleted.`)) return;
    await fetch(`/api/accounts/${account.id}`, { method: 'DELETE' });
    await mutate('/api/accounts');
    await mutate('/api/net-worth-history');
  };

  const handleUpdateBalance = async (data: Record<string, unknown>) => {
    await fetch('/api/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate('/api/accounts');
    await mutate('/api/net-worth-history');
    setUpdatingAccount(null);
  };

  const handleHistoryEntry = async (rows: Array<{ snapshot_date: string; balance: string; contribution_amount: string; notes: string }>) => {
    if (!historyAccount) return;
    for (const row of rows) {
      await fetch('/api/balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: historyAccount.id,
          balance: parseFloat(row.balance),
          currency: historyAccount.currency,
          snapshot_date: row.snapshot_date,
          contribution_amount: row.contribution_amount ? parseFloat(row.contribution_amount) : undefined,
          notes: row.notes || undefined,
        }),
      });
    }
    await mutate('/api/accounts');
    await mutate('/api/net-worth-history');
    setHistoryAccount(null);
  };

  const totalGBP = accounts.reduce((sum, a) => {
    const snap = a.latest_snapshot as BalanceSnapshot | null;
    if (!snap) return sum;
    return sum + (a.is_liability ? -snap.gbp_balance : snap.gbp_balance);
  }, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{accounts.length} accounts · {fmt(totalGBP)} net</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddAccount(true)}>
          <Plus className="w-4 h-4" /> Add account
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <EmptyState icon={Wallet} title="No accounts yet" description="Add your first financial account." action={<button className="btn-primary" onClick={() => setShowAddAccount(true)}><Plus className="w-4 h-4" /> Add first account</button>} />
      )}

      {members.map((member) => {
        const memberAccounts = byMember[member.id] ?? [];
        if (!memberAccounts.length) return null;

        const memberTotal = memberAccounts.reduce((sum, a) => {
          const snap = a.latest_snapshot as BalanceSnapshot | null;
          if (!snap) return sum;
          return sum + (a.is_liability ? -snap.gbp_balance : snap.gbp_balance);
        }, 0);
        const isExpanded = expandedMember === null || expandedMember === member.id;

        // Group by asset category, sort categories by absolute total descending, sort accounts within each by gbp_balance descending
        const byCategory = groupBy(memberAccounts, (a) => ACCOUNT_CATEGORY[a.account_type] ?? 'cash');
        const categoryGroups = CATEGORY_ORDER
          .filter((cat) => byCategory[cat]?.length)
          .map((cat) => {
            const catAccounts = (byCategory[cat] ?? []).slice().sort((a, b) => {
              const snapA = (a.latest_snapshot as BalanceSnapshot | null)?.gbp_balance ?? 0;
              const snapB = (b.latest_snapshot as BalanceSnapshot | null)?.gbp_balance ?? 0;
              return snapB - snapA;
            });
            const catTotal = catAccounts.reduce((sum, a) => {
              const snap = a.latest_snapshot as BalanceSnapshot | null;
              if (!snap) return sum;
              return sum + (a.is_liability ? -snap.gbp_balance : snap.gbp_balance);
            }, 0);
            return { cat, catAccounts, catTotal };
          })
          .sort((a, b) => Math.abs(b.catTotal) - Math.abs(a.catTotal));

        return (
          <div key={member.id} className="card">
            <button className="flex items-center justify-between w-full text-left mb-0" onClick={() => setExpandedMember(isExpanded && expandedMember === member.id ? null : member.id)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ backgroundColor: member.color }}>{member.name[0]}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-400">{memberAccounts.length} accounts</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className={`text-sm font-bold ${memberTotal >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{fmt(memberTotal)}</p>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </button>

            {isExpanded && (
              <div className="mt-4 space-y-4">
                {categoryGroups.map(({ cat, catAccounts, catTotal }) => (
                  <div key={cat}>
                    {/* Asset class header + subtotal */}
                    <div className="flex items-center justify-between px-1 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: CATEGORY_COLORS[cat] }}>
                          {CATEGORY_LABELS[cat]}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold ${catTotal < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                        {catTotal < 0 ? '−' : ''}{fmt(Math.abs(catTotal))}
                      </span>
                    </div>

                    {/* Accounts in this category */}
                    <div className="divide-y divide-gray-50">
                      {catAccounts.map((account) => {
                        const snap = account.latest_snapshot as BalanceSnapshot | null;
                        return (
                          <div key={account.id} className="flex items-center gap-3 py-3">
                            <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                                <span className="badge badge-gray flex-shrink-0">{ACCOUNT_TYPE_LABELS[account.account_type]}</span>
                                {canSeeDivorceSettlement && account.is_joint && <span className="badge badge-blue flex-shrink-0">Joint</span>}
                                {account.is_liability && <span className="badge badge-red flex-shrink-0">Debt</span>}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {account.provider}{snap && ` · Updated ${formatDate(snap.snapshot_date, 'd MMM yyyy')}`}{!snap && ' · No balance recorded'}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {snap ? (
                                <>
                                  <p className={`text-sm font-semibold ${account.is_liability ? 'text-red-500' : 'text-gray-900'}`}>
                                    {account.is_liability ? '−' : ''}{fmt(snap.gbp_balance)}
                                  </p>
                                  {snap.currency !== 'GBP' && (
                                    <p className="text-xs text-gray-400">{snap.currency} {mask(snap.balance.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }))}</p>
                                  )}
                                </>
                              ) : (
                                <p className="text-xs text-gray-300">No data</p>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex gap-1 flex-shrink-0">
                              <button className="btn-ghost p-1.5 text-gray-400 hover:text-blue-500" title="Update balance" onClick={() => setUpdatingAccount(account)}>
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button className="btn-ghost p-1.5 text-gray-400 hover:text-purple-500" title="Add historic data" onClick={() => setHistoryAccount(account)}>
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                              <button className="btn-ghost p-1.5 text-gray-400 hover:text-indigo-500" title="View all data points" onClick={() => setViewingHistory(account)}>
                                <List className="w-3.5 h-3.5" />
                              </button>
                              <button className="btn-ghost p-1.5 text-gray-400 hover:text-gray-700" title="Edit account" onClick={() => setEditingAccount(account)}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete account" onClick={() => handleDeleteAccount(account)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {canSeeDivorceSettlement && <DivorceSettlement accounts={accounts} members={members} />}

      <Modal open={showAddAccount} onClose={() => setShowAddAccount(false)} title="Add account">
        <AccountForm members={members} onSubmit={handleAddAccount} onCancel={() => setShowAddAccount(false)} />
      </Modal>

      <Modal open={!!editingAccount} onClose={() => setEditingAccount(null)} title={`Edit — ${editingAccount?.name}`}>
        {editingAccount && <AccountForm members={members} account={editingAccount} onSubmit={handleEditAccount} onCancel={() => setEditingAccount(null)} />}
      </Modal>

      <Modal open={!!updatingAccount} onClose={() => setUpdatingAccount(null)} title={`Update balance — ${updatingAccount?.name}`}>
        {updatingAccount && <BalanceUpdateForm account={updatingAccount} onSubmit={handleUpdateBalance} onCancel={() => setUpdatingAccount(null)} />}
      </Modal>

      <Modal open={!!historyAccount} onClose={() => setHistoryAccount(null)} title={`Add historic data — ${historyAccount?.name}`} size="lg">
        {historyAccount && <HistoryEntryForm account={historyAccount} onSubmit={handleHistoryEntry} onCancel={() => setHistoryAccount(null)} />}
      </Modal>

      {viewingHistory && (
        <SnapshotHistoryModal account={viewingHistory} onClose={() => setViewingHistory(null)} />
      )}
    </div>
  );
}
