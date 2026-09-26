'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Upload, Settings, Receipt, RefreshCw } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import UploadModal from '@/components/spending/UploadModal';
import AccountsManagerModal from '@/components/spending/AccountsManagerModal';
import TransactionsView from '@/components/spending/TransactionsView';
import InsightsView from '@/components/spending/InsightsView';
import type { FamilyMember } from '@/lib/types';
import type { SpendingAccount, TransactionCategory, Transaction } from '@/lib/spending/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = 'transactions' | 'insights';

export default function SpendingPage() {
  const [tab, setTab] = useState<Tab>('transactions');
  const [showUpload, setShowUpload] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const { data: accounts = [] } = useSWR<SpendingAccount[]>('/api/spending/accounts', fetcher);
  const { data: categories = [] } = useSWR<TransactionCategory[]>('/api/spending/categories', fetcher);
  const { data: transactions = [], isLoading } = useSWR<Transaction[]>('/api/spending/transactions', fetcher);
  const { data: members = [] } = useSWR<FamilyMember[]>('/api/family-members', fetcher);

  const refreshAll = async () => {
    await Promise.all([
      mutate('/api/spending/accounts'),
      mutate('/api/spending/transactions'),
    ]);
  };

  const handleUpdateTransaction = async (id: string, data: Record<string, unknown>) => {
    await fetch(`/api/spending/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await mutate('/api/spending/transactions');
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch(`/api/spending/transactions/${id}`, { method: 'DELETE' });
    await mutate('/api/spending/transactions');
  };

  const handleCreateAccount = async (data: Record<string, unknown>) => {
    await fetch('/api/spending/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate('/api/spending/accounts');
  };

  const handleUpdateAccount = async (id: string, data: Record<string, unknown>) => {
    await fetch(`/api/spending/accounts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate('/api/spending/accounts');
  };

  const handleDeleteAccount = async (account: SpendingAccount) => {
    await fetch(`/api/spending/accounts/${account.id}`, { method: 'DELETE' });
    await Promise.all([mutate('/api/spending/accounts'), mutate('/api/spending/transactions')]);
  };

  const handleApplyToMerchant = async (transactionId: string) => {
    const res = await fetch('/api/spending/transactions/apply-to-merchant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId }),
    });
    const json = await res.json();
    await mutate('/api/spending/transactions');
    if (!res.ok) throw new Error(json.error || 'Failed to apply category');
    return json as { merchant: string; updatedCount: number };
  };

  const handleReconcileTransfers = async () => {
    setReconciling(true);
    try {
      const res = await fetch('/api/spending/reconcile-transfers', { method: 'POST' });
      const json = await res.json();
      await mutate('/api/spending/transactions');
      if (res.ok) {
        const hint =
          json.matchedCount === 0 && json.accountsInvolved < 2
            ? ` (only ${json.accountsInvolved} account has untagged transactions — a transfer needs both sides, e.g. the current account a card payment came from, to also be imported)`
            : '';
        alert(
          `Re-checked transfers: ${json.resetCount} reset, ${json.matchedCount} confirmed as matching transfers out of ${json.candidateCount} candidates across ${json.accountsInvolved} accounts.${hint}`
        );
      } else {
        alert(json.error || 'Failed to re-check transfers');
      }
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spending</h1>
          <p className="text-sm text-gray-500 mt-0.5">{transactions.length} transactions across {accounts.length} accounts</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setShowAccounts(true)}>
            <Settings className="w-4 h-4" /> Accounts
          </button>
          <button className="btn-secondary" onClick={handleReconcileTransfers} disabled={reconciling} title="Re-check which transactions are genuine transfers between your imported accounts">
            <RefreshCw className={`w-4 h-4 ${reconciling ? 'animate-spin' : ''}`} /> Re-check transfers
          </button>
          <button className="btn-primary" onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4" /> Upload statement
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['transactions', 'insights'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 text-center py-8">Loading transactions…</p>}

      {!isLoading && transactions.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Upload a bank or credit card statement (CSV or Excel) to get started. New uploads are automatically deduplicated against what you've already imported."
          action={<button className="btn-primary" onClick={() => setShowUpload(true)}><Upload className="w-4 h-4" /> Upload your first statement</button>}
        />
      )}

      {!isLoading && transactions.length > 0 && tab === 'transactions' && (
        <TransactionsView
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          onUpdate={handleUpdateTransaction}
          onDelete={handleDeleteTransaction}
          onApplyToMerchant={handleApplyToMerchant}
        />
      )}

      {!isLoading && transactions.length > 0 && tab === 'insights' && (
        <InsightsView transactions={transactions} categories={categories} />
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload statement" size="lg">
        <UploadModal accounts={accounts} members={members} categories={categories} onImported={refreshAll} onClose={() => setShowUpload(false)} />
      </Modal>

      {showAccounts && (
        <AccountsManagerModal
          accounts={accounts}
          members={members}
          onCreate={handleCreateAccount}
          onUpdate={handleUpdateAccount}
          onDelete={handleDeleteAccount}
          onClose={() => setShowAccounts(false)}
        />
      )}
    </div>
  );
}
