/** Plain (server- and client-safe) matcher — shared by the client-side "hide Bitcoin" display
 * preference (lib/display-currency.tsx) and the server-side net-worth-history filter. */
export function isBitcoinAccountName(name: string | null | undefined): boolean {
  return !!name && /bitcoin/i.test(name);
}
