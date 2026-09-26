import Papa from 'papaparse';
import { parseUKDate, cleanText, isLikelySelfPayee } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';

const BANK_HEADER = /^Number,Date,Account,Amount,Subcategory,Memo/i;
const CARD_HEADER = /^Date,Account\/Card No,Amount,Subcategory,Memo/i;

export function detectBarclays(text: string): boolean {
  const firstLine = (text.split(/\r?\n/)[0] ?? '').trim();
  return BANK_HEADER.test(firstLine) || CARD_HEADER.test(firstLine);
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(/,/g, ''));
}

/**
 * Barclays/Barclaycard export. Two header variants share the same quirky
 * format: every line after the first is prefixed with a stray leading tab
 * character, and the Memo column itself contains an embedded tab between the
 * payee block and the free-text reference — neither affects comma-delimited
 * field parsing, just needs cleanup before display/categorisation.
 *
 * The two variants also use *opposite* amount sign conventions: a current/
 * savings account shows credits (money in) as positive, like a bank
 * statement; a Barclaycard shows charges (spend) as positive and payments/
 * refunds as negative, like Amex.
 */
export function parseBarclays(text: string, fileName: string, selfNames: string[] = []): ParsedStatement {
  const firstLine = (text.split(/\r?\n/)[0] ?? '').trim();
  const isCard = CARD_HEADER.test(firstLine);

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
    const accountRef = raw.Account ?? raw['Account/Card No'];
    if (!raw.Date || !raw.Amount) continue;
    externalRef = externalRef ?? cleanText(accountRef);

    const rawAmount = parseAmount(raw.Amount);
    if (Number.isNaN(rawAmount) || rawAmount === 0) continue;
    // Bank account: positive = credit (in). Card: positive = charge (out) — flip to our convention.
    const amount = isCard ? -rawAmount : rawAmount;

    const memo = cleanText(raw.Memo);
    const subcategory = cleanText(raw.Subcategory);
    const description = [subcategory, memo].filter(Boolean).join(' — ');

    const isCardPayment = isCard && subcategory === 'Payment received';

    rows.push({
      tx_date: parseUKDate(raw.Date),
      description: description || subcategory || 'Transaction',
      merchant: memo || subcategory,
      amount,
      currency: 'GBP',
      source_category_hint: subcategory || null,
      is_transfer_hint: subcategory === 'Funds Transfer' || isCardPayment || isLikelySelfPayee(memo, selfNames),
      cardholder_name: null,
      raw,
    });
  }

  const acctSuffix = externalRef?.replace(/\*+/g, '').trim().split(' ').pop();

  if (isCard) {
    return {
      format: 'barclays',
      suggested_account_name: acctSuffix ? `Barclaycard ${acctSuffix}` : 'Barclaycard',
      suggested_institution: 'Barclaycard',
      suggested_currency: 'GBP',
      suggested_subtype: 'credit_card',
      external_ref: externalRef,
      rows,
    };
  }

  const isSavings = /saving/i.test(fileName);
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
