import { useMemo } from 'react';

// A tiny grouped bar/line chart: income vs expense per month.
// No external dependency — pure SVG.
export function TrendChart({ data, height = 200 }) {
  const width = 700;
  const pad = { l: 44, r: 12, t: 12, b: 28 };

  const { max, coordsIncome, coordsExpense, barW, xForMonth, yForVal, months, ticks } = useMemo(() => {
    const arr = data || [];
    const max = Math.max(1, ...arr.flatMap((d) => [d.income, d.expense]));
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    const step = arr.length > 0 ? innerW / arr.length : 0;
    const barW = Math.max(4, step * 0.28);
    const xForMonth = (i) => pad.l + step * (i + 0.5);
    const yForVal = (v) => pad.t + innerH - (v / max) * innerH;
    const coordsIncome = arr.map((d, i) => ({ x: xForMonth(i), y: yForVal(d.income), v: d.income }));
    const coordsExpense = arr.map((d, i) => ({ x: xForMonth(i), y: yForVal(d.expense), v: d.expense }));
    const months = arr.map((d) => d.label);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({ y: yForVal(max * r), v: max * r }));
    return { max, coordsIncome, coordsExpense, barW, xForMonth, yForVal, months, ticks };
  }, [data, height]);

  const formatK = (v) => {
    if (v >= 10000000) return (v / 10000000).toFixed(1) + 'Cr';
    if (v >= 100000) return (v / 100000).toFixed(1) + 'L';
    if (v >= 1000) return (v / 1000).toFixed(0) + 'k';
    return String(Math.round(v));
  };

  if (!data || data.length === 0) return <div className="text-slate-500 text-sm">No trend data.</div>;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[900px]" preserveAspectRatio="xMidYMid meet">
        {/* Y-axis grid + labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} y1={t.y} x2={width - pad.r} y2={t.y} stroke="#e2e8f0" strokeDasharray="2 3" />
            <text x={pad.l - 6} y={t.y + 3} textAnchor="end" fontSize="9" fill="#64748b">{formatK(t.v)}</text>
          </g>
        ))}

        {/* Bars */}
        {coordsIncome.map((c, i) => {
          const e = coordsExpense[i];
          const bottom = pad.t + (height - pad.t - pad.b);
          return (
            <g key={i}>
              <rect x={c.x - barW} y={c.y} width={barW} height={bottom - c.y} fill="#10b981" rx="1">
                <title>{`${months[i]} — Income: ${c.v.toLocaleString('en-IN')}`}</title>
              </rect>
              <rect x={c.x + 2} y={e.y} width={barW} height={bottom - e.y} fill="#ef4444" rx="1">
                <title>{`${months[i]} — Expense: ${e.v.toLocaleString('en-IN')}`}</title>
              </rect>
            </g>
          );
        })}

        {/* Net-line polyline */}
        {(() => {
          const arr = data.map((d, i) => ({ x: (coordsIncome[i].x + coordsExpense[i].x) / 2, y: yForVal(Math.max(0, d.net)) }));
          const path = arr.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          return (
            <>
              <path d={path} stroke="#2b48d0" strokeWidth="1.5" fill="none" strokeDasharray="4 3" />
              {arr.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#2b48d0">
                  <title>{`${months[i]} — Net: ${data[i].net.toLocaleString('en-IN')}`}</title>
                </circle>
              ))}
            </>
          );
        })()}

        {/* X-axis labels */}
        {months.map((m, i) => (
          <text key={i} x={xForMonth(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">{m}</text>
        ))}

        {/* Baseline */}
        <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#cbd5e1" />
      </svg>
      <div className="flex justify-center gap-4 text-xs text-slate-500 mt-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> Income</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Expense</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-brand-600" /> Net</span>
      </div>
    </div>
  );
}

// Growth bar chart — profit (net) per month with growth-%% overlay.
// Positive bars = surplus (green), negative = deficit (red).
export function GrowthChart({ data, height = 200 }) {
  const width = 700;
  const pad = { l: 44, r: 40, t: 12, b: 28 };
  const arr = data || [];
  if (arr.length === 0) return <div className="text-slate-500 text-sm">No data.</div>;

  const nets = arr.map((d) => d.net);
  const maxAbs = Math.max(1, ...nets.map((v) => Math.abs(v)));
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const zeroY = pad.t + innerH / 2;
  const step = innerW / arr.length;
  const barW = Math.max(6, step * 0.55);
  const xForMonth = (i) => pad.l + step * (i + 0.5);
  const yFor = (v) => zeroY - (v / maxAbs) * (innerH / 2);
  const formatK = (v) => {
    const abs = Math.abs(v);
    if (abs >= 10000000) return (v / 10000000).toFixed(1) + 'Cr';
    if (abs >= 100000) return (v / 100000).toFixed(1) + 'L';
    if (abs >= 1000) return (v / 1000).toFixed(0) + 'k';
    return String(Math.round(v));
  };

  // Growth line: growth_pct axis on the right (independent, from -100..100)
  const growthMax = Math.max(50, ...arr.map((d) => Math.abs(d.growth_pct || 0)));
  const yGrowth = (g) => zeroY - (g / growthMax) * (innerH / 2);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[900px]" preserveAspectRatio="xMidYMid meet">
        {/* zero line */}
        <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke="#94a3b8" strokeWidth="0.6" />
        {/* Y ticks left (net) */}
        {[1, 0.5, 0, -0.5, -1].map((r, i) => (
          <g key={i}>
            <text x={pad.l - 6} y={zeroY - r * (innerH / 2) + 3} textAnchor="end" fontSize="9" fill="#64748b">{formatK(r * maxAbs)}</text>
            <line x1={pad.l} y1={zeroY - r * (innerH / 2)} x2={width - pad.r} y2={zeroY - r * (innerH / 2)} stroke="#e2e8f0" strokeDasharray="2 3" />
          </g>
        ))}
        {/* Y ticks right (growth %) */}
        {[1, 0.5, 0, -0.5, -1].map((r, i) => (
          <text key={'r'+i} x={width - pad.r + 4} y={zeroY - r * (innerH / 2) + 3} textAnchor="start" fontSize="9" fill="#2b48d0">
            {(r * growthMax).toFixed(0)}%
          </text>
        ))}
        {/* Bars */}
        {arr.map((d, i) => {
          const y = yFor(d.net);
          const h = Math.abs(y - zeroY);
          const isPos = d.net >= 0;
          return (
            <g key={i}>
              <rect
                x={xForMonth(i) - barW / 2}
                y={isPos ? y : zeroY}
                width={barW}
                height={h}
                fill={isPos ? '#10b981' : '#ef4444'}
                rx="1.5"
              >
                <title>{`${d.label} — Net: ${d.net.toLocaleString('en-IN')} • Growth: ${d.growth_pct.toFixed(1)}%`}</title>
              </rect>
              <text x={xForMonth(i)} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b">{d.label}</text>
            </g>
          );
        })}
        {/* Growth line */}
        {(() => {
          const pts = arr.map((d, i) => `${xForMonth(i)},${yGrowth(d.growth_pct || 0)}`).join(' ');
          return (
            <>
              <polyline points={pts} fill="none" stroke="#2b48d0" strokeWidth="1.5" strokeDasharray="4 3" />
              {arr.map((d, i) => (
                <circle key={i} cx={xForMonth(i)} cy={yGrowth(d.growth_pct || 0)} r="2.5" fill="#2b48d0">
                  <title>{`${d.label}: growth ${d.growth_pct.toFixed(1)}%`}</title>
                </circle>
              ))}
            </>
          );
        })()}
      </svg>
      <div className="flex justify-center gap-4 text-xs text-slate-500 mt-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> Profit</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Loss</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-brand-600" /> Growth %</span>
      </div>
    </div>
  );
}

// A donut/pie of expense categories
export function CategoryDonut({ data, size = 200 }) {
  const arr = (data || []).filter((d) => d.total > 0);
  const total = arr.reduce((s, d) => s + d.total, 0);
  if (total === 0) return <div className="text-slate-500 text-sm">No expenses yet.</div>;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 12;
  const inner = r * 0.55;
  const palette = ['#2b48d0', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const arcs = [];
  let angle = -Math.PI / 2; // start at top
  arr.forEach((d, i) => {
    const slice = (d.total / total) * Math.PI * 2;
    const a1 = angle;
    const a2 = angle + slice;
    const large = slice > Math.PI ? 1 : 0;
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
    const p3 = [cx + inner * Math.cos(a2), cy + inner * Math.sin(a2)];
    const p4 = [cx + inner * Math.cos(a1), cy + inner * Math.sin(a1)];
    const path = [
      `M ${p1[0]} ${p1[1]}`,
      `A ${r} ${r} 0 ${large} 1 ${p2[0]} ${p2[1]}`,
      `L ${p3[0]} ${p3[1]}`,
      `A ${inner} ${inner} 0 ${large} 0 ${p4[0]} ${p4[1]}`,
      'Z',
    ].join(' ');
    arcs.push({ d, path, color: palette[i % palette.length] });
    angle = a2;
  });

  const money = (n) => n.toLocaleString('en-IN');

  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {arcs.map((a, i) => (
          <path key={i} d={a.path} fill={a.color}>
            <title>{`${a.d.category}: ${money(a.d.total)}`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fill="#64748b">Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="14" fill="#0f172a" fontWeight="700">₹{money(total)}</text>
      </svg>
      <div className="flex-1 min-w-[180px] space-y-1">
        {arcs.map((a, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: a.color }} />
              <span>{a.d.category}</span>
            </div>
            <div className="text-slate-700 font-semibold">
              ₹{money(a.d.total)}
              <span className="text-xs text-slate-400 ml-1">
                ({((a.d.total / total) * 100).toFixed(0)}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
