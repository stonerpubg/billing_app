import { useState, useRef, useEffect } from 'react';
import { downloadCsv } from '../utils/csv.js';

// One button that lets the user pick CSV or PDF. Used by list pages
// (Payroll, Expenses, Employees, etc.) so we don't clutter the page header
// with two separate buttons.
//
// Props:
//   filename        — used for both CSV filename and PDF report title
//   title           — optional PDF title (defaults to filename)
//   subtitle        — optional PDF subtitle
//   period          — optional { from, to } shown in PDF header
//   columns         — [{ key, label, align?, format? }]
//                     format is only used by CSV via `get`; PDF pre-formats client-side.
//   rows            — array of data rows
//   tiles           — optional [{ label, value, tone? }] for PDF summary strip
//   totals          — optional [{ text, align?, colSpan? }] for PDF totals row
//   disabled        — disable when no data
export default function ExportButton({
  filename,
  title,
  subtitle,
  period,
  columns,
  rows,
  tiles,
  totals,
  disabled,
  size = 'sm',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const exportCsv = () => {
    setOpen(false);
    const cols = columns.map((c) => ({ key: c.key, label: c.label, get: c.get }));
    downloadCsv(filename, rows, cols);
  };

  const exportPdf = async () => {
    setOpen(false);
    setBusy(true);
    try {
      // Pre-format cells — functions don't survive JSON transport to the server.
      const preparedRows = rows.map((r) => {
        const flat = {};
        columns.forEach((c) => {
          const raw = c.get ? c.get(r) : r[c.key];
          flat[c.key] = c.format ? c.format(raw, r) : (raw == null ? '' : String(raw));
        });
        return flat;
      });
      const cleanCols = columns.map((c) => ({
        key: c.key,
        label: c.label,
        align: c.align,
        width: c.pdfWidth,
      }));
      const payload = {
        title: title || filename,
        subtitle,
        period,
        tiles: tiles || undefined,
        columns: cleanCols,
        rows: preparedRows,
        totals: totals ? { cells: totals } : undefined,
      };
      const res = await window.api.reports.pdf(payload);
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = (filename.endsWith('.pdf') ? filename : filename + '.pdf');
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 100);
    } finally { setBusy(false); }
  };

  const btnSize = size === 'xs' ? 'text-xs py-1 px-2' : 'text-xs py-1.5 px-3';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy}
        className={'btn-secondary ' + btnSize + (disabled ? ' opacity-50 cursor-not-allowed' : '')}
      >
        {busy ? 'Exporting…' : '↓ Export ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 w-40 rounded-md border border-slate-200 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={exportCsv}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="text-slate-400">📄</span>
            CSV (spreadsheet)
          </button>
          <button
            type="button"
            onClick={exportPdf}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="text-slate-400">📕</span>
            PDF (printable)
          </button>
        </div>
      )}
    </div>
  );
}
