import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import { TrendChart, CategoryDonut, GrowthChart } from '../components/Charts.jsx';
import { inr } from '../utils/format.js';

const Tile = ({ label, value, hint, tone = 'text-slate-900', to }) => {
  const inner = (
    <div className="card card-body h-full">
      <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90 transition">{inner}</Link> : inner;
};

const BigTile = ({ label, value, hint, tone, to, icon }) => {
  const inner = (
    <div className="card card-body h-full">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">{label}</div>
        {icon && <span className={'text-xl ' + tone}>{icon}</span>}
      </div>
      <div className={`mt-2 text-3xl font-bold ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="block hover:opacity-90 transition">{inner}</Link> : inner;
};

const Section = ({ title, subtitle, children, right }) => (
  <div className="mb-8">
    <div className="flex items-end justify-between mb-3 pb-2 border-b border-slate-200">
      <div>
        <h2 className="text-sm uppercase tracking-wider font-bold text-slate-700">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
    {children}
  </div>
);

// Local date -> YYYY-MM-DD (no UTC shift)
function isoDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Compute {from, to} for each Trends preset. Week convention: Sunday -> Saturday.
function rangeForTrendPreset(key) {
  const now = new Date();
  if (key === 'this_week') {
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return { from: isoDay(sun), to: isoDay(sat) };
  }
  if (key === 'last_week') {
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay() - 7);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return { from: isoDay(sun), to: isoDay(sat) };
  }
  if (key === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: isoDay(start), to: isoDay(end) };
  }
  if (key === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: isoDay(start), to: isoDay(end) };
  }
  if (key === 'this_year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  if (key === 'last_year') {
    const y = now.getFullYear() - 1;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: null, to: null };
}

const PERIODS = [
  { key: 'this_month', label: 'This month' },
  { key: 'this_year', label: 'This year' },
  { key: 'all_time', label: 'All time' },
];

// Trends toolbar: three built-in counts + six calendar presets + custom range.
const TREND_PRESETS = [
  { key: 'last_12_weeks',  label: 'Last 12 weeks',  kind: 'count',    granularity: 'week' },
  { key: 'last_12_months', label: 'Last 12 months', kind: 'count',    granularity: 'month' },
  { key: 'last_5_years',   label: 'Last 5 years',   kind: 'count',    granularity: 'year' },
  { key: 'this_week',      label: 'This week',      kind: 'calendar' },
  { key: 'last_week',      label: 'Last week',      kind: 'calendar' },
  { key: 'this_month',     label: 'This month',     kind: 'calendar' },
  { key: 'last_month',     label: 'Last month',     kind: 'calendar' },
  { key: 'this_year',      label: 'This year',      kind: 'calendar' },
  { key: 'last_year',      label: 'Last year',      kind: 'calendar' },
  { key: 'custom',         label: 'Custom',         kind: 'custom' },
];

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState('this_month');
  const [trendPresetKey, setTrendPresetKey] = useState('last_12_months');
  const [trendCustom, setTrendCustom] = useState(() => rangeForTrendPreset('this_month'));
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    window.api.dashboard.stats().then(setStats);
  }, []);

  useEffect(() => {
    const preset = TREND_PRESETS.find((p) => p.key === trendPresetKey);
    if (!preset) return;
    if (preset.kind === 'count') {
      window.api.reports.dashboardTrend(preset.granularity).then(setTrend);
    } else {
      const range = preset.kind === 'custom' ? trendCustom : rangeForTrendPreset(preset.key);
      if (range.from && range.to) {
        window.api.reports.dashboardTrendForRange(range.from, range.to).then(setTrend);
      }
    }
  }, [trendPresetKey, trendCustom]);

  if (!stats) return <div className="text-slate-500">Loading…</div>;

  const trendPreset = TREND_PRESETS.find((p) => p.key === trendPresetKey);
  // Chart-title suffix uses either the label or the actual custom range.
  const trendRangeLabel =
    trendPreset?.kind === 'custom' && trendCustom.from && trendCustom.to
      ? `${trendCustom.from} → ${trendCustom.to}`
      : (trendPreset?.label.toLowerCase() || '');
  // Growth-chart subtitle: still uses "-over-" phrasing for count presets, else "over this period".
  const trendGrowthSubtitle =
    trendPreset?.kind === 'count'
      ? (trendPreset.granularity === 'week' ? 'week-over-week' : trendPreset.granularity === 'year' ? 'year-over-year' : 'month-over-month')
      : 'over this period';

  const income = stats.income[period] || 0;
  const expense = stats.expense[period] || 0;
  const extraExpense = stats.extra_expense?.[period] || 0;
  const net = stats.net[period] || 0;
  const netTone = net >= 0 ? 'text-emerald-700' : 'text-red-700';
  const periodLabel = PERIODS.find((p) => p.key === period).label;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Money in, money out, work outstanding."
      />

      {/* ═══════════ 1. MONEY SUMMARY ═══════════ */}
      <Section
        title="💰 Money summary"
        subtitle={`Income, expenses, and net — ${periodLabel.toLowerCase()}`}
        right={
          <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={
                  'px-3 py-1.5 rounded text-xs font-medium transition ' +
                  (period === p.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-800')
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <BigTile label="Income" value={inr(income)} tone="text-emerald-700" hint="Payments received" icon="▲" />
          <BigTile label="Expenses (deducted)" value={inr(expense)} tone="text-red-700" to="/expenses" hint="Reduce P&amp;L" icon="▼" />
          <BigTile
            label="Extra expenses"
            value={inr(extraExpense)}
            tone="text-orange-700"
            to="/expenses"
            hint="Tracked but not deducted"
            icon="◆"
          />
          <BigTile
            label={net >= 0 ? 'Net surplus' : 'Net deficit'}
            value={inr(Math.abs(net))}
            tone={netTone}
            hint="Income − Expenses (deducted)"
            icon={net >= 0 ? '=' : '!'}
          />
        </div>

        {/* Recent extra-expense items — what's being tracked as "extra" */}
        {stats.extra_expense?.recent_items && stats.extra_expense.recent_items.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <div className="card-title text-sm">◆ Recent extra-expense items</div>
              <Link to="/expenses" className="text-xs text-brand-600 hover:underline">Manage in Expenses</Link>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th text-xs">Date</th>
                  <th className="th text-xs">Category</th>
                  <th className="th text-xs">Description</th>
                  <th className="th text-xs">Vendor</th>
                  <th className="th text-xs text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {stats.extra_expense.recent_items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="td text-xs whitespace-nowrap">{it.expense_date}</td>
                    <td className="td text-xs">{it.category || '—'}</td>
                    <td className="td text-xs">{it.description || '—'}</td>
                    <td className="td text-xs">{it.vendor_name || '—'}</td>
                    <td className="td text-xs text-right font-semibold text-orange-700 whitespace-nowrap">{inr(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ═══════════ 2. RECEIVABLES ═══════════ */}
      <Section title="📥 Receivables" subtitle="Money yet to come in">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <BigTile
            label="Total outstanding"
            value={inr(stats.receivables.total_outstanding)}
            tone="text-amber-700"
            to="/invoices"
            hint="Across all customers"
          />
          <div className="card card-body">
            <div className="text-[10px] uppercase font-semibold text-emerald-700">0 – 30 days</div>
            <div className="text-lg font-bold text-emerald-900 mt-1">{inr(stats.receivables.aging.b0_30)}</div>
            <div className="text-xs text-slate-500 mt-1">Recent, healthy</div>
          </div>
          <div className="card card-body">
            <div className="text-[10px] uppercase font-semibold text-amber-700">31 – 60 days</div>
            <div className="text-lg font-bold text-amber-900 mt-1">{inr(stats.receivables.aging.b31_60)}</div>
            <div className="text-xs text-slate-500 mt-1">Follow up soon</div>
          </div>
          <div className="card card-body">
            <div className="text-[10px] uppercase font-semibold text-red-700">60+ days</div>
            <div className="text-lg font-bold text-red-900 mt-1">{inr(stats.receivables.aging.b60_plus)}</div>
            <div className="text-xs text-slate-500 mt-1">Overdue, call now</div>
          </div>
        </div>
        {stats.receivables.top_customers && stats.receivables.top_customers.length > 0 && (
          <div className="card card-body">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
              Top outstanding customers
            </div>
            <div className="space-y-1">
              {stats.receivables.top_customers.map((c) => (
                <div key={c.customer_id || 'unknown'} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                  <span>{c.customer_name || '—'} <span className="text-xs text-slate-500">({c.invoices} inv)</span></span>
                  <span className="font-semibold text-red-700">{inr(c.balance)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* ═══════════ 2b. VENDOR PAYABLES (credit tracking) ═══════════ */}
      {stats.payables && (
        <Section title="📤 Vendor payables" subtitle="Money you owe to vendors (credit + partial-paid material)">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BigTile
              label="Total owing"
              value={inr(stats.payables.total_owed)}
              tone="text-orange-700"
              to="/expenses"
              hint={`${stats.payables.item_count} open item${stats.payables.item_count === 1 ? '' : 's'}`}
              icon="◆"
            />
            <div className="card card-body lg:col-span-2">
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                Top vendors we owe
              </div>
              {stats.payables.top_vendors.length === 0 ? (
                <div className="text-sm text-slate-500 italic">All vendor bills fully paid. 👌</div>
              ) : (
                <div className="space-y-1">
                  {stats.payables.top_vendors.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-100 last:border-0">
                      <span>{v.vendor_name} <span className="text-xs text-slate-500">({v.items} item{v.items === 1 ? '' : 's'})</span></span>
                      <span className="font-semibold text-orange-700">{inr(v.balance)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-slate-400 mt-2">
                <Link to="/reports/credit" className="text-brand-600 hover:underline">→ Full credit report</Link>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ═══════════ 3. SALES PIPELINE ═══════════ */}
      {stats.pipeline && (
        <Section title="📈 Sales pipeline" subtitle="Quotations lifecycle: Billed → Received → Pending">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Tile
              label="Billed"
              value={inr(stats.pipeline.billed_value)}
              hint={stats.pipeline.billed_count + ' quotations'}
              tone="text-emerald-700"
            />
            <Tile
              label="Received"
              value={inr(stats.pipeline.billed_received)}
              hint="Payments on billed"
              tone="text-emerald-700"
            />
            <Tile
              label="Balance"
              value={inr(stats.pipeline.billed_balance)}
              hint="Billed − Received"
              tone={stats.pipeline.billed_balance > 0 ? 'text-red-700' : 'text-slate-500'}
            />
            <Tile
              label="Not billed"
              value={String(stats.pipeline.pending_count)}
              hint={inr(stats.pipeline.pending_value) + ' pending'}
              tone="text-amber-700"
              to="/quotations"
            />
            <Tile
              label="Conversion"
              value={stats.pipeline.conversion_rate + '%'}
              hint="Billed / (Billed + Not Billed)"
              tone={stats.pipeline.conversion_rate >= 50 ? 'text-emerald-700' : 'text-amber-700'}
            />
          </div>
        </Section>
      )}

      {/* ═══════════ 4. TRENDS & CHARTS ═══════════ */}
      <Section
        title="📊 Trends"
        subtitle="Long-term picture"
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md justify-end max-w-[520px]">
              {TREND_PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTrendPresetKey(p.key)}
                  className={
                    'px-2.5 py-1 rounded text-xs font-medium transition whitespace-nowrap ' +
                    (trendPresetKey === p.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-800')
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            {trendPreset?.kind === 'custom' && (
              <div className="flex items-center gap-2 text-xs">
                <label className="text-slate-500">From</label>
                <input
                  type="date"
                  className="input py-1 text-xs"
                  value={trendCustom.from || ''}
                  onChange={(e) => setTrendCustom((r) => ({ ...r, from: e.target.value || null }))}
                />
                <label className="text-slate-500">To</label>
                <input
                  type="date"
                  className="input py-1 text-xs"
                  value={trendCustom.to || ''}
                  onChange={(e) => setTrendCustom((r) => ({ ...r, to: e.target.value || null }))}
                />
              </div>
            )}
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="card card-body lg:col-span-2">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-3">
              Income vs Expense — {trendRangeLabel}
            </div>
            <TrendChart data={trend || []} />
          </div>
          <div className="card card-body">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-3">
              Expense mix
            </div>
            <CategoryDonut data={stats.expenseByCategory || []} />
          </div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-3">
            Profit growth — {trendGrowthSubtitle}
          </div>
          <GrowthChart data={trend || []} />
        </div>
      </Section>

      {/* ═══════════ 5. BUSINESS ANALYTICS ═══════════ */}
      {trend && trend.length > 0 && (
        <Section
          title={`📋 ${trendPreset?.label || 'Performance'}`}
          subtitle="Numbers behind the charts (follows the Trends filter above)"
        >
          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Period</th>
                    <th className="th text-right">Billed</th>
                    <th className="th text-right">Invoiced</th>
                    <th className="th text-right">Income</th>
                    <th className="th text-right">Expenses</th>
                    <th className="th text-right">Net</th>
                    <th className="th text-right">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((m) => (
                    <tr key={m.month} className="hover:bg-slate-50">
                      <td className="td font-medium">{m.label}</td>
                      <td className="td text-right">{inr(m.billed)}</td>
                      <td className="td text-right">{inr(m.invoiced)}</td>
                      <td className="td text-right text-emerald-700">{inr(m.income)}</td>
                      <td className="td text-right text-red-700">{inr(m.expense)}</td>
                      <td className={'td text-right font-semibold ' + (m.net >= 0 ? 'text-emerald-700' : 'text-red-700')}>{inr(m.net)}</td>
                      <td className={'td text-right text-xs font-semibold ' + (m.growth_pct > 0 ? 'text-emerald-700' : m.growth_pct < 0 ? 'text-red-700' : 'text-slate-400')}>
                        {m.growth_pct > 0 ? '▲' : m.growth_pct < 0 ? '▼' : '·'} {Math.abs(m.growth_pct).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* ═══════════ 6. FOLLOW-UPS ═══════════ */}
      {stats.followUps && stats.followUps.length > 0 && (
        <Section title="⏰ Follow-up needed" subtitle="Oldest pending quotations">
          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Pending &gt; 7 days</div>
              <Link to="/quotations" className="text-sm text-brand-600 hover:underline">View all</Link>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Number</th>
                  <th className="th">Customer</th>
                  <th className="th">Phone</th>
                  <th className="th">Subject</th>
                  <th className="th text-right">Value</th>
                  <th className="th text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {stats.followUps.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="td font-semibold">
                      <Link to={`/quotations/${f.id}`} className="text-brand-700 hover:underline">{f.quote_number}</Link>
                    </td>
                    <td className="td">{f.customer_name || '—'}</td>
                    <td className="td text-xs">{f.customer_phone || '—'}</td>
                    <td className="td max-w-xs truncate">{f.subject || '—'}</td>
                    <td className="td text-right font-semibold">{inr(f.grand_total)}</td>
                    <td className={'td text-right text-xs font-medium ' + (f.age_days > 30 ? 'text-red-700' : f.age_days > 14 ? 'text-amber-700' : 'text-slate-500')}>
                      {f.age_days} d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ═══════════ 7. AT A GLANCE ═══════════ */}
      <Section title="🔢 At a glance" subtitle="Record counts across the app">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Tile label="Quotations" value={stats.totals.total_quotes || 0} to="/quotations" />
          <Tile label="Invoices" value={stats.invoiceCount || 0} to="/invoices" />
          <Tile label="Customers" value={stats.customersCount || 0} />
          <Tile label="Employees" value={stats.employeeCount || '—'} to="/employees" />
        </div>
      </Section>

      {/* ═══════════ 8. RECENT ACTIVITY ═══════════ */}
      <Section title="🕒 Recent quotations">
        <div className="card">
          <div className="card-header">
            <div className="card-title text-sm">Latest 10</div>
            <Link to="/quotations" className="text-sm text-brand-600 hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th whitespace-nowrap">Number</th>
                  <th className="th whitespace-nowrap">Date</th>
                  <th className="th">Customer</th>
                  <th className="th">Subject</th>
                  <th className="th text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.length === 0 && (
                  <tr><td colSpan={5} className="td text-center text-slate-500 py-8">No quotations yet.</td></tr>
                )}
                {stats.recent.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="td font-medium whitespace-nowrap">
                      <Link to={`/quotations/${r.id}`} className="text-brand-700 hover:underline">{r.quote_number}</Link>
                    </td>
                    <td className="td whitespace-nowrap">{r.quote_date}</td>
                    <td className="td max-w-[220px] truncate" title={r.customer_name || ''}>{r.customer_name || '—'}</td>
                    <td className="td max-w-[280px] truncate" title={r.subject || ''}>{r.subject || '—'}</td>
                    <td className="td text-right font-semibold whitespace-nowrap">{inr(r.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </>
  );
}
