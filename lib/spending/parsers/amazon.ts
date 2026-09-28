import Papa from 'papaparse';
import { cleanText, parseISODateTime } from '../normalize';
import type { NormalizedRow, ParsedStatement } from '../types';
import type { Currency } from '@/lib/types';

/** Amazon fills in unavailable fields with the literal string "Not Applicable" rather than leaving them blank. */
function clean(value: string | undefined): string {
  const v = cleanText(value);
  return v.toLowerCase() === 'not applicable' ? '' : v;
}

function parseAmount(value: string | undefined): number {
  const v = clean(value);
  if (!v) return 0;
  const n = parseFloat(v.replace(/[,£$€]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/** Detects Amazon's "Digital Items" order history export (from a "Request My Data" download). */
export function detectAmazon(text: string): boolean {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const headers = (Papa.parse<string[]>(firstLine, { header: false }).data[0] ?? []).map((h) => h.trim());
  const set = new Set(headers);
  return set.has('ASIN') && set.has('Digital Order Item ID') && set.has('Transaction Amount') && set.has('Order ID');
}

interface OrderItemGroup {
  date: string | null;
  productName: string;
  orderId: string;
  currency: string;
  total: number;
  rawRows: Record<string, string>[];
}

/**
 * Amazon "Digital Items" order history report. Each purchase event is split
 * across several component rows (a "Price Amount" row, a "Tax" row, and any
 * "Promotion"/"Coupon" offsets) that all share the same Digital Order Item
 * ID — summing their Transaction Amount gives the true net amount actually
 * charged (correctly netting to zero for a fully-covered free trial or
 * promotional item, or to a discounted amount when a coupon applied).
 */
export function parseAmazon(text: string, _fileName: string): ParsedStatement {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });

  const groups = new Map<string, OrderItemGroup>();

  for (const raw of result.data) {
    const orderId = clean(raw['Order ID']);
    const productName = clean(raw['Product Name']);
    const itemId = clean(raw['Digital Order Item ID']) || (orderId ? `${orderId}|${productName}` : null);
    if (!itemId) continue;

    let group = groups.get(itemId);
    if (!group) {
      group = { date: null, productName: '', orderId, currency: '', total: 0, rawRows: [] };
      groups.set(itemId, group);
    }

    if (!group.date) {
      const rawDate = clean(raw['Order Date']);
      group.date = rawDate ? parseISODateTime(rawDate) : null;
    }
    if (!group.productName && productName) group.productName = productName;
    if (!group.currency) group.currency = clean(raw['Base Currency Code']).toUpperCase();
    group.total += parseAmount(raw['Transaction Amount']);
    group.rawRows.push(raw);
  }

  const rows: NormalizedRow[] = [];
  for (const group of groups.values()) {
    if (!group.date) continue;
    const net = Math.round(group.total * 100) / 100;
    if (Math.abs(net) < 0.005) continue; // free trial / fully-covered promotional item

    const description = group.productName || `Amazon order ${group.orderId}`;
    rows.push({
      tx_date: group.date,
      description,
      merchant: group.productName || 'Amazon',
      // Amazon order history reports what was charged; always represents money the user paid out.
      amount: -net,
      currency: (group.currency || 'GBP') as Currency,
      source_category_hint: null,
      cardholder_name: null,
      raw: { order_id: group.orderId, rows: group.rawRows },
    });
  }

  rows.sort((a, b) => a.tx_date.localeCompare(b.tx_date));

  return {
    format: 'amazon',
    suggested_account_name: 'Amazon Orders',
    suggested_institution: 'Amazon',
    suggested_currency: 'GBP',
    suggested_subtype: 'other',
    external_ref: null,
    rows,
  };
}
