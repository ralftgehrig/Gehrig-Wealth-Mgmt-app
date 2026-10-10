/** Logins that cannot see the divorce-settlement feature at all: the joint/not-joint flag on
 * accounts, the premarital-debts list, and the settlement totals. */
const RESTRICTED_EMAILS = ['shannon@shannonfeely.com'];

export function canSeeDivorceSettlement(email: string | null | undefined): boolean {
  return !!email && !RESTRICTED_EMAILS.includes(email);
}
