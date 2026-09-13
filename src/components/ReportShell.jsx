import { useEffect, useMemo, useState } from 'react';
import PageHeader from './PageHeader.jsx';
import ExportButton from './ExportButton.jsx';
import { inr } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

function firstOfYear() { return new Date().getFullYear() + '-01-01'; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// A shared report page shell: date filter (optional), summary tiles, table body, CSV + PDF export.
// Props:
//   title, subtitle
//   loader(filters) -> Promise<data>            — fetches the report
//   render(data) -> { tiles, columns, rows, totals?, meta? }
//   defaultFilters: { from, to } or {}
//   showDateFilter: boolean (default true)
//   csvColumns: [{ key, label, get? }] (uses render columns if omitted)
export default function ReportShell({
  title,
  subtitle,
  loader,
  render,
  defaultFilters,
  showDateFilter = true,
  csvFilename,
  searchable,     // if true, shows a name search box; filters rows client-side
  searchKeys,     // array of row keys to search (default ['name','employee_name','code','employee_code'])
  searchPlaceholder,
}) {
  const toast = useToast();
  const [filters, setFilters] = useState(defaultFilters || { from: firstOfYear(), to: todayStr() });
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    loader(clean).then(setData).catch((e) => toast.error(e.message));
  }, [filters.from, filters.to]);

  // Include `render` in deps so a parent that swaps its render function (e.g. the Credit
  // report toggling between line-items and by-vendor views) gets a fresh recompute.
  const rawView = useMemo(() => (data ? render(data) : null), [data, render]);
  const view = useMemo(() => {
    if (!rawView || !searchable || !search.trim()) return rawView;
    const q = search.trim().toLowerCase();
    const keys = searchKeys || ['name', 'employee_name', 'code', 'employee_code', 'role', 'employee_role'];
    const filtered = rawView.rows.filter((r) =>
      keys.some((k) => String(r[k] ?? '').toLowerCase().includes(q))
    );
    return { ...rawView, rows: filtered };
  }, [rawView, search, searchable, searchKeys]);

  const rightBar = view ? (
    <ExportButton
      filename={csvFilename || title}
      title={title}
      subtitle={view.pdfSubtitle || subtitle}
      period={filters.from && filters.to ? filters : undefined}
      tiles={view.tiles}
      columns={view.columns}
      rows={view.rows}
      totals={view.pdfTotals ? view.pdfTotals.cells : view.totals}
      disabled={!view.rows || view.rows.length === 0}
    />
  ) : null;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} right={rightBar} />

      {(showDateFilter || searchable) && (
        <div className="card mb-4">
          <div className="card-body flex flex-wrap items-end gap-3">
            {showDateFilter && (
              <>
                <div>
                  <label className="label">From</label>
                  <input type="date" className="input" value={filters.from || ''}
                    onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input type="date" className="input" value={filters.to || ''}
                    onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
                </div>
              </>
            )}
            {searchable && (
              <div className="flex-1 min-w-[200px]">
                <label className="label">Search</label>
                <input
                  type="text"
                  className="input"
                  placeholder={searchPlaceholder || 'Type employee name or code…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
            {showDateFilter && (
              <div className="text-sm text-slate-500 ml-auto">
                {filters.from} → {filters.to}
                {searchable && search && <span className="ml-2 text-brand-600">· "{search}"</span>}
              </div>
            )}
          </div>
        </div>
      )}

      {!view ? (
        <div className="card card-body text-slate-500">Loading…</div>
      ) : (
        <>
          {view.tiles && view.tiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              {view.tiles.map((t, i) => (
                <div key={i} className="card card-body">
                  <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.label}</div>
                  <div className={
                    'mt-1 text-lg font-bold ' +
                    (t.tone === 'good' ? 'text-emerald-700'
                      : t.tone === 'bad' ? 'text-red-700'
                      : t.tone === 'warn' ? 'text-amber-700'
                      : 'text-slate-900')
                  }>
                    {t.value}
                  </div>
                  {t.hint && <div className="text-xs text-slate-500 mt-1">{t.hint}</div>}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {view.columns.map((c, i) => (
                      <th key={i} className={'th ' + (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '')}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.length === 0 && (
                    <tr>
                      <td colSpan={view.columns.length} className="td text-center text-slate-500 py-10">
                        No data in this period.
                      </td>
                    </tr>
                  )}
                  {view.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {view.columns.map((c, ci) => {
                        const raw = c.get ? c.get(r) : r[c.key];
                        const value = c.format ? c.format(raw, r) : (raw == null ? '—' : String(raw));
                        return (
                          <td key={ci} className={
                            'td whitespace-nowrap ' +
                            (c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '') +
                            (c.bold ? ' font-semibold' : '') +
                            (c.className ? ' ' + c.className(raw, r) : '')
                          }>
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {view.totals && (
                    <tr className="bg-slate-100 font-bold">
                      {view.totals.map((t, i) => (
                        <td
                          key={i}
                          colSpan={t.colSpan || 1}
                          className={
                            'td whitespace-nowrap ' +
                            (t.align === 'right' ? 'text-right' : t.align === 'center' ? 'text-center' : '')
                          }
                        >
                          {t.text}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {view.extra}
        </>
      )}
    </>
  );
}

export { firstOfYear, todayStr, inr };
