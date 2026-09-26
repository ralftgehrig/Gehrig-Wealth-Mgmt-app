import { createHash } from 'crypto';

/** Collapse whitespace/tabs and trim — used to clean up messy statement text fields. */
export function cleanText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Normalise a raw merchant/description string into a stable key used for
 * category-rule matching and merchant grouping. Strips card processor noise
 * (trailing city/reference blocks, digits, punctuation) so "TESCO STORE 2761
 * 2761TE RICHMOND" and "TESCO STORES 4521" both collapse toward "TESCO".
 */
export function normalizeMerchant(text: string | null | undefined): string {
  let s = cleanText(text).toUpperCase();
  s = s.replace(/[*#]/g, ' ');
  s = s.replace(/\b\d{3,}\b/g, ' '); // long reference/store numbers
  s = s.replace(/[^A-Z0-9&' .-]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Parse a `DD/MM/YYYY` date string (UK bank export convention) into ISO `yyyy-mm-dd`. */
export function parseUKDate(value: string): string {
  const [d, m, y] = value.trim().split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Parse a `yyyy-mm-dd hh:mm:ss` (or date-only) timestamp into ISO `yyyy-mm-dd`. */
export function parseISODateTime(value: string): string {
  return value.trim().slice(0, 10);
}

/**
 * Loose match for "does this payee/reference text refer to the account holder
 * themselves?" — UK bank statements often render a standing order or transfer
 * counterparty as "SURNAME INITIAL(S)" (e.g. "GEHRIG R B") rather than a full
 * name, so an exact string match against `selfNames` won't catch it.
 */
export function isLikelySelfPayee(text: string, selfNames: string[]): boolean {
  const tokens = normalizeMerchant(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  return selfNames.some((full) => {
    const parts = normalizeMerchant(full).split(' ').filter(Boolean);
    if (parts.length < 2) return false;
    const surname = parts[parts.length - 1];
    const firstInitial = parts[0][0];
    return tokens.includes(surname) && tokens.some((t) => t.length <= 2 && t.startsWith(firstInitial));
  });
}

/**
 * Stable content hash for dedup: identical (account, date, amount, description)
 * always hashes the same, so re-uploading a statement recognises rows already
 * imported. Genuine repeats (two identical coffees same day) are told apart via
 * `occurrence_index`, not the hash itself.
 */
export function contentHash(spendingAccountId: string, txDate: string, amount: number, description: string): string {
  const key = `${spendingAccountId}|${txDate}|${amount.toFixed(2)}|${normalizeMerchant(description)}`;
  return createHash('sha256').update(key).digest('hex');
}
