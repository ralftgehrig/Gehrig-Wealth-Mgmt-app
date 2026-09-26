import Papa from 'papaparse';
import { cleanText, parseUKDate } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';
import type { Currency } from '@/lib/types';

const DATE_HEADER_HINTS = ['date', 'transaction date', 'posted date', 'value date'];
const DESC_HEADER_HINTS = ['description', 'narrative', 'memo', 'details', 'merchant', 'reference', 'payee'];
const AMOUNT_HEADER_HINTS = ['amount', 'value'];
const DEBIT_HEADER_HINTS = ['debit', 'money out', 'paid out', 'withdrawal'];
const CREDIT_HEADER_HINTS = ['credit', 'money in', 'paid in', 'deposit'];
const CURRENCY_HEADER_HINTS = ['currency', 'ccy'];

function findColumn(headers: string[], hints: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h === hint);
    if (idx !== -1) return idx;
  }
  for (const hint of hints) {
    const idx = lower.findIndex((h) => h.includes(hint));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseFlexibleDate(value: string): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) {
    try {
      return parseUKDate(v);
    } catch {
      return null;
    }
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

/**
 * Best-effort parser for bank/card CSV exports that don't match a known
 * format. Heuristically locates date, description and amount columns (either
 * a single signed `amount` column, or separate debit/credit columns). Always
 * shown to the user in the import preview before anything is saved, since
 * accuracy here can't be guaranteed the way it can for a known format.
 */
export function parseGeneric(text: string, _fileName: string): ParsedStatement {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];

  const iDate = findColumn(headers, DATE_HEADER_HINTS);
  const iDesc = findColumn(headers, DESC_HEADER_HINTS);
  const iAmount = findColumn(headers, AMOUNT_HEADER_HINTS);
  const iDebit = findColumn(headers, DEBIT_HEADER_HINTS);
  const iCredit = findColumn(headers, CREDIT_HEADER_HINTS);
  const iCurrency = findColumn(headers, CURRENCY_HEADER_HINTS);

  if (iDate === -1 || (iAmount === -1 && iDebit === -1 && iCredit === -1)) {
    throw new Error('Could not recognise this file — no date/amount columns found');
  }

  const rows: NormalizedRow[] = [];
  for (const raw of result.data) {
    const values = headers.map((h) => raw[h]);
    const dateRaw = iDate >= 0 ? cleanText(values[iDate]) : '';
    const txDate = dateRaw ? parseFlexibleDate(dateRaw) : null;
    if (!txDate) continue;

    let amount: number;
    if (iAmount >= 0) {
      amount = parseFloat(String(values[iAmount]).replace(/[,£$€]/g, ''));
    } else {
      const debit = iDebit >= 0 ? parseFloat(String(values[iDebit]).replace(/[,£$€]/g, '')) : 0;
      const credit = iCredit >= 0 ? parseFloat(String(values[iCredit]).replace(/[,£$€]/g, '')) : 0;
      amount = (Number.isNaN(credit) ? 0 : credit) - (Number.isNaN(debit) ? 0 : Math.abs(debit));
    }
    if (Number.isNaN(amount) || amount === 0) continue;

    const description = iDesc >= 0 ? cleanText(values[iDesc]) : 'Transaction';
    const currency = (iCurrency >= 0 ? cleanText(values[iCurrency]).toUpperCase() : 'GBP') as Currency;

    rows.push({
      tx_date: txDate,
      description: description || 'Transaction',
      merchant: description,
      amount,
      currency: currency || 'GBP',
      source_category_hint: null,
      cardholder_name: null,
      raw,
    });
  }

  return {
    format: 'generic',
    suggested_account_name: 'New Account',
    suggested_institution: '',
    suggested_currency: 'GBP',
    suggested_subtype: 'current',
    external_ref: null,
    rows,
  };
}
