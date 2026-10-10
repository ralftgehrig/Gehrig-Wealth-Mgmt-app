import { ACCOUNT_CATEGORY } from '../types';
import type { Account, AssetCategory, DivorceSettlementDebt, FamilyMember } from '../types';

export interface PostSettlementPortfolio {
  totalGBP: number;
  byCategory: Partial<Record<AssetCategory, number>>;
}

/**
 * What the "self" family member would be left with after the joint-account divorce
 * settlement: their own already-separate accounts in full, plus half of every joint
 * account — split by category, so projected growth still reflects the right asset mix —
 * with any premarital debts owed by the spouse settled as a cash equalisation payment
 * (added to/from the cash category, same as the simple settlement total on the Accounts page).
 */
export function computePostSettlementPortfolio(
  accounts: Account[],
  members: FamilyMember[],
  debts: DivorceSettlementDebt[]
): PostSettlementPortfolio | null {
  const selfMember = members.find((m) => m.relationship === 'self');
  if (!selfMember) return null;

  const byCategory: Partial<Record<AssetCategory, number>> = {};
  const add = (cat: AssetCategory, value: number) => {
    byCategory[cat] = (byCategory[cat] ?? 0) + value;
  };

  for (const account of accounts) {
    if (!account.is_active) continue;
    const snap = account.latest_snapshot;
    if (!snap) continue;
    const signed = account.is_liability ? -snap.gbp_balance : snap.gbp_balance;
    const cat = ACCOUNT_CATEGORY[account.account_type] ?? 'cash';

    if (account.is_joint) {
      add(cat, signed / 2);
    } else if (account.family_member_id === selfMember.id) {
      add(cat, signed);
    }
  }

  const totalDebts = debts.reduce((sum, d) => sum + d.amount_gbp, 0);
  if (totalDebts !== 0) add('cash', totalDebts);

  const totalGBP = Object.values(byCategory).reduce((s, v) => s + (v ?? 0), 0);
  return { totalGBP, byCategory };
}
