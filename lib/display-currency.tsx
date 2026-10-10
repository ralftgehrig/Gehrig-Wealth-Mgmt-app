'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import useSWR from 'swr';
import type { Currency } from './types';
import { isBitcoinAccountName } from './account-name';

export { isBitcoinAccountName };

export const DISPLAY_CURRENCIES: Currency[] = ['GBP', 'USD', 'EUR', 'CAD', 'SGD'];

const SYMBOLS: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', CAD: 'C$', SGD: 'S$',
};

// ── Pure conversion helpers — can be imported and called outside context ──────

export function fxConvert(
  gbpAmount: number,
  currency: Currency,
  rates: Record<string, number>
): number {
  if (currency === 'GBP') return gbpAmount;
  const rate = rates[currency];
  return rate ? gbpAmount * rate : gbpAmount;
}

export function fxFormat(
  gbpAmount: number,
  currency: Currency,
  rates: Record<string, number>,
  compact = false
): string {
  const v = fxConvert(gbpAmount, currency, rates);
  const sym = SYMBOLS[currency] ?? '£';
  if (compact) {
    const abs = Math.abs(v);
    const sign = v < 0 ? '−' : '';
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `${sign}${sym}${Math.round(abs / 1_000)}k`;
    return `${sign}${sym}${Math.round(abs)}`;
  }
  return `${v < 0 ? '−' : ''}${sym}${new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(v))}`;
}

// ── Personal "hide Bitcoin" display preference ─────────────────────────────────
// A convenience/privacy toggle for whoever is logged in (e.g. while screen-sharing) — not an
// access restriction: the account and its data are still fully fetched, just filtered out of
// what's rendered. See lib/auth/account-restrictions.ts for the separate, real access control
// that hides the same account from Shannon's login entirely.

/** Drops the Bitcoin account from a list of accounts when the preference is on. */
export function filterHiddenAccounts<T extends { name: string }>(accounts: T[], hideBitcoin: boolean): T[] {
  return hideBitcoin ? accounts.filter((a) => !isBitcoinAccountName(a.name)) : accounts;
}

// ── Context ───────────────────────────────────────────────────────────────────

const rateFetcher = (url: string) =>
  fetch(url).then((r) => r.json()) as Promise<Record<string, number>>;

interface DisplayCurrencyCtx {
  currency: Currency;
  rates: Record<string, number>;
  setCurrency: (c: Currency) => void;
  symbol: string;
  loading: boolean;
  displayCurrencies: Currency[];
  /** True when amounts are hidden for demo/privacy purposes */
  privacyMode: boolean;
  togglePrivacy: () => void;
  /** True when the Bitcoin account is hidden from view (personal preference, not a restriction) */
  hideBitcoin: boolean;
  toggleHideBitcoin: () => void;
  /** Format a GBP amount in the selected display currency, masking if privacy mode is on */
  fmt: (v: number, compact?: boolean) => string;
  /** Wrap any pre-formatted string — returns '•••' when privacy mode is on */
  mask: (s: string) => string;
}

const DisplayCurrencyContext = createContext<DisplayCurrencyCtx>({
  currency: 'GBP',
  rates: {},
  setCurrency: () => {},
  symbol: '£',
  loading: false,
  displayCurrencies: DISPLAY_CURRENCIES,
  privacyMode: false,
  togglePrivacy: () => {},
  hideBitcoin: false,
  toggleHideBitcoin: () => {},
  fmt: () => '•••',
  mask: (s) => s,
});

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyRaw] = useState<Currency>('GBP');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [hideBitcoin, setHideBitcoin] = useState(false);

  const { data: rates = {}, isLoading } = useSWR('/api/fx-rates', rateFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 3_600_000,
  });

  // Restore preferences from localStorage on mount
  useEffect(() => {
    try {
      const savedCurrency = localStorage.getItem('displayCurrency') as Currency | null;
      if (savedCurrency && DISPLAY_CURRENCIES.includes(savedCurrency)) setCurrencyRaw(savedCurrency);
      const savedPrivacy = localStorage.getItem('privacyMode');
      if (savedPrivacy === 'true') setPrivacyMode(true);
      const savedHideBitcoin = localStorage.getItem('hideBitcoin');
      if (savedHideBitcoin === 'true') setHideBitcoin(true);
    } catch {}
  }, []);

  const setCurrency = (c: Currency) => {
    setCurrencyRaw(c);
    try { localStorage.setItem('displayCurrency', c); } catch {}
  };

  const togglePrivacy = useCallback(() => {
    setPrivacyMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('privacyMode', String(next)); } catch {}
      return next;
    });
  }, []);

  const toggleHideBitcoin = useCallback(() => {
    setHideBitcoin((prev) => {
      const next = !prev;
      try { localStorage.setItem('hideBitcoin', String(next)); } catch {}
      return next;
    });
  }, []);

  const mask = useCallback(
    (s: string) => (privacyMode ? '•••' : s),
    [privacyMode]
  );

  const fmt = useCallback(
    (v: number, compact?: boolean) =>
      privacyMode ? '•••' : fxFormat(v, currency, rates, compact),
    [privacyMode, currency, rates]
  );

  return (
    <DisplayCurrencyContext.Provider
      value={{
        currency,
        rates,
        setCurrency,
        symbol: SYMBOLS[currency] ?? '£',
        loading: isLoading,
        displayCurrencies: DISPLAY_CURRENCIES,
        privacyMode,
        togglePrivacy,
        hideBitcoin,
        toggleHideBitcoin,
        fmt,
        mask,
      }}
    >
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency() {
  return useContext(DisplayCurrencyContext);
}
