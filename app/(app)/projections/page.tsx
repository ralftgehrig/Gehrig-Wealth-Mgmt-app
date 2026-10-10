'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR, { mutate } from 'swr';
import { BarChart3, Plus, Trash2, Zap, Target, Edit2, Scale } from 'lucide-react';
import ProjectionChart from '@/components/projections/ProjectionChart';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { runProjection } from '@/lib/calculations/projections';
import { computeNetWorth } from '@/lib/calculations/net-worth';
import { computePostSettlementPortfolio } from '@/lib/calculations/divorce-settlement';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import { useFeatureFlags } from '@/lib/auth/feature-flags';
import { ACCOUNT_CATEGORY } from '@/lib/types';
import type {
  Account, BalanceSnapshot, FamilyMember, Scenario,
  ScenarioAssumptions, ProjectionResult, AssetCategory, ProjectionEvent, DivorceSettlementDebt
} from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const EVENT_TYPE_LABELS: Record<string, string> = {
  inheritance: 'Inheritance',
  education: 'Education cost',
  property: 'Property',
  income_change: 'Income change',
  retirement: 'Retirement',
  custom: 'Custom event',
};

export default function ProjectionsPage() {
  const { data: accounts = [] } = useSWR<Account[]>('/api/accounts', fetcher);
  const { data: members = [] } = useSWR<FamilyMember[]>('/api/family-members', fetcher);
  const { data: scenarios = [] } = useSWR<Scenario[]>('/api/scenarios', fetcher);
  const { canSeeDivorceSettlement } = useFeatureFlags();
  const { data: settlementDebts = [] } = useSWR<DivorceSettlementDebt[]>(
    canSeeDivorceSettlement ? '/api/divorce-settlement/debts' : null,
    fetcher
  );
  const [showPostSettlement, setShowPostSettlement] = useState(false);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [editingAssumptions, setEditingAssumptions] = useState<ScenarioAssumptions | null>(null);
  const [projResult, setProjResult] = useState<ProjectionResult | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<{ name: string; data: ProjectionResult; color: string }[]>([]);
  const [showNewScenario, setShowNewScenario] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');

  const { mask, privacyMode } = useDisplayCurrency();

  // FIRE state
  const [fireMonthlySpend, setFireMonthlySpend] = useState(4000);
  const [fireRate, setFireRate] = useState(4);

  const baseline = scenarios.find((s) => s.is_baseline);
  const selected = scenarios.find((s) => s.id === selectedScenarioId) ?? baseline ?? scenarios[0];

  const self = members.find((m) => m.relationship === 'self');
  const postSettlementPortfolio = useMemo(
    () => (canSeeDivorceSettlement ? computePostSettlementPortfolio(accounts, members, settlementDebts) : null),
    [accounts, members, settlementDebts, canSeeDivorceSettlement]
  );
  const usingPostSettlement = showPostSettlement && canSeeDivorceSettlement && !!postSettlementPortfolio;

  // Build current portfolio
  const portfolio = useMemo(() => {
    if (!accounts.length) return null;

    if (usingPostSettlement && postSettlementPortfolio) {
      return {
        byCategory: postSettlementPortfolio.byCategory,
        totalGBP: postSettlementPortfolio.totalGBP,
        selfDobYear: self?.date_of_birth ? new Date(self.date_of_birth).getFullYear() : undefined,
      };
    }

    const latestSnaps: Record<string, BalanceSnapshot> = {};
    for (const a of accounts) {
      if (a.latest_snapshot) latestSnaps[a.id] = a.latest_snapshot as BalanceSnapshot;
    }
    const nw = computeNetWorth(accounts, latestSnaps);
    const byCategory: Partial<Record<AssetCategory, number>> = {};
    for (const [cat, val] of Object.entries(nw.by_category) as [AssetCategory, number][]) {
      byCategory[cat] = val;
    }
    return {
      byCategory,
      totalGBP: nw.total_gbp,
      selfDobYear: self?.date_of_birth ? new Date(self.date_of_birth).getFullYear() : undefined,
    };
  }, [accounts, members, self, usingPostSettlement, postSettlementPortfolio]);

  // Run projection when scenario or portfolio changes
  useEffect(() => {
    if (!selected || !portfolio) return;
    const result = runProjection(portfolio, selected.assumptions);
    setProjResult(result);
    setEditingAssumptions(selected.assumptions);
  }, [selected, portfolio]);

  // Comparison runs
  useEffect(() => {
    if (!portfolio || !compareIds.length) {
      setCompareResults([]);
      return;
    }
    const COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];
    const results = compareIds.map((id, i) => {
      const sc = scenarios.find((s) => s.id === id);
      if (!sc) return null;
      const result = runProjection(portfolio, sc.assumptions);
      return { name: sc.name, data: result, color: COLORS[i % COLORS.length] };
    }).filter(Boolean) as { name: string; data: ProjectionResult; color: string }[];
    setCompareResults(results);
  }, [compareIds, portfolio, scenarios]);

  // FIRE calculations
  const fireNumber = (fireMonthlySpend * 12) / (fireRate / 100);

  const fireResult = useMemo(() => {
    if (!projResult) return null;
    const hit = projResult.data.find((d) => d.netWorth >= fireNumber);
    if (hit) return { achieved: true, year: hit.year, age: hit.age, netWorth: hit.netWorth };
    return { achieved: false };
  }, [projResult, fireNumber]);

  const handleSaveAssumptions = async () => {
    if (!selected || !editingAssumptions) return;
    await fetch(`/api/scenarios/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assumptions: editingAssumptions }),
    });
    await mutate('/api/scenarios');
  };

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const base = baseline ?? scenarios[0];
    if (!base) return;
    await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newScenarioName,
        description: '',
        is_baseline: false,
        assumptions: base.assumptions,
      }),
    });
    await mutate('/api/scenarios');
    setShowNewScenario(false);
    setNewScenarioName('');
  };

  const updateReturn = (key: string, value: string) => {
    if (!editingAssumptions) return;
    setEditingAssumptions({
      ...editingAssumptions,
      returns: { ...editingAssumptions.returns, [key]: parseFloat(value) / 100 },
    });
  };

  const addEvent = () => {
    if (!editingAssumptions) return;
    const newEvent: ProjectionEvent = { year: 10, amount: 100000, label: 'New event', type: 'custom' };
    setEditingAssumptions({ ...editingAssumptions, events: [...editingAssumptions.events, newEvent] });
  };

  const updateEvent = (i: number, key: keyof ProjectionEvent, value: string | number) => {
    if (!editingAssumptions) return;
    const events = editingAssumptions.events.map((e, idx) =>
      idx === i ? { ...e, [key]: key === 'amount' || key === 'year' ? Number(value) : value } : e
    );
    setEditingAssumptions({ ...editingAssumptions, events });
  };

  const removeEvent = (i: number) => {
    if (!editingAssumptions) return;
    setEditingAssumptions({
      ...editingAssumptions,
      events: editingAssumptions.events.filter((_, idx) => idx !== i),
    });
  };

  if (!portfolio) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No portfolio data"
        description="Add accounts and update balances first to run projections."
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Scenario modelling for your financial future</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowNewScenario(true)}>
          <Plus className="w-4 h-4" /> New scenario
        </button>
      </div>

      {/* Scenario selector */}
      <div className="flex flex-wrap gap-2">
        {scenarios.map((sc) => (
          <button
            key={sc.id}
            onClick={() => setSelectedScenarioId(sc.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
              selected?.id === sc.id
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-primary-300'
            }`}
          >
            {sc.is_baseline && '⭐ '}{sc.name}
          </button>
        ))}
      </div>

      {/* Post-divorce settlement toggle — visible only to your login */}
      {canSeeDivorceSettlement && (
        <div className="card flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Scale className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Project post-divorce settlement net worth</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Starts the projection from what you&rsquo;d be left with after the settlement — your own accounts,
                plus your half of joint accounts, adjusted for Shannon&rsquo;s premarital debts — instead of your
                current total.
              </p>
              {showPostSettlement && !postSettlementPortfolio && (
                <p className="text-xs text-amber-600 mt-1">
                  Add a family member marked &ldquo;Self&rdquo; in Settings to use this.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showPostSettlement}
            onClick={() => setShowPostSettlement((v) => !v)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              showPostSettlement ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                showPostSettlement ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      )}

      {/* Main projection chart */}
      {projResult && selected && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-semibold text-gray-900">{selected.name}</p>
              <p className="text-xs text-gray-500">
                {selected.assumptions.horizon_years}-year projection · {mask(formatCurrency(portfolio.totalGBP))} today
                {selected.assumptions.simulation_type === 'monte_carlo' && ' · Monte Carlo'}
                {usingPostSettlement && ' · post-settlement'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {usingPostSettlement && <span className="badge badge-blue">Post-settlement</span>}
              {selected.assumptions.simulation_type === 'monte_carlo' && (
                <span className="badge badge-purple">
                  <Zap className="w-3 h-3" /> Monte Carlo
                </span>
              )}
            </div>
          </div>

          <ProjectionChart
            data={projResult.data}
            isMonteCarlo={selected.assumptions.simulation_type === 'monte_carlo'}
            compareData={compareResults.map((c) => ({ name: c.name, data: c.data.data, color: c.color }))}
          />

          {/* Milestones — hidden in privacy mode */}
          {!privacyMode && projResult.milestones.length > 0 && (
            <div className="mt-4 border-t border-gray-50 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Wealth milestones (based on this scenario)</p>
              <div className="flex flex-wrap gap-2">
                {projResult.milestones.map((m) => (
                  <div key={m.label} className="bg-green-50 border border-green-100 rounded-xl px-3 py-2 text-xs">
                    <span className="font-bold text-green-700">{m.label} net worth</span>
                    <span className="text-green-600"> reached in year {m.year} — when you are age {m.age}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compare scenarios */}
      <div className="card">
        <p className="text-sm font-semibold text-gray-900 mb-3">Compare scenarios</p>
        <div className="flex flex-wrap gap-2">
          {scenarios.filter((s) => s.id !== selected?.id).map((sc) => {
            const isCompared = compareIds.includes(sc.id);
            return (
              <button
                key={sc.id}
                onClick={() => setCompareIds((p) => isCompared ? p.filter((id) => id !== sc.id) : [...p, sc.id])}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isCompared
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {isCompared ? '✓ ' : '+ '}{sc.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Assumptions editor */}
      {selected && editingAssumptions && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-900">Assumptions — {selected.name}</p>
            <button className="btn-primary text-xs" onClick={handleSaveAssumptions}>
              Save changes
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Projection horizon (years)</label>
              <input
                className="input"
                type="number"
                value={editingAssumptions.horizon_years}
                onChange={(e) => setEditingAssumptions((p) => p ? { ...p, horizon_years: parseInt(e.target.value) } : p)}
              />
            </div>
            <div>
              <label className="label">Monthly net savings (GBP)</label>
              <input
                className="input"
                type="number"
                value={editingAssumptions.monthly_net_savings}
                onChange={(e) => setEditingAssumptions((p) => p ? { ...p, monthly_net_savings: parseFloat(e.target.value) } : p)}
              />
            </div>
            <div>
              <label className="label">Savings growth rate (%/year)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={(editingAssumptions.savings_growth_rate * 100).toFixed(1)}
                onChange={(e) => setEditingAssumptions((p) => p ? { ...p, savings_growth_rate: parseFloat(e.target.value) / 100 } : p)}
              />
            </div>
            <div>
              <label className="label">Inflation rate (%/year)</label>
              <input
                className="input"
                type="number"
                step="0.1"
                value={(editingAssumptions.inflation_rate * 100).toFixed(1)}
                onChange={(e) => setEditingAssumptions((p) => p ? { ...p, inflation_rate: parseFloat(e.target.value) / 100 } : p)}
              />
            </div>
          </div>

          {/* Return rates */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Annual returns (%)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(editingAssumptions.returns).map(([key, val]) => (
                <div key={key}>
                  <label className="label capitalize">{key}</label>
                  <input
                    className="input"
                    type="number"
                    step="0.5"
                    value={(val * 100).toFixed(1)}
                    onChange={(e) => updateReturn(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Simulation type */}
          <div className="mt-4">
            <label className="label">Simulation type</label>
            <div className="flex gap-2">
              {(['deterministic', 'monte_carlo'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setEditingAssumptions((p) => p ? { ...p, simulation_type: type } : p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    editingAssumptions.simulation_type === type
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {type === 'deterministic' ? 'Deterministic' : 'Monte Carlo'}
                </button>
              ))}
            </div>
            {editingAssumptions.simulation_type === 'monte_carlo' && (
              <div className="mt-2">
                <label className="label">Simulation runs</label>
                <input
                  className="input"
                  type="number"
                  value={editingAssumptions.monte_carlo_runs ?? 500}
                  onChange={(e) => setEditingAssumptions((p) => p ? { ...p, monte_carlo_runs: parseInt(e.target.value) } : p)}
                />
              </div>
            )}
          </div>

          {/* Life events */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Life events</p>
              <button className="btn-secondary text-xs" onClick={addEvent}>
                <Plus className="w-3 h-3" /> Add event
              </button>
            </div>
            {editingAssumptions.events.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No events — add inheritance, education costs, retirement etc.</p>
            )}
            {editingAssumptions.events.map((event, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
                <div>
                  <label className="text-xs text-gray-500">Year</label>
                  <input className="input text-xs py-1.5" type="number" value={event.year} onChange={(e) => updateEvent(i, 'year', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Label</label>
                  <input className="input text-xs py-1.5" value={event.label} onChange={(e) => updateEvent(i, 'label', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Amount (£)</label>
                  <input className="input text-xs py-1.5" type="number" value={event.amount} onChange={(e) => updateEvent(i, 'amount', e.target.value)} placeholder="+/−" />
                </div>
                <div className="flex gap-1">
                  <select className="input text-xs py-1.5 flex-1" value={event.type} onChange={(e) => updateEvent(i, 'type', e.target.value)}>
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button className="btn-danger p-1.5" onClick={() => removeEvent(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FIRE Calculator */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-semibold text-gray-900">FIRE Calculator</p>
          <span className="badge badge-purple">Financial Independence</span>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          FIRE = Financial Independence, Retire Early. Based on your projected net worth, this shows when your investments could generate enough to live on without working — using the safe withdrawal rate.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label">Monthly spending in retirement (£)</label>
            <input className="input" type="number" value={fireMonthlySpend} onChange={(e) => setFireMonthlySpend(parseInt(e.target.value))} />
          </div>
          <div>
            <label className="label">Safe withdrawal rate (%/year)</label>
            <input className="input" type="number" step="0.1" value={fireRate} onChange={(e) => setFireRate(parseFloat(e.target.value))} />
          </div>
          <div className="flex flex-col justify-end">
            <p className="label">Your FIRE number</p>
            <p className="text-xl font-bold text-purple-700">{mask(formatCurrency(fireNumber))}</p>
            <p className="text-xs text-gray-400">{mask(formatCurrency(fireMonthlySpend * 12))}/year ÷ {fireRate}%</p>
          </div>
        </div>
        {fireResult && (
          <div className={`rounded-xl p-4 ${fireResult.achieved ? 'bg-green-50 border border-green-100' : 'bg-purple-50 border border-purple-100'}`}>
            {fireResult.achieved ? (
              <div>
                <p className="text-sm font-bold text-green-700">FIRE achieved in year {fireResult.year} — at age {fireResult.age}</p>
                <p className="text-xs text-green-600 mt-1">Your projected net worth of {mask(formatCurrency(fireResult.netWorth ?? 0))} exceeds your FIRE number of {mask(formatCurrency(fireNumber))}.</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-purple-700">FIRE not reached within {selected?.assumptions.horizon_years} years on this scenario</p>
                <p className="text-xs text-purple-600 mt-1">Projected net worth in year {projResult?.data[projResult.data.length - 1]?.year}: {mask(formatCurrency(projResult?.data[projResult.data.length - 1]?.netWorth ?? 0))} vs FIRE number: {mask(formatCurrency(fireNumber))}. Extend the horizon or increase savings rate.</p>
                <div className="mt-2 h-2 bg-purple-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((projResult?.data[projResult.data.length - 1]?.netWorth ?? 0) / fireNumber) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-purple-500 mt-1">{Math.min(100, Math.round(((projResult?.data[projResult.data.length - 1]?.netWorth ?? 0) / fireNumber) * 100))}% of FIRE number at end of projection</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Per-person projections */}
      {members.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-gray-900 mb-4">Individual projections</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((member) => {
              const memberAccounts = accounts.filter((a) => a.family_member_id === member.id && a.is_active);
              const memberTotal = memberAccounts.reduce((sum, a) => {
                const snap = a.latest_snapshot as BalanceSnapshot | null;
                if (!snap) return sum;
                return sum + (a.is_liability ? -snap.gbp_balance : snap.gbp_balance);
              }, 0);

              if (memberTotal <= 0) return null;

              const age = member.date_of_birth
                ? new Date().getFullYear() - new Date(member.date_of_birth).getFullYear()
                : null;
              const isChild = member.relationship === 'child';
              const yearsTo18 = isChild && age !== null ? Math.max(0, 18 - age) : null;

              // Compute per-member category breakdown
              const byCategory: Partial<Record<AssetCategory, number>> = {};
              for (const a of memberAccounts) {
                const snap = a.latest_snapshot as BalanceSnapshot | null;
                if (!snap) continue;
                const cat = ACCOUNT_CATEGORY[a.account_type] ?? 'cash';
                const val = a.is_liability ? -snap.gbp_balance : snap.gbp_balance;
                byCategory[cat] = (byCategory[cat] ?? 0) + val;
              }

              const horizonYears = isChild && yearsTo18 ? yearsTo18 : 20;

              const memberProjection = selected
                ? runProjection(
                    {
                      byCategory,
                      totalGBP: memberTotal,
                      selfDobYear: member.date_of_birth
                        ? new Date(member.date_of_birth).getFullYear()
                        : undefined,
                    },
                    {
                      ...selected.assumptions,
                      monthly_net_savings: 0,
                      horizon_years: horizonYears,
                    }
                  )
                : null;

              const projectedAt18 =
                isChild && yearsTo18 !== null && yearsTo18 > 0 && memberProjection
                  ? memberProjection.data[yearsTo18 - 1]?.netWorth
                  : null;

              return (
                <div key={member.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                      {age !== null && (
                        <p className="text-xs text-gray-400">
                          Age {age}
                          {isChild && yearsTo18 !== null ? ` · ${yearsTo18} years until 18` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-1">Current total</p>
                  <p className="text-lg font-bold text-gray-900 mb-2">{mask(formatCurrency(memberTotal))}</p>
                  {projectedAt18 !== null && projectedAt18 !== undefined && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs text-blue-600 font-medium">
                        Projected at age 18 (no new contributions, {((selected?.assumptions.returns.equity ?? 0.07) * 100).toFixed(0)}% equity growth)
                      </p>
                      <p className="text-base font-bold text-blue-700">{mask(formatCurrency(projectedAt18))}</p>
                    </div>
                  )}
                  {!isChild && memberProjection && (
                    <div className="bg-gray-50 rounded-lg p-3 mt-2">
                      <p className="text-xs text-gray-500">In 20 years (no added savings, market returns only)</p>
                      <p className="text-base font-bold text-gray-700">{mask(formatCurrency(memberProjection.data[19]?.netWorth ?? 0))}</p>
                    </div>
                  )}
                </div>
              );
            }).filter(Boolean)}
          </div>
        </div>
      )}

      {/* New scenario modal */}
      <Modal open={showNewScenario} onClose={() => setShowNewScenario(false)} title="New scenario">
        <form onSubmit={handleCreateScenario} className="space-y-4">
          <div>
            <label className="label">Scenario name</label>
            <input className="input" value={newScenarioName} onChange={(e) => setNewScenarioName(e.target.value)} placeholder="e.g. Wife returns to work" required />
          </div>
          <p className="text-xs text-gray-500">Starts as a copy of the baseline — edit assumptions afterwards.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setShowNewScenario(false)}>Cancel</button>
            <button type="submit" className="btn-primary flex-1">Create scenario</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
