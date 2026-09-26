import Papa from 'papaparse';
import { parseUKDate, cleanText, isLikelySelfPayee } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';

export function detectBarclays(text: string): boolean {
  const firstLine = (text.split(/\r?\n/)[0] ?? '').trim();
  return /^Number,Date,Account,Amount,Subcategory,Memo/i.test(firstLine);
}

/**
 * Barclays current/savings account export. Real-world quirk: every line
 * after the first is prefixed with a stray leading tab character, and the
 * Memo column itself contains an embedded tab between the payee block and
 * the free-text reference — neither affects comma-delimited field parsing,
 * just needs cleanup before display/categorisation.
 */
export function parseBarclays(text: string, _fileName: string, selfNames: string[] = []): ParsedStatement {
  const cleaned = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\t+/, ''))
    .join('\n');

  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  const rows: NormalizedRow[] = [];
  let externalRef: string | null = null;

  for (const raw of result.data) {
    if (!raw.Date || !raw.Amount) continue;
    externalRef = externalRef ?? cleanText(raw.Account);

    const amount = parseFloat(raw.Amount);
    if (Number.isNaN(amount) || amount === 0) continue;

    const memo = cleanText(raw.Memo);
    const subcategory = cleanText(raw.Subcategory);
    const description = [subcategory, memo].filter(Boolean).join(' — ');

    rows.push({
      tx_date: parseUKDate(raw.Date),
      description: description || subcategory || 'Transaction',
      merchant: memo || subcategory,
      amount,
      currency: 'GBP',
      source_category_hint: subcategory || null,
      is_transfer_hint: subcategory === 'Funds Transfer' || isLikelySelfPayee(memo, selfNames),
      cardholder_name: null,
      raw,
    });
  }

  const acctSuffix = externalRef?.split(' ').pop();
  const isSavings = /saving/i.test(_fileName);

  return {
    format: 'barclays',
    suggested_account_name: acctSuffix ? `Barclays ${isSavings ? 'Savings' : 'Account'} ${acctSuffix}` : 'Barclays Account',
    suggested_institution: 'Barclays',
    suggested_currency: 'GBP',
    suggested_subtype: isSavings ? 'savings' : 'current',
    external_ref: externalRef,
    rows,
  };
}
