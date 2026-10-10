import type { createClient } from '@/lib/supabase/server';

type SupabaseServerClient = ReturnType<typeof createClient>;

interface RestrictableAccount {
  id: string;
  restricted_emails?: string[] | null;
}

/** The logged-in user's email for this request, or null if there is no session. */
export async function getSessionEmail(supabase: SupabaseServerClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? null;
}

function isRestrictedFor(account: RestrictableAccount, email: string | null): boolean {
  return !!email && (account.restricted_emails ?? []).includes(email);
}

/**
 * Drops accounts hidden from this email, and strips the restriction list itself out of what's
 * returned — the client never needs to know an account is restricted, let alone from whom.
 */
export function visibleAccounts<T extends RestrictableAccount>(
  accounts: T[],
  email: string | null
): Omit<T, 'restricted_emails'>[] {
  return accounts
    .filter((a) => !isRestrictedFor(a, email))
    .map(({ restricted_emails: _restricted_emails, ...rest }) => rest);
}

/** IDs of accounts hidden from this email — for filtering balance_snapshots/contributions, which don't carry the restriction themselves. */
export function restrictedAccountIds<T extends RestrictableAccount>(accounts: T[], email: string | null): Set<string> {
  if (!email) return new Set();
  return new Set(accounts.filter((a) => isRestrictedFor(a, email)).map((a) => a.id));
}

/** True if this specific account should be invisible to this email (for single-account PATCH/DELETE/snapshot checks). */
export function isAccountRestricted<T extends RestrictableAccount>(account: T, email: string | null): boolean {
  return isRestrictedFor(account, email);
}
