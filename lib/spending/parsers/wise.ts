import Papa from 'papaparse';
import { cleanText, parseISODateTime } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';
import type { Currency } from '@/lib/types';

interface WiseRow {
  ID: string;
  Status: string;
  Direction: 'IN' | 'OUT' | 'NEUTRAL';
  'Created on': string;
  'Source name': string;
  'Source amount (after fees)': string;
  'Source currency': string;
  'Target name': string;
  'Target amount (after fees)': string;
  'Target currency': string;
  Reference: string;
  Category: string;
  Note: string;
}

export function detectWise(text: string): boolean {
  const firstLine = (text.split(/\r?\n/)[0] ?? '').trim();
  return /^ID,Status,Direction,/i.test(firstLine);
}

export function parseWise(text: string, _fileName: string, selfNames: string[]): ParsedStatement {
  const result = Papa.parse<WiseRow>(text, { header: true, skipEmptyLines: true });
  const selfSet = new Set(selfNames.map((n) => n.trim().toLowerCase()).filter(Boolean));

  const rows: NormalizedRow[] = [];

  for (const raw of result.data) {
    if (!raw.ID || !raw.Direction) continue;
    if (raw.Direction === 'NEUTRAL') continue; // balance checkpoint, not a real movement

    const isOut = raw.Direction === 'OUT';
    const amountStr = isOut ? raw['Source amount (after fees)'] : raw['Target amount (after fees)'];
    const currency = (isOut ? raw['Source currency'] : raw['Target currency']) as Currency;
    const magnitude = parseFloat(amountStr);
    if (!currency || Number.isNaN(magnitude) || magnitude === 0) continue;

    const amount = isOut ? -magnitude : magnitude;
    const counterpartyName = isOut ? cleanText(raw['Target name']) : cleanText(raw['Source name']);

    // The account holder is *always* the "source" of an OUT row and the "target" of an IN row —
    // that's just how Wise labels its own wallet, not a signal of anything. A self-transfer is only
    // indicated when the *other* side of the transaction also belongs to the account holder (e.g.
    // topping up the Wise balance from their own bank, or an internal currency conversion).
    const isSelfTransfer = selfSet.has(counterpartyName.toLowerCase());

    const reference = cleanText(raw.Reference) || cleanText(raw.Note);
    const description = [counterpartyName, reference].filter(Boolean).join(' — ') || raw.ID;

    rows.push({
      tx_date: parseISODateTime(raw['Created on']),
      description,
      merchant: counterpartyName || raw.ID,
      amount,
      currency,
      source_category_hint: cleanText(raw.Category) || null,
      is_transfer_hint: isSelfTransfer,
      cardholder_name: null,
      raw: raw as unknown as Record<string, unknown>,
    });
  }

  return {
    format: 'wise',
    suggested_account_name: 'Wise',
    suggested_institution: 'Wise',
    suggested_currency: 'GBP',
    suggested_subtype: 'emoney',
    external_ref: null,
    rows,
  };
}
