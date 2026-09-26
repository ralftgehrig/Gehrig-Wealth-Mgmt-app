'use client';

import { useState } from 'react';
import type { FamilyMember, Currency } from '@/lib/types';
import { CURRENCIES } from '@/lib/types';
import type { SpendingAccount, SpendingAccountSubtype } from '@/lib/spending/types';

const SUBTYPE_LABELS: Record<SpendingAccountSubtype, string> = {
  current: 'Current account',
  savings: 'Savings account',
  credit_card: 'Credit card',
  emoney: 'E-money / multi-currency',
  other: 'Other',
};

interface SpendingAccountFormProps {
  members: FamilyMember[];
  account?: SpendingAccount;
  defaults?: Partial<{ name: string; institution: string; account_subtype: SpendingAccountSubtype; currency: Currency }>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export default function SpendingAccountForm({ members, account, defaults, onSubmit, onCancel }: SpendingAccountFormProps) {
  const isEdit = !!account;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: account?.name ?? defaults?.name ?? '',
    institution: account?.institution ?? defaults?.institution ?? '',
    account_subtype: (account?.account_subtype ?? defaults?.account_subtype ?? 'current') as SpendingAccountSubtype,
    currency: (account?.currency ?? defaults?.currency ?? 'GBP') as Currency,
    family_member_id: account?.family_member_id ?? '',
  });

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({ ...form, family_member_id: form.family_member_id || null });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Account name</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Amex Platinum" required />
        </div>
        <div>
          <label className="label">Institution</label>
          <input className="input" value={form.institution} onChange={(e) => set('institution', e.target.value)} placeholder="e.g. American Express" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Type</label>
          <select className="input" value={form.account_subtype} onChange={(e) => set('account_subtype', e.target.value as SpendingAccountSubtype)}>
            {Object.entries(SUBTYPE_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input" value={form.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Family member (optional)</label>
        <select className="input" value={form.family_member_id} onChange={(e) => set('family_member_id', e.target.value)}>
          <option value="">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
