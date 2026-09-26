'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CURRENCIES } from '@/lib/types';
import type { FamilyMember, Currency } from '@/lib/types';
import type { SpendingAccount, SpendingAccountSubtype, TransactionCategory } from '@/lib/spending/types';

const SUBTYPE_LABELS: Record<SpendingAccountSubtype, string> = {
  current: 'Current account',
  savings: 'Savings account',
  credit_card: 'Credit card',
  emoney: 'E-money / multi-currency',
  other: 'Other',
};

interface PreviewResult {
  format: string;
  suggestedAccountName: string;
  suggestedInstitution: string;
  suggestedCurrency: Currency;
  suggestedSubtype: SpendingAccountSubtype;
  externalRef: string | null;
  totalRows: number;
  estimatedNewRows: number;
  estimatedDuplicateRows: number;
  sample: Array<{ tx_date: string; description: string; amount: number; currency: Currency; categorySlug: string }>;
}

interface CommitResult {
  spendingAccountId: string;
  batchId: string;
  totalRows: number;
  newRows: number;
  duplicateRows: number;
  transferRows: number;
}

interface UploadModalProps {
  accounts: SpendingAccount[];
  members: FamilyMember[];
  categories: TransactionCategory[];
  onImported: () => Promise<void> | void;
  onClose: () => void;
}

export default function UploadModal({ accounts, members, categories, onImported, onClose }: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [accountChoice, setAccountChoice] = useState<'existing' | 'new'>('new');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [newAccountFields, setNewAccountFields] = useState({
    name: '',
    institution: '',
    account_subtype: 'current' as SpendingAccountSubtype,
    currency: 'GBP' as Currency,
    family_member_id: '',
  });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const loadPreview = async (f: File, accountId?: string): Promise<PreviewResult | null> => {
    setLoadingPreview(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (accountId) fd.append('spending_account_id', accountId);
      const res = await fetch('/api/spending/import/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to parse file');
      setPreview(json);
      return json as PreviewResult;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
      setPreview(null);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleFileChange = async (f: File) => {
    setFile(f);
    setResult(null);
    const p = await loadPreview(f);
    if (!p) return;

    const match = accounts.find(
      (a) =>
        a.name.toLowerCase() === p.suggestedAccountName.toLowerCase() ||
        (p.externalRef && a.external_ref && a.external_ref === p.externalRef)
    );
    if (match) {
      setAccountChoice('existing');
      setSelectedAccountId(match.id);
      await loadPreview(f, match.id);
    } else {
      setAccountChoice('new');
      setNewAccountFields({
        name: p.suggestedAccountName,
        institution: p.suggestedInstitution,
        account_subtype: p.suggestedSubtype,
        currency: p.suggestedCurrency,
        family_member_id: '',
      });
    }
  };

  const handleExistingAccountChange = async (id: string) => {
    setSelectedAccountId(id);
    if (file) await loadPreview(file, id);
  };

  const handleConfirmImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (accountChoice === 'existing') {
        fd.append('spending_account_id', selectedAccountId);
      } else {
        fd.append('new_account_name', newAccountFields.name);
        fd.append('new_account_institution', newAccountFields.institution);
        fd.append('new_account_subtype', newAccountFields.account_subtype);
        fd.append('new_account_currency', newAccountFields.currency);
        if (newAccountFields.family_member_id) fd.append('new_account_family_member_id', newAccountFields.family_member_id);
      }
      const res = await fetch('/api/spending/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setResult(json);
      await onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const canConfirm =
    !!file &&
    !loadingPreview &&
    !importing &&
    (accountChoice === 'existing' ? !!selectedAccountId : !!newAccountFields.name.trim());

  if (result) {
    return (
      <div className="space-y-4 text-center py-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-gray-900">Import complete</p>
          <p className="text-sm text-gray-500 mt-1">
            {result.newRows} new transaction{result.newRows === 1 ? '' : 's'} added
            {result.duplicateRows > 0 && ` · ${result.duplicateRows} duplicate${result.duplicateRows === 1 ? '' : 's'} skipped`}
            {result.transferRows > 0 && ` · ${result.transferRows} marked as transfers`}
          </p>
        </div>
        <div className="flex gap-2 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Done</button>
          <button
            className="btn-primary flex-1"
            onClick={() => {
              setFile(null);
              setPreview(null);
              setResult(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          >
            Upload another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!file && (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
          <UploadCloud className="w-8 h-8 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Choose a statement file</span>
          <span className="text-xs text-gray-400">CSV or Excel (.xlsx) — Barclays, Wise, Amex, or other banks</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
          />
        </label>
      )}

      {file && (
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <FileSpreadsheet className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <span className="text-sm text-gray-700 truncate flex-1">{file.name}</span>
          {loadingPreview && <span className="text-xs text-gray-400">Analysing…</span>}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{preview.totalRows}</p>
              <p className="text-xs text-gray-500">rows found</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-700">{preview.estimatedNewRows}</p>
              <p className="text-xs text-green-600">new</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-amber-700">{preview.estimatedDuplicateRows}</p>
              <p className="text-xs text-amber-600">duplicates</p>
            </div>
          </div>

          <div>
            <p className="label mb-2">Import into</p>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                className={accountChoice === 'existing' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                onClick={() => setAccountChoice('existing')}
                disabled={accounts.length === 0}
              >
                Existing account
              </button>
              <button
                type="button"
                className={accountChoice === 'new' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                onClick={() => setAccountChoice('new')}
              >
                New account
              </button>
            </div>

            {accountChoice === 'existing' ? (
              <select className="input" value={selectedAccountId} onChange={(e) => handleExistingAccountChange(e.target.value)}>
                <option value="">Select an account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.institution ? ` · ${a.institution}` : ''}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-3">
                <input
                  className="input"
                  value={newAccountFields.name}
                  onChange={(e) => setNewAccountFields((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Account name"
                />
                <input
                  className="input"
                  value={newAccountFields.institution}
                  onChange={(e) => setNewAccountFields((p) => ({ ...p, institution: e.target.value }))}
                  placeholder="Institution (optional)"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    className="input"
                    value={newAccountFields.account_subtype}
                    onChange={(e) => setNewAccountFields((p) => ({ ...p, account_subtype: e.target.value as SpendingAccountSubtype }))}
                  >
                    {Object.entries(SUBTYPE_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    value={newAccountFields.currency}
                    onChange={(e) => setNewAccountFields((p) => ({ ...p, currency: e.target.value as Currency }))}
                  >
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {members.length > 0 && (
                  <select
                    className="input"
                    value={newAccountFields.family_member_id}
                    onChange={(e) => setNewAccountFields((p) => ({ ...p, family_member_id: e.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          {preview.sample.length > 0 && (
            <div>
              <p className="label mb-2">Preview (first {preview.sample.length} rows)</p>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {preview.sample.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="text-gray-400 w-16 flex-shrink-0">{formatDate(row.tx_date, 'd MMM')}</span>
                    <span className="text-gray-700 flex-1 truncate">{row.description}</span>
                    <span className="badge badge-gray flex-shrink-0">{categoryName(row.categorySlug)}</span>
                    <span className={`font-semibold flex-shrink-0 w-20 text-right ${row.amount < 0 ? 'text-gray-900' : 'text-green-600'}`}>
                      {row.amount < 0 ? '−' : '+'}{formatCurrency(Math.abs(row.amount), row.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary flex-1" onClick={handleConfirmImport} disabled={!canConfirm}>
          {importing ? 'Importing…' : 'Import transactions'}
        </button>
      </div>
    </div>
  );
}
