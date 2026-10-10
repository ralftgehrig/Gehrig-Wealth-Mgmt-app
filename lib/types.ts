// ─── Domain types ────────────────────────────────────────────────────────────

export type Currency = 'GBP' | 'USD' | 'EUR' | 'CHF' | 'JPY' | 'AUD' | 'CAD' | 'INR' | 'SGD';

export type Relationship = 'self' | 'spouse' | 'child';

export type AccountType =
  | 'isa'
  | 'jisa'
  | 'gia'
  | 'pension'
  | 'sipp'
  | 'current'
  | 'savings'
  | 'crypto'
  | 'property'
  | 'mortgage'
  | 'credit_card'
  | 'loan'
  | 'rsu'
  | 'espp'
  | 'other';

export type IncomeType =
  | 'salary'
  | 'bonus'
  | 'rsu'
  | 'espp'
  | 'dividend'
  | 'rental'
  | 'freelance'
  | 'pension_income'
  | 'other';

export type IncomeFrequency =
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'one_off'
  | 'on_vesting';

export type AssetCategory =
  | 'cash'
  | 'equity'
  | 'pension'
  | 'property'
  | 'crypto'
  | 'debt';

// ─── Database row types ───────────────────────────────────────────────────────

export interface FamilyMember {
  id: string;
  name: string;
  date_of_birth: string | null;
  relationship: Relationship;
  color: string;
  created_at: string;
}

export interface Account {
  id: string;
  family_member_id: string;
  name: string;
  provider: string | null;
  account_type: AccountType;
  currency: Currency;
  is_liability: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  /** Login emails this account is hidden from — server-only; always stripped before a response reaches the client. */
  restricted_emails?: string[];
  /** Counts toward the divorce settlement split. Stripped from responses to restricted logins. */
  is_joint: boolean;
  // joined
  family_member?: FamilyMember;
  latest_snapshot?: BalanceSnapshot | null;
}

/** A premarital debt one spouse brought into the marriage that's since been paid off by the
 * other — deducted from their share of the joint-account settlement. Part of the restricted
 * divorce-settlement feature (see lib/auth/divorce-settlement.ts). */
export interface DivorceSettlementDebt {
  id: string;
  name: string;
  amount_gbp: number;
  notes: string | null;
  created_at: string;
}

export interface BalanceSnapshot {
  id: string;
  account_id: string;
  snapshot_date: string;
  balance: number;
  currency: Currency;
  gbp_balance: number;
  fx_rate: number;
  notes: string | null;
  created_at: string;
}

export interface Contribution {
  id: string;
  account_id: string;
  contribution_date: string;
  amount: number;
  currency: Currency;
  gbp_amount: number;
  notes: string | null;
  created_at: string;
}

export interface IncomeSource {
  id: string;
  family_member_id: string;
  name: string;
  employer: string | null;
  income_type: IncomeType;
  frequency: IncomeFrequency | null;
  gross_amount: number | null;
  currency: Currency;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  family_member?: FamilyMember;
  vesting_events?: VestingEvent[];
}

export interface VestingEvent {
  id: string;
  income_source_id: string;
  vest_date: string;
  shares: number;
  grant_price: number | null;
  estimated_value_per_share: number | null;
  currency: Currency;
  total_estimated_value: number | null;
  is_vested: boolean;
  actual_value: number | null;
  tax_withheld: number | null;
  net_proceeds: number | null;
  notes: string | null;
  created_at: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string | null;
  is_baseline: boolean;
  assumptions: ScenarioAssumptions;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  from_currency: Currency;
  to_currency: Currency;
  rate: number;
  rate_date: string;
}

// ─── Calculation types ────────────────────────────────────────────────────────

export interface NetWorthSnapshot {
  date: string;
  total_gbp: number;
  by_member: Record<string, number>;
  by_category: Record<AssetCategory, number>;
  by_type: Record<AccountType, number>;
  assets_gbp: number;
  liabilities_gbp: number;
}

export interface ReturnAnalysis {
  account_id: string;
  account_name: string;
  period_start: string;
  period_end: string;
  start_balance_gbp: number;
  end_balance_gbp: number;
  total_contributions_gbp: number;
  total_growth_gbp: number;
  modified_dietz_return: number;
  annualised_return: number;
}

// ─── Projection types ─────────────────────────────────────────────────────────

export interface ProjectionEvent {
  year: number;
  amount: number;
  label: string;
  type: 'inheritance' | 'education' | 'property' | 'income_change' | 'retirement' | 'custom';
}

export interface ScenarioAssumptions {
  horizon_years: number;
  monthly_net_savings: number;
  savings_growth_rate: number;
  inflation_rate: number;
  returns: {
    equity: number;
    pension: number;
    property: number;
    cash: number;
    crypto: number;
    debt: number;
  };
  volatility?: {
    equity: number;
    pension: number;
    property: number;
    cash: number;
    crypto: number;
  };
  events: ProjectionEvent[];
  simulation_type: 'deterministic' | 'monte_carlo';
  monte_carlo_runs?: number;
}

export interface ProjectionDataPoint {
  year: number;
  age: number;
  netWorth: number;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  events: ProjectionEvent[];
}

export interface ProjectionResult {
  data: ProjectionDataPoint[];
  milestones: Array<{ label: string; year: number; age: number; value: number }>;
}

// ─── UI types ─────────────────────────────────────────────────────────────────

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  isa: 'ISA',
  jisa: 'JISA',
  gia: 'GIA',
  pension: 'Pension',
  sipp: 'SIPP',
  current: 'Current Account',
  savings: 'Savings',
  crypto: 'Crypto',
  property: 'Property',
  mortgage: 'Mortgage',
  credit_card: 'Credit Card',
  loan: 'Loan',
  rsu: 'RSU / Stock',
  espp: 'ESPP',
  other: 'Other',
};

export const ACCOUNT_CATEGORY: Record<AccountType, AssetCategory> = {
  isa: 'equity',
  jisa: 'equity',
  gia: 'equity',
  pension: 'pension',
  sipp: 'pension',
  current: 'cash',
  savings: 'cash',
  crypto: 'crypto',
  property: 'property',
  mortgage: 'debt',
  credit_card: 'debt',
  loan: 'debt',
  rsu: 'equity',
  espp: 'equity',
  other: 'cash',
};

export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  equity: '#3b82f6',
  pension: '#8b5cf6',
  property: '#10b981',
  cash: '#6b7280',
  crypto: '#f59e0b',
  debt: '#ef4444',
};

export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  salary: 'Salary',
  bonus: 'Bonus',
  rsu: 'RSU / Stock Options',
  espp: 'ESPP',
  dividend: 'Dividend',
  rental: 'Rental Income',
  freelance: 'Freelance',
  pension_income: 'Pension Income',
  other: 'Other',
};

export const CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'CHF', 'JPY', 'AUD', 'CAD', 'INR', 'SGD'];

export const MEMBER_COLORS = [
  '#3b82f6',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
];
