import type { Currency } from '@/lib/types';

export type SpendingAccountSubtype = 'current' | 'savings' | 'credit_card' | 'emoney' | 'other';

export interface SpendingAccount {
  id: string;
  name: string;
  institution: string | null;
  account_subtype: SpendingAccountSubtype;
  currency: Currency;
  family_member_id: string | null;
  external_ref: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TransactionCategory {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  is_income: boolean;
  color: string | null;
  sort_order: number;
}

export type TransactionTag = 'business_travel';

export interface Transaction {
  id: string;
  spending_account_id: string;
  import_batch_id: string | null;
  family_member_id: string | null;
  tx_date: string;
  description: string;
  merchant: string | null;
  amount: number;
  currency: Currency;
  amount_gbp: number;
  category_id: string | null;
  category_confidence: 'auto' | 'manual';
  is_transfer: boolean;
  transfer_group_id: string | null;
  tag: TransactionTag | null;
  notes: string | null;
  /** User-chosen text that replaces the merchant/description in the UI, e.g. renaming a cryptic bank descriptor. */
  custom_title: string | null;
  created_at: string;
  // joined
  spending_account?: SpendingAccount;
  category?: TransactionCategory | null;
}

export interface ImportBatch {
  id: string;
  spending_account_id: string;
  file_name: string | null;
  format_detected: string | null;
  total_rows: number;
  new_rows: number;
  duplicate_rows: number;
  transfer_rows: number;
  imported_at: string;
}

/** A single row extracted from a bank statement, before dedup/categorisation/insert. */
export interface NormalizedRow {
  tx_date: string; // ISO yyyy-mm-dd
  description: string;
  merchant: string;
  amount: number; // signed: positive = in, negative = out, in `currency`
  currency: Currency;
  source_category_hint: string | null;
  cardholder_name: string | null;
  raw: Record<string, unknown>;
}

export interface ParsedStatement {
  format: string;
  suggested_account_name: string;
  suggested_institution: string;
  suggested_currency: Currency;
  suggested_subtype: SpendingAccountSubtype;
  external_ref: string | null;
  rows: NormalizedRow[];
}

export const IMPORT_FORMATS = ['barclays', 'wise', 'amex', 'generic'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];
