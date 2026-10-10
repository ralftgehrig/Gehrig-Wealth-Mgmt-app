'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { TrendingUp, TrendingDown, ArrowUpRight, RefreshCw, Users } from 'lucide-react';
import NetWorthChart from '@/components/dashboard/NetWorthChart';
import NetWorthGrowth from '@/components/dashboard/NetWorthGrowth';
import AssetBreakdown from '@/components/dashboard/AssetBreakdown';
import { computeNetWorth } from '@/lib/calculations/net-worth';
import { formatCurrency, formatPercent, formatDate, ageFromDob } from '@/lib/utils';
import { MEMBER_COLORS } from '@/lib/types';
import { useDisplayCurrency, filterHiddenAccounts } from '@/lib/display-currency';
import type { Account, BalanceSnapshot, FamilyMember, NetWorthSnapshot } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DashboardPage() {
  const { currency: displayCurrency, rates, setCurrency, loading: fxLoading, fmt, mask, hideBitcoin } = useDisplayCurrency();
  const { data: rawAccounts = [] } = useSWR<Account[]>('/api/accounts', fetcher);
  const { data: members = [] } = useSWR<FamilyMember[]>('/api/family-members', fetcher);
  const { data: history = [] } = useSWR<{ date: string; total: number }[]>(
    `/api/net-worth-history${hideBitcoin ? '?hideBitcoin=1' : ''}`,
    fetcher
  );

  // "Hide Bitcoin" is a personal display preference (see lib/display-currency.tsx) — it only
  // filters what's rendered here, it's not the access restriction that hides it from Shannon.
  const accounts = useMemo(() => filterHiddenAccounts(rawAccounts, hideBitcoin), [rawAccounts, hideBitcoin]);

  const netWorth: NetWorthSnapshot | null = useMemo(() => {
    if (!accounts.length) return null;
    const latestSnaps: Record<string, BalanceSnapshot> = {};
    for (const account of accounts) {
      if (account.latest_snapshot) {
        latestSnaps[account.id] = account.latest_snapshot as BalanceSnapshot;
      }
    }
    return computeNetWorth(accounts, latestSnaps);
  }, [accounts]);

  // Change vs previous snapshot
  const prev = history.length >= 2 ? history[history.length - 2].total : null;
  const current = history.length ? history[history.length - 1].total : null;
  const change = prev && current ? current - prev : null;
  const changePct = prev && change ? change / prev : null;

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
  const isGBP = displayCurrency === 'GBP';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Family financial overview</p>
        </div>
        {/* Currency switcher — mobile only (desktop uses sidebar) */}
        <div className="lg:hidden flex gap-1">
          {['GBP', 'USD', 'EUR', 'CAD', 'SGD'].map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c as import('@/lib/types').Currency)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                displayCurrency === c ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Net worth hero */}
      <div className="card bg-gradient-to-br from-primary-700 to-primary-900 text-white border-0 shadow-lg">
        <p className="text-sm text-primary-200 font-medium mb-1">Total Net Worth</p>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-4xl font-bold tracking-tight">
              {netWorth ? fmt(netWorth.total_gbp) : '—'}
              {fxLoading && <span className="text-lg opacity-50 ml-2">…</span>}
            </p>
            {!isGBP && netWorth && (
              <p className="text-sm text-primary-300 mt-0.5">{mask(formatCurrency(netWorth.total_gbp))} GBP</p>
            )}
          </div>
          {change !== null && changePct !== null && (
            <div className={`flex items-center gap-1 mb-1 text-sm font-medium ${change >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {fmt(Math.abs(change))}
              <span className="opacity-75">({mask(formatPercent(Math.abs(changePct)))})</span>
            </div>
          )}
        </div>
        {netWorth && (
          <div className="flex gap-6 mt-3 pt-3 border-t border-white/20">
            <div>
              <p className="text-xs text-primary-300">Assets</p>
              <p className="text-sm font-semibold">{fmt(netWorth.assets_gbp)}</p>
            </div>
            <div>
              <p className="text-xs text-primary-300">Liabilities</p>
              <p className="text-sm font-semibold">−{fmt(netWorth.liabilities_gbp)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Net worth chart */}
      {history.length > 1 && (
        <div className="card">
          <p className="card-title">Net worth over time</p>
          <NetWorthChart data={history} />
        </div>
      )}

      {/* Net worth growth */}
      {history.length > 1 && (
        <div className="card">
          <p className="card-title">Net worth growth</p>
          <NetWorthGrowth history={history} />
        </div>
      )}

      {/* Two-col: asset breakdown + family members */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Asset breakdown */}
        <div className="card">
          <p className="card-title">By asset class</p>
          {netWorth ? (
            <AssetBreakdown byCategory={netWorth.by_category} totalGBP={Math.abs(netWorth.assets_gbp)} />
          ) : (
            <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>
          )}
        </div>

        {/* Family members */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="card-title mb-0">By family member</p>
            <Users className="w-4 h-4 text-gray-300" />
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Add family members in Settings
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member, i) => {
                const memberNW = netWorth?.by_member[member.id] ?? 0;
                const pct = netWorth && netWorth.total_gbp > 0
                  ? memberNW / netWorth.total_gbp
                  : 0;
                const age = ageFromDob(member.date_of_birth);
                return (
                  <div key={member.id} className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                      style={{ backgroundColor: member.color || MEMBER_COLORS[i % MEMBER_COLORS.length] }}
                    >
                      {member.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.name}
                          {age !== null && (
                            <span className="text-xs text-gray-400 ml-1.5">age {age}</span>
                          )}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">
                          {fmt(memberNW)}
                        </p>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(0, Math.min(100, pct * 100))}%`,
                            backgroundColor: member.color || MEMBER_COLORS[i % MEMBER_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent accounts */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <p className="card-title mb-0">Accounts snapshot</p>
          <p className="text-xs text-gray-400">Latest balances</p>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No accounts yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {accounts.slice(0, 8).map((account) => {
              const snap = account.latest_snapshot as BalanceSnapshot | null;
              const member = account.family_member_id ? memberMap[account.family_member_id] : null;
              return (
                <div key={account.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
                    <p className="text-xs text-gray-400">
                      {account.provider && `${account.provider} · `}
                      {member?.name}
                      {snap && ` · ${formatDate(snap.snapshot_date, 'd MMM')}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-semibold ${account.is_liability ? 'text-red-500' : 'text-gray-900'}`}>
                      {snap
                        ? `${account.is_liability ? '−' : ''}${mask(formatCurrency(snap.gbp_balance))}`
                        : <span className="text-gray-300">No data</span>}
                    </p>
                    {snap && snap.currency !== 'GBP' && (
                      <p className="text-xs text-gray-400">
                        {mask(formatCurrency(snap.balance, snap.currency))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {accounts.length > 8 && (
              <div className="pt-2.5">
                <a href="/accounts" className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
                  View all {accounts.length} accounts <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
