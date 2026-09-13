import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { inr, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Human-friendly period label. Weekly runs stored as "YYYY-MM-DD_to_YYYY-MM-DD",
// monthly as "YYYY-MM". Turn either into "07 Sep → 13 Sep 2026" or "Sep 2026".
function prettyPeriod(period) {
  if (!period) return '';
  if (period.includes('_to_')) {
    const [a, b] = period.split('_to_');
    const fmt = (s) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    const year = new Date(b).getFullYear();
    return `${fmt(a)} → ${fmt(b)} ${year}`;
  }
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }
  return period;
}

// Sunday of the week containing `d` (start-of-week per business rule).
function sundayOf(d) {
  const day = d.getDay(); // 0=Sun..6=Sat
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  return s;
}

function presets() {
  const now = new Date();
  // Payroll week = Sun (start) → Sat (payout day). This week's Sun-Sat contains `now`.
  const thisSun = sundayOf(now);
  const thisSat = new Date(thisSun); thisSat.setDate(thisSun.getDate() + 6);
  const lastSun = new Date(thisSun); lastSun.setDate(thisSun.getDate() - 7);
  const lastSat = new Date(thisSun); lastSat.setDate(thisSun.getDate() - 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    thisWeek: { start: isoDate(thisSun), end: isoDate(thisSat) },
    lastWeek: { start: isoDate(lastSun), end: isoDate(lastSat) },
    thisMonth: { start: isoDate(monthStart), end: isoDate(monthEnd) },
  };
}

export default function Payroll() {
  const toast = useToast();
  const [runs, setRuns] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showRun, setShowRun] = useState(false);
  const P = presets();
  const [start, setStart] = useState(P.thisWeek.start);
  const [end, setEnd] = useState(P.thisWeek.end);
  const [notes, setNotes] = useState('');

  const [autoStatus, setAutoStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadList = () => window.api.payroll.list().then(setRuns);
  useEffect(() => {
    // Kick the auto-Saturday check whenever the Payroll page loads. Idempotent —
    // returns { created: false } if the current week's run already exists.
    (async () => {
      let autoResult = null;
      try {
        autoResult = await window.api.payroll.autoRunIfDue();
        setAutoStatus(autoResult);
      } catch (_e) { /* fall through to just showing the list */ }
      const list = await window.api.payroll.list();
      setRuns(list);
      // Auto-open a run so the user sees a real payroll on page load, not a blank screen.
      // Prefer the run the auto-generator just created; otherwise open the newest existing run.
      const idToOpen = (autoResult?.created && autoResult.run?.id) ? autoResult.run.id : (list[0]?.id || null);
      if (idToOpen) openRun(idToOpen);
    })();
  }, []);

  const openRun = async (id) => {
    setOpenId(id);
    const d = await window.api.payroll.get(id);
    setDetail(d);
  };

  const doRun = async () => {
    try {
      const r = await window.api.payroll.runRange(start, end, notes);
      toast.success(`Payroll ${r.period} generated (${r.entries.length} employees, ${inr(r.entries.reduce((s, e) => s + e.net_pay, 0))})`);
      setShowRun(false);
      setNotes('');
      loadList();
      openRun(r.id);
    } catch (e) { toast.error(e.message); }
  };

  const applyPreset = (p) => { setStart(p.start); setEnd(p.end); };

  // Merged pay + advance-recovery dialog. Everything for a single payroll entry
  // (adjust advance, see recomputed net, record payment) happens here.
  const [payingEntry, setPayingEntry] = useState(null);
  const [advanceEditAmt, setAdvanceEditAmt] = useState(''); // editable advance recovery for THIS run
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [advOutstandingTotal, setAdvOutstandingTotal] = useState(0); // total outstanding for this employee
  const [advDeductionsThisRun, setAdvDeductionsThisRun] = useState([]); // list of (advance_id, amount) tied to this run

  const openPay = async (entry) => {
    setPayingEntry(entry);
    // Start with Pay now = 0 so opening the modal never triggers an accidental payment.
    // User clicks "Full balance" or types an amount to pay.
    setPayAmount('0');
    setPayDate(today());
    setAdvanceEditAmt(String(Number(entry.advance_deduction) || 0));
    // Load extra context: total outstanding + this-run's deduction breakdown
    try {
      const [summary, deductions] = await Promise.all([
        window.api.advances.summary(entry.employee_id),
        window.api.advances.deductions({ employee_id: entry.employee_id, run_id: entry.run_id }),
      ]);
      // "Total outstanding INCLUDING what's currently deducted in this run" — this is the
      // pool the user can allocate from. summary.outstanding excludes this run's deductions.
      const thisRunSum = (deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
      setAdvOutstandingTotal(+((summary.outstanding || 0) + thisRunSum).toFixed(2));
      setAdvDeductionsThisRun(deductions || []);
    } catch (e) {
      setAdvOutstandingTotal(Number(entry.advance_deduction) || 0);
      setAdvDeductionsThisRun([]);
    }
  };

  const closePay = () => {
    setPayingEntry(null);
    setPayAmount(''); setAdvanceEditAmt(''); setPayDate(today());
    setAdvOutstandingTotal(0); setAdvDeductionsThisRun([]);
  };

  const submitPay = async () => {
    if (!payingEntry) return;
    const newAdvance = Number(advanceEditAmt);
    const originalAdvance = Number(payingEntry.advance_deduction) || 0;
    const amt = Number(payAmount);
    // If projected net_pay ends up 0 (e.g. full leave week, or advance recovery = full gross),
    // there's genuinely nothing to pay — treat Save as "mark this zero-net entry as done".
    const projectedNet = (Number(payingEntry.gross) || 0) - (Number(payingEntry.deductions) || 0) - newAdvance;
    const projectedBalance = Math.max(0, projectedNet - (Number(payingEntry.paid_amount) || 0));
    const zeroBalanceMark = projectedBalance <= 0.001 && amt <= 0;
    try {
      // 1. If advance recovery changed, push that first (recomputes net_pay in DB)
      if (Math.abs(newAdvance - originalAdvance) > 0.01) {
        if (newAdvance < 0) return toast.error('Advance recovery cannot be negative');
        if (newAdvance > advOutstandingTotal + 0.01) {
          return toast.error(`Cannot deduct ₹${newAdvance.toFixed(2)} — total outstanding is only ₹${advOutstandingTotal.toFixed(2)}`);
        }
        await window.api.payroll.setAdvanceDeduction(payingEntry.id, newAdvance);
      }
      // 1a. Zero-net entry: hit the pay endpoint with 0 to trigger the "mark paid" special case
      if (zeroBalanceMark && !payingEntry.paid) {
        await window.api.payroll.pay(payingEntry.id, 0, payDate);
        toast.success(`Marked as paid — nothing owed (${payingEntry.employee_name} · ${payingEntry.gross === 0 ? 'full leave' : 'advance covered full salary'}).`);
        closePay();
        if (openId) openRun(openId);
        return;
      }
      // 2. Then record the payment (skip if user set amount to 0 — they may just be adjusting advance)
      if (amt > 0) {
        // Balance BEFORE this payment — use projectedNet (post-advance-update) rather than stale net_pay
        const netAfterAdvChange = (Number(payingEntry.gross) || 0) - (Number(payingEntry.deductions) || 0) - newAdvance;
        const balanceBefore = Math.max(0, netAfterAdvChange - (Number(payingEntry.paid_amount) || 0));
        const excess = +(amt - balanceBefore).toFixed(2);

        await window.api.payroll.pay(payingEntry.id, amt, payDate);

        if (excess > 0.01) {
          toast.success(
            `Paid ₹${balanceBefore.toFixed(2)} to close this entry. ` +
            `Extra ₹${excess.toFixed(2)} added as a new advance for ${payingEntry.employee_name} ` +
            `(see Employees → ${payingEntry.employee_name} → Advances).`
          );
        } else {
          toast.success('Payment recorded');
        }
      } else if (Math.abs(newAdvance - originalAdvance) > 0.01) {
        toast.success('Advance recovery updated');
      } else {
        toast.success('Nothing changed');
      }
      closePay();
      if (openId) openRun(openId);
    } catch (e) { toast.error(e.message); }
  };

  // Derived values for the modal — recomputed live as user changes the advance amount
  const modalCalc = (() => {
    if (!payingEntry) return null;
    const gross = Number(payingEntry.gross) || 0;
    const otherDed = Number(payingEntry.deductions) || 0;
    const newAdvance = Number(advanceEditAmt) || 0;
    const projectedNet = +(gross - otherDed - newAdvance).toFixed(2);
    const alreadyPaid = Number(payingEntry.paid_amount) || 0;
    const projectedBalance = Math.max(0, projectedNet - alreadyPaid);
    const remainingAdvanceAfter = +(advOutstandingTotal - newAdvance).toFixed(2);
    return { gross, otherDed, newAdvance, projectedNet, alreadyPaid, projectedBalance, remainingAdvanceAfter };
  })();

  // Don't auto-sync Pay now on advance change — user might want to update ONLY the
  // advance recovery without triggering a payment. They explicitly hit "Full balance"
  // preset or type the amount if they want to pay right now.

  const recalculate = async () => {
    if (!detail) return;
    if (!confirm(`Recompute payroll for ${prettyPeriod(detail.period)}?\n\nThis rebuilds every entry using the current attendance + salary structure. Paid statuses are preserved.`)) return;
    try {
      const r = await window.api.payroll.recalculate(detail.id);
      setDetail(r);
      loadList();
      toast.success('Payroll recalculated');
    } catch (e) { toast.error(e.message); }
  };

  const removeRun = async (r) => {
    if (!confirm(`Delete payroll ${r.period}? All entries will be lost.`)) return;
    await window.api.payroll.remove(r.id);
    if (openId === r.id) { setOpenId(null); setDetail(null); }
    loadList();
  };

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Weekly / per-shift / monthly salary runs. Pulls shift counts from Attendance."
        right={<button className="btn-primary" onClick={() => setShowRun(true)}>+ Run payroll</button>}
      />

      {/* Only surface auto-payroll status when something needs the user's attention.
          Silent when it just already ran (already_generated). */}
      {autoStatus && !autoStatus.created && autoStatus.reason && autoStatus.reason !== 'already_generated' && (
        <div className="rounded-md border p-3 mb-4 text-sm flex items-center gap-3 bg-amber-50 border-amber-300 text-amber-800">
          <span className="text-lg">ℹ</span>
          <div>
            {autoStatus.reason === 'no_active_employees' && (
              <>Auto-payroll idle: no active employees. Add employees to enable weekly Saturday auto-runs.</>
            )}
            {autoStatus.reason === 'before_6pm' && (
              <>Auto-payroll waits until <strong>6:00 PM</strong> on Saturday. Click <strong>+ Run payroll</strong> above to generate manually for verification.</>
            )}
            {autoStatus.reason === 'no_saturday_attendance' && (
              <>Auto-payroll paused: no attendance marked for Saturday ({autoStatus.period?.split('_to_')[1]}). Mark Saturday shifts in the Attendance page, or use <strong>+ Run payroll</strong> to generate manually.</>
            )}
            {autoStatus.reason === 'error' && (
              <>Auto-payroll failed for {autoStatus.period}: {autoStatus.error}</>
            )}
          </div>
        </div>
      )}

      <div className={'grid grid-cols-1 gap-4 ' + (sidebarOpen ? 'lg:grid-cols-[300px_28px_1fr]' : 'lg:grid-cols-[28px_1fr]')}>
        {sidebarOpen && (
          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Payroll runs</div>
              <span className="text-xs text-slate-400">{runs.length}</span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {runs.length === 0 && <div className="text-sm text-slate-500 p-4 text-center">No payroll runs yet.</div>}
              {runs.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRun(r.id)}
                  className={
                    'w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition ' +
                    (openId === r.id ? 'bg-brand-50' : '')
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{prettyPeriod(r.period)}</div>
                    <div className="text-[10px] text-slate-500">Gen {r.run_date}</div>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {r.entry_count} emp · Net {inr(r.total_net)}
                  </div>
                  {r.notes && r.notes.startsWith('Auto-generated') && (
                    <div className="text-[10px] text-emerald-600 mt-1">✓ Auto Saturday run</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collapse/expand toggle between sidebar and detail */}
        <div className="hidden lg:flex items-start justify-center pt-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-6 h-16 rounded-md bg-white border border-slate-200 hover:bg-brand-50 hover:border-brand-400 hover:text-brand-700 text-slate-500 flex items-center justify-center shadow-sm transition sticky top-4"
            title={sidebarOpen ? 'Hide runs list (full-width report)' : 'Show runs list'}
          >
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {detail
                ? `Payroll — ${prettyPeriod(detail.period)}${detail.run_date ? ' · generated ' + detail.run_date : ''}`
                : 'Select a payroll run'}
            </div>
            {detail && (
              <div className="flex gap-2 items-center">
                <button className="btn-secondary text-xs" onClick={recalculate}
                  title="Rebuild all entries from current attendance + salary data. Preserves paid statuses.">
                  ↻ Recalculate
                </button>
                <ExportButton
                  filename={`Payroll ${prettyPeriod(detail.period)}`}
                  title={`Payroll — ${prettyPeriod(detail.period)}`}
                  subtitle={`Generated ${detail.run_date || ''}`}
                  tiles={[
                    { label: 'Entries', value: String(detail.entries.length) },
                    { label: 'Gross total', value: inr(detail.entries.reduce((s, e) => s + (e.gross || 0), 0)) },
                    { label: 'Net total', value: inr(detail.entries.reduce((s, e) => s + e.net_pay, 0)), tone: 'good' },
                    { label: 'Advance deducted', value: inr(detail.entries.reduce((s, e) => s + (e.advance_deduction || 0), 0)), tone: 'warn' },
                  ]}
                  columns={[
                    { key: 'employee_code', label: 'Code' },
                    { key: 'employee_name', label: 'Employee' },
                    { key: 'pay_mode', label: 'Mode', format: (v) => v === 'per_shift' ? 'Per-shift' : v === 'weekly' ? 'Weekly' : 'Monthly' },
                    { key: 'shifts_worked', label: 'Shifts', align: 'right' },
                    { key: 'days_present', label: 'Days P', align: 'right' },
                    { key: 'gross', label: 'Gross', align: 'right', format: (v) => inr(v) },
                    { key: 'advance_deduction', label: 'Advance', align: 'right', format: (v) => inr(v) },
                    { key: 'net_pay', label: 'Net Pay', align: 'right', format: (v) => inr(v) },
                    { key: 'paid', label: 'Status', format: (v, r) => r.paid ? `Paid ${r.paid_date || ''}` : 'Pending' },
                  ]}
                  rows={detail.entries}
                  totals={[
                    { text: 'TOTAL', align: 'right', colSpan: 5 },
                    { text: inr(detail.entries.reduce((s, e) => s + (e.gross || 0), 0)), align: 'right' },
                    { text: inr(detail.entries.reduce((s, e) => s + (e.advance_deduction || 0), 0)), align: 'right' },
                    { text: inr(detail.entries.reduce((s, e) => s + e.net_pay, 0)), align: 'right' },
                    { text: '' },
                  ]}
                />
                <button className="btn-ghost text-xs text-red-600" onClick={() => removeRun(detail)}>Delete run</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            {!detail && <div className="p-8 text-center text-slate-500">Pick a run from the left, or click <strong>Run payroll</strong> to generate one.</div>}
            {detail && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Code</th>
                    <th className="th">Name</th>
                    <th className="th text-xs">Mode</th>
                    <th className="th text-right">Worked</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Gross</th>
                    <th className="th text-right">Advance</th>
                    <th className="th text-right">Net Pay</th>
                    <th className="th">Status</th>
                    <th className="th text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.entries.length === 0 && <tr><td colSpan={10} className="td text-center text-slate-500 py-6">No entries in this run.</td></tr>}
                  {detail.entries.map((e) => {
                    const mode = e.pay_mode || 'monthly';
                    // "Worked": shifts for per_shift, days for weekly/monthly
                    const workedLabel = mode === 'per_shift'
                      ? `${e.shifts_worked || 0} shift${e.shifts_worked === 1 ? '' : 's'}`
                      : `${e.days_present || 0}d present · ${e.days_leave || 0}L · ${e.days_absent || 0}A`;
                    // "Rate": mode-appropriate rate
                    const rateLabel = mode === 'per_shift'
                      ? inr(e.per_shift_rate || 0) + ' / shift'
                      : mode === 'weekly'
                      ? inr(e.weekly_salary || 0) + ' / week'
                      : inr((e.basic || 0) + (e.hra || 0) + (e.allowances || 0)) + ' / month';
                    return (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="td text-xs whitespace-nowrap">{e.employee_code || '—'}</td>
                        <td className="td font-medium whitespace-nowrap">{e.employee_name}</td>
                        <td className="td text-xs whitespace-nowrap">
                          <span className={
                            'inline-block px-2 py-0.5 rounded font-medium whitespace-nowrap ' +
                            (mode === 'per_shift' ? 'bg-blue-100 text-blue-700'
                              : mode === 'weekly' ? 'bg-purple-100 text-purple-700'
                              : 'bg-slate-100 text-slate-700')
                          }>
                            {mode === 'per_shift' ? 'Per-shift' : mode === 'weekly' ? 'Weekly' : 'Monthly'}
                          </span>
                        </td>
                        <td className="td text-right text-xs whitespace-nowrap">{workedLabel}</td>
                        <td className="td text-right text-xs text-slate-600 whitespace-nowrap">{rateLabel}</td>
                        <td className="td text-right font-semibold">{inr(e.gross || 0)}</td>
                        <td className={'td text-right ' + (e.advance_deduction > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                          {!e.paid ? (
                            <button
                              className="hover:underline"
                              onClick={() => openPay(e)}
                              title="Click to adjust advance recovery"
                            >
                              {e.advance_deduction > 0 ? inr(e.advance_deduction) : '—'}
                              <span className="ml-1 text-[9px] text-slate-400">✎</span>
                            </button>
                          ) : (
                            e.advance_deduction > 0 ? inr(e.advance_deduction) : '—'
                          )}
                        </td>
                        <td className={'td text-right font-bold ' + (e.net_pay < 0 ? 'text-red-700' : 'text-emerald-700')}>
                          {inr(e.net_pay)}
                        </td>
                        <td className="td whitespace-nowrap">
                          {(() => {
                            const paidAmt = Number(e.paid_amount) || 0;
                            const net = Number(e.net_pay) || 0;
                            const balance = Math.max(0, net - paidAmt);
                            if (e.paid) {
                              return <span className="text-xs text-emerald-700">✓ Paid {e.paid_date}</span>;
                            }
                            if (paidAmt > 0) {
                              return (
                                <div className="text-xs">
                                  <div className="text-amber-800 font-semibold">Partial</div>
                                  <div className="text-slate-500">
                                    Paid {inr(paidAmt)} · Bal <span className="text-red-700 font-semibold">{inr(balance)}</span>
                                  </div>
                                </div>
                              );
                            }
                            return <span className="text-xs text-amber-700">Pending</span>;
                          })()}
                        </td>
                        <td className="td text-right whitespace-nowrap">
                          {!e.paid && (
                            <button className="btn-primary text-xs py-1" onClick={() => openPay(e)}>
                              {(Number(e.paid_amount) || 0) > 0 ? '+ Pay balance' : 'Mark paid'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {detail.entries.length > 0 && (
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={5} className="td text-right">TOTAL</td>
                      <td className="td text-right">{inr(detail.entries.reduce((s, e) => s + (e.gross || 0), 0))}</td>
                      <td className="td text-right text-amber-700">{inr(detail.entries.reduce((s, e) => s + (e.advance_deduction || 0), 0))}</td>
                      <td className="td text-right text-emerald-700">{inr(detail.entries.reduce((s, e) => s + e.net_pay, 0))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Modal open={showRun} title="Run payroll" onClose={() => setShowRun(false)}>
        <div className="p-5 space-y-3">
          <div>
            <label className="label">Quick period</label>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => applyPreset(P.thisWeek)}>This week</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => applyPreset(P.lastWeek)}>Last week</button>
              <button type="button" className="btn-secondary text-xs" onClick={() => applyPreset(P.thisMonth)}>This month</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From *</label>
              <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label">To *</label>
              <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Per-shift employees: shifts × rate. Weekly: prorated by days worked. Monthly: prorated by days worked / 30.
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowRun(false)}>Cancel</button>
          <button className="btn-primary" onClick={doRun}>Generate payroll</button>
        </div>
      </Modal>

      {/* Merged pay + advance-recovery modal */}
      <Modal
        open={!!payingEntry}
        title={payingEntry ? `Pay & Recover advance — ${payingEntry.employee_name}` : ''}
        onClose={closePay}
        size="lg"
      >
        {payingEntry && modalCalc && (
          <div className="p-5 space-y-4">
            {/* ─── Section 1: Salary breakdown (live) ─── */}
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                1. Salary breakdown
              </div>
              <div className="p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Gross salary</span>
                  <span className="font-semibold">{inr(modalCalc.gross)}</span>
                </div>
                {modalCalc.otherDed > 0 && (
                  <div className="flex justify-between text-slate-500">
                    <span>− Other deductions</span>
                    <span>{inr(modalCalc.otherDed)}</span>
                  </div>
                )}
                <div className="flex justify-between text-amber-700">
                  <span>− Advance recovery (this run)</span>
                  <span className="font-semibold">{inr(modalCalc.newAdvance)}</span>
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t border-slate-200 font-bold text-emerald-700">
                  <span>= Net pay to give</span>
                  <span className="text-base">{inr(modalCalc.projectedNet)}</span>
                </div>
              </div>
            </div>

            {/* ─── Section 2: Advance recovery editor ─── */}
            <div className="rounded-md border border-amber-200 overflow-hidden">
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs font-bold uppercase text-amber-800 flex items-center justify-between">
                <span>2. Advance recovery</span>
                <span className="text-[10px] font-normal text-amber-700 normal-case">
                  Total outstanding for {payingEntry.employee_name}: <strong>{inr(advOutstandingTotal)}</strong>
                </span>
              </div>
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Recover this run</div>
                    <div className="mt-0.5">
                      <input
                        type="number" min="0" step="0.01" max={advOutstandingTotal}
                        className="input py-1 text-sm w-full"
                        value={advanceEditAmt}
                        onChange={(e) => setAdvanceEditAmt(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Total outstanding</div>
                    <div className="mt-1 font-semibold text-slate-800">{inr(advOutstandingTotal)}</div>
                  </div>
                  <div className={'rounded bg-white border p-2 ' + (modalCalc.remainingAdvanceAfter > 0 ? 'border-amber-300' : 'border-emerald-300')}>
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Carried to next run</div>
                    <div className={'mt-1 font-semibold ' + (modalCalc.remainingAdvanceAfter > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                      {inr(Math.max(0, modalCalc.remainingAdvanceAfter))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 text-[10px]">
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt(String(advOutstandingTotal))}>
                    Recover all ({inr(advOutstandingTotal)})
                  </button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('1000')}>
                    ₹1,000
                  </button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('2000')}>
                    ₹2,000
                  </button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('5000')}>
                    ₹5,000
                  </button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('0')}>
                    Skip (₹0)
                  </button>
                </div>

                {advDeductionsThisRun.length > 0 && (
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold">This run currently applies to:</span>{' '}
                    {advDeductionsThisRun.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 ? ' · ' : ''}Advance #{d.advance_id} — {inr(d.amount)}
                      </span>
                    ))}
                    <span className="ml-1 text-slate-400">(FIFO — oldest advances recovered first)</span>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Section 3: Payment ─── */}
            <div className="rounded-md border border-emerald-200 overflow-hidden">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-bold uppercase text-emerald-800">
                3. Payment
              </div>
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Net pay</div>
                    <div className="mt-1 font-semibold">{inr(modalCalc.projectedNet)}</div>
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Already paid</div>
                    <div className="mt-1 font-semibold text-emerald-700">{inr(modalCalc.alreadyPaid)}</div>
                  </div>
                  <div className="rounded bg-white border border-red-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Balance to pay</div>
                    <div className="mt-1 font-semibold text-red-700">{inr(modalCalc.projectedBalance)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Pay now (₹)</label>
                    <input
                      type="number" min="0" step="0.01"
                      className="input"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      autoFocus
                    />
                    <div className="text-[10px] text-slate-500 mt-1">
                      Leave as 0 if you're only updating the advance recovery.
                    </div>
                  </div>
                  <div>
                    <label className="label">Payment date</label>
                    <input
                      type="date"
                      className="input"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Money-flow outcome — always visible so user knows exactly what Save will do */}
                {(() => {
                  const amt = Number(payAmount) || 0;
                  const balance = modalCalc.projectedBalance;
                  const excess = +(amt - balance).toFixed(2);
                  const short = +(balance - amt).toFixed(2);
                  const willMarkPaid = balance <= 0.001 || amt >= balance - 0.001;

                  let tone = 'bg-slate-50 border-slate-200 text-slate-700';
                  let title = '💡 On Save';
                  const lines = [];

                  if (amt <= 0 && balance <= 0.001) {
                    tone = 'bg-blue-50 border-blue-200 text-blue-800';
                    title = '💡 On Save — zero-net entry';
                    lines.push({ label: 'Nothing to pay.', value: `Entry marked as paid so it disappears from the pending list.` });
                  } else if (amt <= 0 && balance > 0) {
                    lines.push({ label: 'No payment this time.', value: `Balance of ${inr(balance)} stays as Pending — pay it later.` });
                    if (Math.abs((Number(advanceEditAmt) || 0) - (Number(payingEntry.advance_deduction) || 0)) > 0.01) {
                      lines.push({ label: 'Advance recovery updated only.', value: '' });
                    }
                  } else if (excess > 0.01) {
                    tone = 'bg-amber-50 border-amber-300 text-amber-800';
                    title = '⚠ On Save — over-payment';
                    lines.push({ label: `Pay ₹${balance.toFixed(2)} → closes this entry.`, value: 'Status becomes Paid.' });
                    lines.push({ label: `Extra ₹${excess.toFixed(2)} → new advance for ${payingEntry.employee_name}.`, value: `Shows as outstanding on the next payroll run.` });
                  } else if (short > 0.01) {
                    tone = 'bg-slate-50 border-slate-300 text-slate-700';
                    title = '💡 On Save — partial payment';
                    lines.push({ label: `Pay ₹${amt.toFixed(2)} → partial.`, value: `Remaining ₹${short.toFixed(2)} stays as Pending; pay later.` });
                  } else {
                    tone = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                    title = '✓ On Save — full payment';
                    lines.push({ label: `Pay ₹${amt.toFixed(2)} → closes this entry.`, value: 'Status becomes Paid.' });
                  }

                  return (
                    <div className={'rounded border p-2 text-xs ' + tone}>
                      <div className="font-semibold mb-1">{title}</div>
                      <ul className="space-y-0.5 pl-1">
                        {lines.map((l, i) => (
                          <li key={i}>• <strong>{l.label}</strong> {l.value && <span className="opacity-80">{l.value}</span>}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}

                <div className="flex gap-2 text-xs flex-wrap">
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount(String(modalCalc.projectedBalance))}>
                    Full balance ({inr(modalCalc.projectedBalance)})
                  </button>
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount(String(+(modalCalc.projectedBalance / 2).toFixed(2)))}>
                    Half ({inr(modalCalc.projectedBalance / 2)})
                  </button>
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount('0')}>
                    Skip (only update advance)
                  </button>
                  <button
                    className="btn-secondary text-xs text-amber-700 border-amber-300"
                    onClick={() => setPayAmount(String(+(modalCalc.projectedBalance + 1000).toFixed(2)))}
                    title="Pay full balance + ₹1000 extra as a new advance"
                  >
                    + ₹1000 extra (advance)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={closePay}>Cancel</button>
          <button className="btn-primary" onClick={submitPay}>Save changes</button>
        </div>
      </Modal>
    </>
  );
}
