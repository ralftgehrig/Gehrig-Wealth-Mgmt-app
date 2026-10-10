'use client';

import { useState } from 'react';
import type { FamilyMember, AccountType, Currency, Account } from '@/lib/types';
import { ACCOUNT_TYPE_LABELS, CURRENCIES } from '@/lib/types';
import { useFeatureFlags } from '@/lib/auth/feature-flags';

const LIABILITY_TYPES: AccountType[] = ['mortgage', 'credit_card', 'loan'];

interface AccountFormProps {
  members: FamilyMember[];
  account?: Account; // present = edit mode
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export default function AccountForm({ members, account, onSubmit, onCancel }: AccountFormProps) {
  const isEdit = !!account;
  const { canSeeDivorceSettlement } = useFeatureFlags();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    family_member_id: account?.family_member_id ?? members[0]?.id ?? '',
    name: account?.name ?? '',
    provider: account?.provider ?? '',
    account_type: (account?.account_type ?? 'isa') as AccountType,
    currency: (account?.currency ?? 'GBP') as Currency,
    is_liability: account?.is_liability ?? false,
    is_joint: account?.is_joint ?? false,
    notes: account?.notes ?? '',
  });

  const set = (key: string, value: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'account_type') {
        next.is_liability = LIABILITY_TYPES.includes(value as AccountType);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(form);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Family member</label>
        <select className="input" value={form.family_member_id} onChange={(e) => set('family_member_id', e.target.value)} required>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Account name</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Vanguard ISA" required />
        </div>
        <div>
          <label className="label">Provider</label>
          <input className="input" value={form.provider} onChange={(e) => set('provider', e.target.value)} placeholder="e.g. Vanguard" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Account type</label>
          <select className="input" value={form.account_type} onChange={(e) => set('account_type', e.target.value as AccountType)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
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
        <label className="label">Notes (optional)</label>
        <input className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. FTSE Global All Cap" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="is_liability" checked={form.is_liability} onChange={(e) => set('is_liability', e.target.checked)} className="rounded border-gray-300" />
        <label htmlFor="is_liability" className="text-sm text-gray-700">This is a liability (debt)</label>
      </div>
      {canSeeDivorceSettlement && (
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_joint" checked={form.is_joint} onChange={(e) => set('is_joint', e.target.checked)} className="rounded border-gray-300" />
          <label htmlFor="is_joint" className="text-sm text-gray-700">Joint account (counts toward the divorce settlement)</label>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary flex-1" disabled={loading}>
          {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </form>
  );
}
