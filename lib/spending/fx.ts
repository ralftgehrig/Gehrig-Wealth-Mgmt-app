import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Historical GBP conversion rate for a currency on a given date, backed by
 * the app's existing `exchange_rates` cache table. Falls back to 1 (no
 * conversion) if the lookup fails, so an import never hard-fails on FX.
 */
export async function getHistoricalGBPRate(
  supabase: SupabaseClient,
  currency: string,
  dateISO: string
): Promise<number> {
  if (currency === 'GBP') return 1;

  const { data: cached } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('from_currency', currency)
    .eq('to_currency', 'GBP')
    .eq('rate_date', dateISO)
    .maybeSingle();
  if (cached?.rate) return Number(cached.rate);

  try {
    const res = await fetch(`https://api.frankfurter.app/${dateISO}?from=${currency}&to=GBP`);
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.GBP;
      if (typeof rate === 'number') {
        await supabase
          .from('exchange_rates')
          .upsert(
            { from_currency: currency, to_currency: 'GBP', rate, rate_date: dateISO },
            { onConflict: 'from_currency,to_currency,rate_date' }
          );
        return rate;
      }
    }
  } catch {
    // network failure — fall through to fallback below
  }
  return 1;
}

/** Batch-resolve GBP rates for a set of (currency, date) pairs, one network call per unique pair. */
export async function resolveRatesForRows(
  supabase: SupabaseClient,
  rows: Array<{ currency: string; tx_date: string }>
): Promise<Map<string, number>> {
  const uniquePairs = new Map<string, { currency: string; date: string }>();
  for (const r of rows) {
    if (r.currency === 'GBP') continue;
    uniquePairs.set(`${r.currency}|${r.tx_date}`, { currency: r.currency, date: r.tx_date });
  }
  const rateMap = new Map<string, number>();
  for (const { currency, date } of uniquePairs.values()) {
    rateMap.set(`${currency}|${date}`, await getHistoricalGBPRate(supabase, currency, date));
  }
  return rateMap;
}
