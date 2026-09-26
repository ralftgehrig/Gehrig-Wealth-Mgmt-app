import * as XLSX from 'xlsx';
import { cleanText, parseUKDate } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';

/**
 * Amex "Transaction Details" xlsx export. The sheet starts with a handful of
 * metadata rows (title, cardholder, account number) before the real header,
 * so the header row is located by content rather than a fixed offset.
 */
export function parseAmex(buffer: ArrayBuffer, _fileName: string): ParsedStatement {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => /transaction\s*details/i.test(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];

  const headerIdx = grid.findIndex(
    (row) => cleanText(String(row?.[0] ?? '')).toLowerCase() === 'date' && cleanText(String(row?.[1] ?? '')).toLowerCase() === 'description'
  );
  if (headerIdx === -1) {
    throw new Error('Could not find the transaction header row in this Amex file');
  }

  const header = grid[headerIdx].map((h) => cleanText(String(h)));
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iDate = col('Date');
  const iDesc = col('Description');
  const iCardMember = col('Card Member');
  const iAmount = col('Amount');
  const iCategory = col('Category');

  const rows: NormalizedRow[] = [];
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;
    const dateStr = cleanText(String(row[iDate] ?? ''));
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) continue; // stops at summary/footer rows

    const rawAmount = row[iAmount];
    const amexAmount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/,/g, ''));
    if (Number.isNaN(amexAmount) || amexAmount === 0) continue;

    const description = cleanText(String(row[iDesc] ?? '')) || 'Transaction';
    const category = iCategory >= 0 ? cleanText(String(row[iCategory] ?? '')) : '';
    const cardMember = iCardMember >= 0 ? cleanText(String(row[iCardMember] ?? '')) : null;

    rows.push({
      tx_date: parseUKDate(dateStr),
      description,
      merchant: description,
      // Amex convention: positive = charge to the card (spend), negative = payment/credit
      amount: -amexAmount,
      currency: 'GBP',
      source_category_hint: category || null,
      cardholder_name: cardMember,
      raw: Object.fromEntries(header.map((h, i) => [h, row[i]])),
    });
  }

  const titleRow = grid[0] ?? [];
  const productLabel = cleanText(String(titleRow[1] ?? ''))
    .split('/')[0]
    .replace(/[®™]/g, '')
    .trim();
  const acctRow = grid.find((r) => /^XXXX-/i.test(cleanText(String(r?.[0] ?? ''))));
  const externalRef = acctRow ? cleanText(String(acctRow[0])) : null;

  return {
    format: 'amex',
    suggested_account_name: productLabel ? `Amex ${productLabel}` : 'Amex Card',
    suggested_institution: 'American Express',
    suggested_currency: 'GBP',
    suggested_subtype: 'credit_card',
    external_ref: externalRef,
    rows,
  };
}
