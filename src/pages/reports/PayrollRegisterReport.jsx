import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

// Human-readable label for a period stored as either 'YYYY-MM' (legacy monthly) or
// 'YYYY-MM-DD_to_YYYY-MM-DD' (new date range).
function periodLabel(p) {
  if (!p) return '';
  if (p.includes('_to_')) {
    const [a, b] = p.split('_to_');
    const fmt = (s) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    return `${fmt(a)} → ${fmt(b)}`;
  }
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
  return p;
}

export default function PayrollRegisterReport() {
  return (
    <ReportShell
      title="Payroll Register"
      subtitle="Every payroll entry whose period overlaps the selected date range."
      loader={(f) => window.api.reports.payrollRegister(f)}
      csvFilename="Payroll Register"
      searchable
      searchPlaceholder="Search employee name / code…"
      render={(data) => ({
        tiles: [
          { label: 'Entries', value: data.rows.length },
          { label: 'Gross', value: inr(data.total_gross) },
          { label: 'Advance deducted', value: inr(data.total_advance_deducted), tone: 'warn' },
          { label: 'Net pay', value: inr(data.total_net) },
          { label: 'Paid', value: inr(data.total_paid), tone: 'good' },
          { label: 'Pending', value: inr(data.total_pending), tone: data.total_pending > 0 ? 'bad' : undefined },
        ],
        columns: [
          { key: 'period', label: 'Period', format: (v) => periodLabel(v) },
          { key: 'employee_code', label: 'Code' },
          { key: 'employee_name', label: 'Employee', bold: true },
          { key: 'pay_mode', label: 'Mode', format: (v) => (v === 'per_shift' ? 'Per-shift' : v === 'weekly' ? 'Weekly' : 'Monthly') },
          { key: 'shifts_worked', label: 'Shifts', align: 'right' },
          { key: 'gross', label: 'Gross', align: 'right', format: (v) => inr(v) },
          { key: 'advance_deduction', label: 'Advance', align: 'right', format: (v) => inr(v) },
          { key: 'net_pay', label: 'Net Pay', align: 'right', format: (v) => inr(v) },
          { key: 'paid', label: 'Status', format: (v, r) => (r.paid ? 'Paid ' + (r.paid_date || '') : 'Pending') },
        ],
        rows: data.rows,
        totals: [
          { text: 'TOTAL', align: 'right', colSpan: 5 },
          { text: inr(data.total_gross), align: 'right' },
          { text: inr(data.total_advance_deducted), align: 'right' },
          { text: inr(data.total_net), align: 'right' },
          {
            align: 'left',
            text: (
              <div className="text-xs leading-tight space-y-0.5">
                <div className="text-emerald-700 whitespace-nowrap">Paid: {inr(data.total_paid)}</div>
                <div className={(data.total_pending > 0 ? 'text-red-700' : 'text-slate-500') + ' whitespace-nowrap'}>
                  Pending: {inr(data.total_pending)}
                </div>
              </div>
            ),
          },
        ],
        // PDF-safe mirror of `totals`: JSX doesn't survive JSON.stringify (circular refs
        // via React fiber/context internals), so the last cell is flattened to plain text.
        pdfTotals: {
          cells: [
            { text: 'TOTAL', align: 'right', colSpan: 5 },
            { text: inr(data.total_gross), align: 'right' },
            { text: inr(data.total_advance_deducted), align: 'right' },
            { text: inr(data.total_net), align: 'right' },
            { text: `Paid ${inr(data.total_paid)} · Pending ${inr(data.total_pending)}`, align: 'left' },
          ],
        },
      })}
    />
  );
}
