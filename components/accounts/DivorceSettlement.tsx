'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Plus, Scale, Edit2, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useDisplayCurrency } from '@/lib/display-currency';
import type { Account, FamilyMember, BalanceSnapshot, DivorceSettlementDebt } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const DEBTS_KEY = '/api/divorce-settlement/debts';

interface DivorceSettlementProps {
  accounts: Account[];
  members: FamilyMember[];
}

export default function DivorceSettlement({ accounts, members }: DivorceSettlementProps) {
  const { data: debts = [], isLoading } = useSWR<DivorceSettlementDebt[]>(DEBTS_KEY, fetcher);
  const { fmt } = useDisplayCurrency();
  const [showAdd, setShowAdd] = useState(false);
  const [editingDebt, setEditingDebt] = useState<DivorceSettlementDebt | null>(null);

  const selfMember = members.find((m) => m.relationship === 'self');
  const spouseMember = members.find((m) => m.relationship === 'spouse');

  const jointAccounts = accounts.filter((a) => a.is_joint);
  const jointNetWorth = jointAccounts.reduce((sum, a) => {
    const snap = a.latest_snapshot as BalanceSnapshot | null;
    if (!snap) return sum;
    return sum + (a.is_liability ? -snap.gbp_balance : snap.gbp_balance);
  }, 0);
  const half = jointNetWorth / 2;
  const totalDebts = debts.reduce((sum, d) => sum + d.amount_gbp, 0);
  const spouseShare = half - totalDebts;
  const selfShare = half + totalDebts;

  const handleAdd = async (data: { name: string; amount_gbp: number }) => {
    await fetch(DEBTS_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate(DEBTS_KEY);
    setShowAdd(false);
  };

  const handleEdit = async (data: { name: string; amount_gbp: number }) => {
    if (!editingDebt) return;
    await fetch(`${DEBTS_KEY}/${editingDebt.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await mutate(DEBTS_KEY);
    setEditingDebt(null);
  };

  const handleDelete = async (debt: DivorceSettlementDebt) => {
    if (!confirm(`Delete "${debt.name}"?`)) return;
    await fetch(`${DEBTS_KEY}/${debt.id}`, { method: 'DELETE' });
    await mutate(DEBTS_KEY);
  };

  return (
    <div className="card space-y-5">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-gray-400" />
        <p className="card-title mb-0">Divorce settlement</p>
      </div>
      <p className="text-xs text-gray-400 -mt-4">
        Only accounts marked &ldquo;Joint&rdquo; count toward the split below.
      </p>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">
            {spouseMember?.name ?? 'Spouse'}&rsquo;s premarital debts
          </p>
          <button className="btn-secondary !py-1.5 !px-2.5 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" /> Add debt
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Debts {spouseMember?.name ?? 'they'} brought into the marriage that {selfMember?.name ?? 'you'} paid off —
          deducted from {spouseMember?.name ?? 'their'} share below, added to {selfMember?.name ?? 'yours'}.
        </p>

        {!isLoading && debts.length === 0 && <p className="text-sm text-gray-400 py-2">No debts recorded.</p>}

        <div className="divide-y divide-gray-50">
          {debts.map((debt) => (
            <div key={debt.id} className="flex items-center justify-between py-2">
              <p className="text-sm text-gray-700">{debt.name}</p>
              <div className="flex items-center gap-1 flex-shrink-0">
                <p className="text-sm font-semibold text-gray-900 w-24 text-right">{fmt(debt.amount_gbp)}</p>
                <button className="btn-ghost p-1.5 text-gray-400 hover:text-gray-700" title="Edit" onClick={() => setEditingDebt(debt)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-500" title="Delete" onClick={() => handleDelete(debt)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Total joint net worth ({jointAccounts.length} account{jointAccounts.length === 1 ? '' : 's'})
          </span>
          <span className="font-semibold text-gray-900">{fmt(jointNetWorth)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Split in half</span>
          <span className="font-semibold text-gray-900">{fmt(half)} each</span>
        </div>
        {totalDebts > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Premarital debts deducted from {spouseMember?.name ?? 'spouse'}, added to {selfMember?.name ?? 'you'}
            </span>
            <span className="font-semibold text-gray-900">{fmt(totalDebts)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="rounded-xl bg-primary-50 p-3">
            <p className="text-xs text-primary-700 font-medium">{selfMember?.name ?? 'You'}</p>
            <p className="text-xl font-bold text-primary-900">{fmt(selfShare)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-xs text-gray-500 font-medium">{spouseMember?.name ?? 'Spouse'}</p>
            <p className="text-xl font-bold text-gray-900">{fmt(spouseShare)}</p>
          </div>
        </div>

        {(!selfMember || !spouseMember) && (
          <p className="text-xs text-amber-600 pt-1">
            Add a family member marked &ldquo;Self&rdquo; and one marked &ldquo;Spouse&rdquo; in Settings to label these totals properly.
          </p>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add debt">
        <DebtForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
      </Modal>
      <Modal open={!!editingDebt} onClose={() => setEditingDebt(null)} title={`Edit — ${editingDebt?.name}`}>
        {editingDebt && <DebtForm debt={editingDebt} onSubmit={handleEdit} onCancel={() => setEditingDebt(null)} />}
      </Modal>
    </div>
  );
}

function DebtForm({
  debt,
  onSubmit,
  onCancel,
}: {
  debt?: DivorceSettlementDebt;
  onSubmit: (data: { name: string; amount_gbp: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(debt?.name ?? '');
  const [amount, setAmount] = useState(debt ? String(debt.amount_gbp) : '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), amount_gbp: parseFloat(amount) || 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Debt name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Credit card balance" required autoFocus />
      </div>
      <div>
        <label className="label">Amount (GBP)</label>
        <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? 'Saving…' : debt ? 'Save changes' : 'Add debt'}
        </button>
      </div>
    </form>
  );
}
