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
  const v = clean(value).replace(/^'+|'+$/g, ''); // some exports wrap negative numbers in stray single-quotes
  if (!v) return 0;
  const n = parseFloat(v.replace(/[,£$€]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * A quantity>1 order shipped in parts sometimes has its per-shipment values joined with
 * " and " into a single field (e.g. two Ship Dates for one row) — take the first.
 */
function firstOf(value: string): string {
  return value.split(/\s+and\s+/i)[0]?.trim() ?? '';
}

function parseHeaders(text: string): Set<string> {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const headers = (Papa.parse<string[]>(firstLine, { header: false }).data[0] ?? []).map((h) => h.trim());
  return new Set(headers);
}

function isDigitalItems(headers: Set<string>): boolean {
  return headers.has('ASIN') && headers.has('Digital Order Item ID') && headers.has('Transaction Amount') && headers.has('Order ID');
}

function isOrderHistory(headers: Set<string>): boolean {
  return (
    headers.has('ASIN') &&
    headers.has('Order ID') &&
    headers.has('Total Amount') &&
    headers.has('Product Name') &&
    !headers.has('Digital Order Item ID')
  );
}

/** Detects an Amazon order history export ("Digital Items" or physical "Retail Order History") from a "Request My Data" download. */
export function detectAmazon(text: string): boolean {
  const headers = parseHeaders(text);
  return isDigitalItems(headers) || isOrderHistory(headers);
}

export function parseAmazon(text: string, _fileName: string): ParsedStatement {
  const headers = parseHeaders(text);
  if (isDigitalItems(headers)) return parseDigitalItems(text);
  if (isOrderHistory(headers)) return parseOrderHistory(text);
  throw new Error('Unrecognized Amazon export — expected a "Digital Items" or "Retail Order History" CSV from a Request My Data download.');
}

const COMMON_STATEMENT_FIELDS = {
  format: 'amazon',
  suggested_account_name: 'Amazon Orders',
  suggested_institution: 'Amazon',
  suggested_currency: 'GBP' as Currency,
  suggested_subtype: 'other' as const,
  external_ref: null,
};

// ---- "Digital Items" export (ebooks, subscriptions, streaming, etc) ----

interface DigitalOrderGroup {
  date: string | null;
  productName: string;
  orderId: string;
  currency: string;
  total: number;
}

/**
 * Each purchase event is split across several component rows (a "Price Amount" row, a
 * "Tax" row, and any "Promotion"/"Coupon" offsets) that all share the same Digital Order
 * Item ID — summing their Transaction Amount gives the true net amount actually charged
 * (correctly netting to zero for a fully-covered free trial or promotional item).
 */
function parseDigitalItems(text: string): ParsedStatement {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const groups = new Map<string, DigitalOrderGroup>();

  for (const raw of result.data) {
    const orderId = clean(raw['Order ID']);
    const productName = clean(raw['Product Name']);
    const itemId = clean(raw['Digital Order Item ID']) || (orderId ? `${orderId}|${productName}` : null);
    if (!itemId) continue;

    let group = groups.get(itemId);
    if (!group) {
      group = { date: null, productName: '', orderId, currency: '', total: 0 };
      groups.set(itemId, group);
    }

    if (!group.date) {
      const rawDate = clean(raw['Order Date']);
      group.date = rawDate ? parseISODateTime(rawDate) : null;
    }
    if (!group.productName && productName) group.productName = productName;
    if (!group.currency) group.currency = clean(raw['Base Currency Code']).toUpperCase();
    group.total += parseAmount(raw['Transaction Amount']);
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
      amount: -net, // Amazon order history reports what was charged; always money paid out.
      currency: (group.currency || 'GBP') as Currency,
      source_category_hint: null,
      cardholder_name: null,
      raw: { order_id: group.orderId },
    });
  }

  rows.sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  return { ...COMMON_STATEMENT_FIELDS, rows };
}

// ---- Physical "Retail Order History" export ----

interface ShipmentGroup {
  date: string | null;
  productNames: string[];
  orderId: string;
  currency: string;
  total: number;
}

/**
 * One row per ordered item (not per card charge). The card is actually charged once per
 * shipment, and several items ordered together often ship — and get charged — together,
 * so rows are grouped by (Order ID, ship date) and their already-net "Total Amount"
 * summed to reconstruct the real per-shipment charge. Cancelled/unshipped items (never
 * charged) are excluded.
 */
function parseOrderHistory(text: string): ParsedStatement {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  const groups = new Map<string, ShipmentGroup>();

  for (const raw of result.data) {
    const orderId = clean(raw['Order ID']);
    if (!orderId) continue;

    const shipmentStatus = clean(raw['Shipment Status']);
    if (shipmentStatus && !/shipped/i.test(shipmentStatus)) continue;

    const dateSource = firstOf(clean(raw['Ship Date'])) || firstOf(clean(raw['Order Date']));
    if (!dateSource) continue;
    const date = parseISODateTime(dateSource);

    const key = `${orderId}|${date}`;
    let group = groups.get(key);
    if (!group) {
      group = { date, productNames: [], orderId, currency: '', total: 0 };
      groups.set(key, group);
    }

    const productName = clean(raw['Product Name']);
    if (productName && !group.productNames.includes(productName)) group.productNames.push(productName);
    if (!group.currency) group.currency = clean(raw['Currency']).toUpperCase();
    group.total += parseAmount(raw['Total Amount']);
  }

  const rows: NormalizedRow[] = [];
  for (const group of groups.values()) {
    if (!group.date) continue;
    const net = Math.round(group.total * 100) / 100;
    if (Math.abs(net) < 0.005) continue; // fully-refunded or free item

    const singleProduct = group.productNames.length === 1 ? group.productNames[0] : null;
    const description = singleProduct || `Amazon order ${group.orderId}`;
    rows.push({
      tx_date: group.date,
      description,
      merchant: singleProduct || 'Amazon',
      amount: -net,
      currency: (group.currency || 'GBP') as Currency,
      source_category_hint: null,
      cardholder_name: null,
      raw: { order_id: group.orderId },
    });
  }

  rows.sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  return { ...COMMON_STATEMENT_FIELDS, rows };
}
