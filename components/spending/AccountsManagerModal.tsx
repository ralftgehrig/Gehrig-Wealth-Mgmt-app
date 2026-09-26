'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Wallet } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import SpendingAccountForm from './SpendingAccountForm';
import type { FamilyMember } from '@/lib/types';
import type { SpendingAccount } from '@/lib/spending/types';

interface AccountsManagerModalProps {
  accounts: SpendingAccount[];
  members: FamilyMember[];
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (account: SpendingAccount) => Promise<void>;
  onClose: () => void;
}

export default function AccountsManagerModal({ accounts, members, onCreate, onUpdate, onDelete, onClose }: AccountsManagerModalProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<SpendingAccount | null>(null);

  return (
    <Modal open onClose={onClose} title="Spending accounts" size="lg">
      <div className="space-y-4">
        <button className="btn-primary w-full" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4" /> Add account
        </button>

        {accounts.length === 0 && (
          <EmptyState icon={Wallet} title="No spending accounts yet" description="Upload a statement to create one automatically, or add one here." />
        )}

        <div className="space-y-2">
          {accounts.map((a) => {
            const member = members.find((m) => m.id === a.family_member_id);
            return (
              <div key={a.id} className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{a.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {a.institution ? `${a.institution} · ` : ''}{a.currency}
                    {member ? ` · ${member.name}` : ''}
                    {!a.is_active && ' · Inactive'}
                  </p>
                </div>
                <button className="btn-ghost p-1.5 text-gray-400 hover:text-gray-700" title="Edit" onClick={() => setEditing(a)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  className="btn-ghost p-1.5 text-gray-400 hover:text-red-500"
                  title="Delete"
                  onClick={() => {
                    if (confirm(`Delete "${a.name}"? All imported transactions for this account will also be deleted.`)) {
                      onDelete(a);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add spending account">
        <SpendingAccountForm
          members={members}
          onSubmit={async (data) => {
            await onCreate(data);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit — ${editing?.name}`}>
        {editing && (
          <SpendingAccountForm
            members={members}
            account={editing}
            onSubmit={async (data) => {
              await onUpdate(editing.id, data);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </Modal>
  );
}
