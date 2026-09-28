'use client';

import { useState, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { TransactionCategory } from '@/lib/spending/types';

interface AmazonMatch {
  transactionId: string;
  txDate: string;
  oldTitle: string;
  newTitle: string;
  categorySlug: string;
  amountGbp: number;
}

interface PreviewResult {
  totalOrders: number;
  matchedOrders: number;
  unmatchedOrders: number;
  sample: AmazonMatch[];
}

interface ApplyResult {
  matchedOrders: number;
  unmatchedOrders: number;
  appliedCount: number;
}

interface AmazonMatchModalProps {
  categories: TransactionCategory[];
  onApplied: () => Promise<void> | void;
  onClose: () => void;
}

export default function AmazonMatchModal({ categories, onApplied, onClose }: AmazonMatchModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const handleFileChange = async (f: File) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    setError(null);
    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/spending/amazon-match/preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to parse file');
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setApplying(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/spending/amazon-match', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to match Amazon orders');
      setResult(json);
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to match Amazon orders');
    } finally {
      setApplying(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-4 text-center py-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <div>
          <p className="text-lg font-semibold text-gray-900">Matching complete</p>
          <p className="text-sm text-gray-500 mt-1">
            {result.appliedCount} transaction{result.appliedCount === 1 ? '' : 's'} retitled and recategorised
            {result.unmatchedOrders > 0 && ` · ${result.unmatchedOrders} order${result.unmatchedOrders === 1 ? '' : 's'} had no matching transaction`}
          </p>
        </div>
        <button className="btn-primary w-full" onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Upload Amazon&apos;s order history export (from a &quot;Request My Data&quot; download) to match your past
        Amazon orders against transactions you&apos;ve already imported — giving each one a proper title and category.
        No new account or transaction is created; only matched transactions are updated.
      </p>

      {!file && (
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
          <UploadCloud className="w-8 h-8 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Choose Amazon order history CSV</span>
          <span className="text-xs text-gray-400">"Digital Items" export</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
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
              <p className="text-lg font-bold text-gray-900">{preview.totalOrders}</p>
              <p className="text-xs text-gray-500">orders in file</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-green-700">{preview.matchedOrders}</p>
              <p className="text-xs text-green-600">matched</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-amber-700">{preview.unmatchedOrders}</p>
              <p className="text-xs text-amber-600">no match</p>
            </div>
          </div>

          {preview.sample.length > 0 && (
            <div>
              <p className="label mb-2">Preview (first {preview.sample.length} matches)</p>
              <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                {preview.sample.map((m) => (
                  <div key={m.transactionId} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="text-gray-400 w-16 flex-shrink-0">{formatDate(m.txDate, 'd MMM')}</span>
                    <span className="text-gray-700 flex-1 truncate" title={m.oldTitle}>{m.newTitle}</span>
                    <span className="badge badge-gray flex-shrink-0">{categoryName(m.categorySlug)}</span>
                    <span className="font-semibold flex-shrink-0 w-20 text-right text-gray-900">
                      −{formatCurrency(Math.abs(m.amountGbp), 'GBP')}
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
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={handleConfirm}
          disabled={!file || !preview || loadingPreview || applying || preview.matchedOrders === 0}
        >
          {applying ? 'Matching…' : `Match ${preview?.matchedOrders ?? 0} transaction${preview?.matchedOrders === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
