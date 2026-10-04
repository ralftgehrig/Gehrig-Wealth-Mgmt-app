'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatPercent } from '@/lib/utils';
import { useDisplayCurrency } from '@/lib/display-currency';
import { buildNetWorthGrowth, type NetWorthHistoryPoint } from '@/lib/calculations/net-worth';

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
  const { mask } = useDisplayCurrency();
  const growth = buildNetWorthGrowth(history);

  const chartData = growth.byYear.map((y) => ({
    year: String(y.year),
    pct: y.changePct !== null ? Math.round(y.changePct * 1000) / 10 : null,
  }));
  const hasChartData = chartData.some((d) => d.pct !== null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <GrowthTile label="Year to date" change={growth.ytd.change} changePct={growth.ytd.changePct} emphasis />
        {growth.byYear.map((y) => (
          <GrowthTile key={y.year} label={String(y.year)} change={y.change} changePct={y.changePct} />
        ))}
        <GrowthTile
          label={`${growth.cumulative.fromYear}–${growth.cumulative.toYear}`}
          change={growth.cumulative.change}
          changePct={growth.cumulative.changePct}
          emphasis
        />
      </div>

      {hasChartData && (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
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
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.pct === null ? '#e5e7eb' : d.pct >= 0 ? '#22c55e' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
