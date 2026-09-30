'use client';

import { useEffect, useRef, useState } from 'react';
import { Sankey, Tooltip } from 'recharts';
import type { SankeyChartData } from '@/lib/spending/sankey';

interface IncomeExpenseSankeyProps {
  data: SankeyChartData;
  fmt: (v: number, compact?: boolean) => string;
}

/** Recharts clones this element with layout props (x, y, width, height, payload) merged in;
 * our own `chartWidth`/`fmt` props survive that merge since they aren't part of the clone config. */
function SankeyNodeShape(props: any) {
  const { x, y, width, height, payload, chartWidth, fmt } = props;
  const isLeftHalf = x < chartWidth / 2;
  const labelX = isLeftHalf ? x + width + 8 : x - 8;
  const textAnchor = isLeftHalf ? 'start' : 'end';
  // Small slivers can pack in tightly enough that a two-line label would overlap its neighbours —
  // thin those out first (name only), then drop the label entirely, relying on the hover tooltip.
  const showValue = height >= 20;
  const showName = height >= 9;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={payload.color} fillOpacity={0.9} rx={2} />
      {showName && (
        <text
          x={labelX}
          y={showValue ? y + height / 2 - 5 : y + height / 2 + 3.5}
          textAnchor={textAnchor}
          fontSize={11}
          fontWeight={600}
          fill="#374151"
        >
          {payload.name}
        </text>
      )}
      {showValue && (
        <text x={labelX} y={y + height / 2 + 9} textAnchor={textAnchor} fontSize={10} fill="#9ca3af">
          {fmt(payload.value, true)}
        </text>
      )}
    </g>
  );
}

// Passed as a JSX element (not a bare function) so its useState works: Sankey's own node/link
// prop plumbing calls a bare function directly outside React's render cycle, where hooks aren't legal.
function SankeyLinkShape(props: any) {
  const { sourceX, sourceY, targetX, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  const [hover, setHover] = useState(false);
  const color = payload?.source?.color ?? '#94a3b8';
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(linkWidth, 1)}
      strokeOpacity={hover ? 0.5 : 0.22}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ transition: 'stroke-opacity 120ms ease' }}
    />
  );
}

function SankeyTooltipContent({ active, payload, fmt }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  // recharts' Sankey wraps things one level deeper than most charts: item.payload is the node's
  // (or link's) *layout* props (x/y/width/height, or sourceX/targetX/...), not our own data — our
  // {name, color, category} is nested one level further, at item.payload.payload. For a link,
  // that inner object's `source`/`target` are the two endpoint nodes themselves (already flat,
  // not double-nested), so their `.name`/`.category` are read directly off them.
  const inner = item?.payload?.payload;
  const isLink = !!(inner?.source && inner?.target);
  const title = isLink ? `${inner.source.name} → ${inner.target.name}` : inner?.name ?? item.name;
  // For a link, the target is the more specific end (e.g. a subcategory) — its category is the
  // useful context. For a node, use its own category.
  const category = isLink ? inner.target.category : inner?.category;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-900">{title}</p>
      {category && <p className="text-gray-400">{category}</p>}
      <p className="text-gray-600 mt-0.5">{fmt(item.value)}</p>
    </div>
  );
}

export default function IncomeExpenseSankey({ data, fmt }: IncomeExpenseSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const height = Math.min(1400, Math.max(760, data.nodes.length * 32));

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      {width > 0 && (
        <Sankey
          width={width}
          height={height}
          data={data}
          nodeWidth={14}
          nodePadding={10}
          linkCurvature={0.5}
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          node={<SankeyNodeShape chartWidth={width} fmt={fmt} />}
          link={<SankeyLinkShape />}
        >
          <Tooltip content={(props: any) => <SankeyTooltipContent {...props} fmt={fmt} />} />
        </Sankey>
      )}
    </div>
  );
}
