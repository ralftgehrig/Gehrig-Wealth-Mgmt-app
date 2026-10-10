'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPercent } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import { buildNetWorthGrowth, type NetWorthHistoryPoint } from '@/lib/calculations/net-worth';

const YEARS = 5;

interface NetWorthGrowthProps {
  history: NetWorthHistoryPoint[];
}

function GrowthTile({
  label,
  change,
  changePct,
  emphasis,
}: {
  label: string;
  change: number | null;
  changePct: number | null;
  emphasis?: boolean;
}) {
  const { fmt, mask } = useDisplayCurrency();

  if (change === null || changePct === null) {
    return (
      <div className={`rounded-xl p-3 ${emphasis ? 'bg-primary-50' : 'bg-gray-50'}`}>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-sm text-gray-300 mt-1.5">No data</p>
      </div>
    );
  }

  const positive = change >= 0;
  const tone = positive ? 'text-green-600' : 'text-red-500';
  return (
    <div className={`rounded-xl p-3 ${emphasis ? 'bg-primary-50' : 'bg-gray-50'}`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <div className={`flex items-center gap-1 mt-1 ${tone}`}>
        {positive ? <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />}
        <p className="text-lg font-bold">{mask(formatPercent(changePct))}</p>
      </div>
      <p className={`text-xs mt-0.5 ${tone}`}>{mask(fmt(change))}</p>
    </div>
  );
}

export default function NetWorthGrowth({ history }: NetWorthGrowthProps) {
  const { fmt, mask } = useDisplayCurrency();
  const growth = buildNetWorthGrowth(history, YEARS);

  // Chronological left to right, current (in-progress) year rightmost.
  const chartData = [
    ...growth.byYear.map((y) => ({
      label: String(y.year),
      pct: y.changePct !== null ? Math.round(y.changePct * 1000) / 10 : null,
      partial: false,
    })),
    {
      label: 'YTD',
      pct: growth.ytd.changePct !== null ? Math.round(growth.ytd.changePct * 1000) / 10 : null,
      partial: true,
    },
  ];
  const hasChartData = chartData.some((d) => d.pct !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {growth.byYear.map((y) => (
          <GrowthTile key={y.year} label={String(y.year)} change={y.change} changePct={y.changePct} />
        ))}
        <GrowthTile label="YTD" change={growth.ytd.change} changePct={growth.ytd.changePct} emphasis />
      </div>

      {hasChartData && (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis
              tickFormatter={(v: number) => mask(`${v}%`)}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v: number | string) => (v === null || v === undefined ? 'No data' : mask(`${Number(v).toFixed(1)}%`))}
              contentStyle={{ borderRadius: '12px', border: '1px solid #f3f4f6', fontSize: '12px' }}
            />
            <Bar dataKey="pct" radius={[6, 6, 6, 6]}>
              {chartData.map((d, i) => {
                const color = d.pct === null ? '#e5e7eb' : d.pct >= 0 ? '#22c55e' : '#ef4444';
                return <Cell key={i} fill={color} fillOpacity={d.partial ? 0.5 : 1} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* 5-year cumulative total */}
      {growth.cumulative.change !== null && growth.cumulative.changePct !== null && (
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {growth.cumulative.fromYear}–{growth.cumulative.toYear} total
          </p>
          <div className={`flex items-center gap-2 ${growth.cumulative.change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {growth.cumulative.change >= 0
              ? <TrendingUp className="w-4 h-4 flex-shrink-0" />
              : <TrendingDown className="w-4 h-4 flex-shrink-0" />}
            <p className="text-base font-bold">{mask(formatPercent(growth.cumulative.changePct))}</p>
            <p className="text-sm font-semibold">{mask(fmt(growth.cumulative.change))}</p>
          </div>
        </div>
      )}
    </div>
  );
}
