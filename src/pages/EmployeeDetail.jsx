import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { inr, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

// Utility: shift-count badge for the attendance matrix
function shiftBadge(n) {
  if (n == null || n === 0) return '';
  if (n === 0.5) return '½';
  if (n === 1) return '1';
  if (n === 1.5) return '1½';
  if (n === 2) return '2';
  return String(n);
}
const badgeColor = (b, status) => {
  if (status === 'Leave') return 'bg-blue-100 text-blue-700';
  if (status === 'Absent') return 'bg-red-100 text-red-700';
  if (b === '½' || b === '1') return 'bg-amber-100 text-amber-700';
  if (b === '1½') return 'bg-amber-200 text-amber-800';
  if (b === '2') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-50 text-slate-400';
};

function isoDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const TABS = [
  { key: 'overview', label: '📊 Overview' },
  { key: 'attendance', label: '📅 Attendance' },
  { key: 'advances', label: '💵 Advances' },
  { key: 'payroll', label: '📋 Payroll history' },
  { key: 'leaves', label: '🏖 Leaves' },
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const empId = Number(id);
  const [emp, setEmp] = useState(null);
  const [tab, setTab] = useState('overview');
  const [advSummary, setAdvSummary] = useState({ total: 0, outstanding: 0 });
  const [advList, setAdvList] = useState([]);
  const [attList, setAttList] = useState([]);
  const [attMonth, setAttMonth] = useState(currentMonth());
  const [payrollEntries, setPayrollEntries] = useState([]);
  const [leaves, setLeaves] = useState([]);
  // Inline pay dialog — same 3-section flow as the Payroll page, scoped to a single entry
  const [payingEntry, setPayingEntry] = useState(null);
  const [advanceEditAmt, setAdvanceEditAmt] = useState('');
  const [payAmount, setPayAmount] = useState('0');
  const [payDate, setPayDate] = useState(today());
  const [advOutstandingTotal, setAdvOutstandingTotal] = useState(0);

  const openPay = async (entry) => {
    setPayingEntry(entry);
    setPayAmount('0');
    setPayDate(today());
    setAdvanceEditAmt(String(Number(entry.advance_deduction) || 0));
    try {
      const [summary, deductions] = await Promise.all([
        window.api.advances.summary(entry.employee_id),
        window.api.advances.deductions({ employee_id: entry.employee_id, run_id: entry.run_id }),
      ]);
      const thisRunSum = (deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
      setAdvOutstandingTotal(+((summary.outstanding || 0) + thisRunSum).toFixed(2));
    } catch (_e) {
      setAdvOutstandingTotal(Number(entry.advance_deduction) || 0);
    }
  };
  const closePay = () => {
    setPayingEntry(null);
    setPayAmount('0'); setAdvanceEditAmt(''); setPayDate(today());
    setAdvOutstandingTotal(0);
  };
  const submitPay = async () => {
    if (!payingEntry) return;
    const newAdvance = Number(advanceEditAmt);
    const originalAdvance = Number(payingEntry.advance_deduction) || 0;
    const amt = Number(payAmount);
    const projectedNet = (Number(payingEntry.gross) || 0) - (Number(payingEntry.deductions) || 0) - newAdvance;
    const projectedBalance = Math.max(0, projectedNet - (Number(payingEntry.paid_amount) || 0));
    const zeroBalanceMark = projectedBalance <= 0.001 && amt <= 0;
    try {
      if (Math.abs(newAdvance - originalAdvance) > 0.01) {
        if (newAdvance < 0) return toast.error('Advance recovery cannot be negative');
        if (newAdvance > advOutstandingTotal + 0.01) {
          return toast.error(`Cannot deduct ₹${newAdvance.toFixed(2)} — total outstanding is only ₹${advOutstandingTotal.toFixed(2)}`);
        }
        await window.api.payroll.setAdvanceDeduction(payingEntry.id, newAdvance);
      }
      if (zeroBalanceMark && !payingEntry.paid) {
        await window.api.payroll.pay(payingEntry.id, 0, payDate);
        toast.success(`Marked as paid — nothing owed (${emp?.name}).`);
      } else if (amt > 0) {
        const balanceBefore = Math.max(0, projectedNet - (Number(payingEntry.paid_amount) || 0));
        const excess = +(amt - balanceBefore).toFixed(2);
        await window.api.payroll.pay(payingEntry.id, amt, payDate);
        if (excess > 0.01) {
          toast.success(`Paid ₹${balanceBefore.toFixed(2)}. Extra ₹${excess.toFixed(2)} added as new advance.`);
        } else {
          toast.success('Payment recorded');
        }
      } else if (Math.abs(newAdvance - originalAdvance) > 0.01) {
        toast.success('Advance recovery updated');
      } else {
        toast.success('Nothing changed');
      }
      closePay();
      reloadAll();
    } catch (e) { toast.error(e.message); }
  };
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

  // "Generate payroll for this employee only" — modal state + period presets
  const [showGen, setShowGen] = useState(false);
  const genPresets = (() => {
    const now = new Date();
    const thisSun = new Date(now); thisSun.setDate(now.getDate() - now.getDay());
    const thisSat = new Date(thisSun); thisSat.setDate(thisSun.getDate() + 6);
    const lastSun = new Date(thisSun); lastSun.setDate(thisSun.getDate() - 7);
    const lastSat = new Date(thisSun); lastSat.setDate(thisSun.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      thisWeek: { start: isoDay(thisSun), end: isoDay(thisSat) },
      lastWeek: { start: isoDay(lastSun), end: isoDay(lastSat) },
      thisMonth: { start: isoDay(monthStart), end: isoDay(monthEnd) },
    };
  })();
  const [genStart, setGenStart] = useState(genPresets.thisWeek.start);
  const [genEnd, setGenEnd] = useState(genPresets.thisWeek.end);
  const [genNotes, setGenNotes] = useState('');

  const openGen = () => {
    setGenStart(genPresets.thisWeek.start);
    setGenEnd(genPresets.thisWeek.end);
    setGenNotes('');
    setShowGen(true);
  };

  const submitGen = async () => {
    if (!genStart || !genEnd) return toast.error('Pick a period');
    if (genEnd < genStart) return toast.error('End date must be after start');
    try {
      const entry = await window.api.payroll.runForEmployee(empId, genStart, genEnd, genNotes);
      toast.success(`Payroll generated — Net ₹${(entry.net_pay || 0).toFixed(2)} for ${emp.name}. Opening pay dialog…`);
      setShowGen(false);
      await reloadAll();
      setTab('payroll');
      // Open the pay dialog for the just-generated entry so user can pay immediately
      openPay(entry);
    } catch (e) { toast.error(e.message); }
  };

  // Initial load — everything the Overview tab needs, up-front.
  // Payroll entries + advances + attendance + leaves all fetch on mount so the Overview
  // tiles ("Latest payroll", outstanding, this month's shifts) are populated immediately.
  const reloadAll = async () => {
    if (!empId) return;
    const [e, summary, payroll, advances, attendance, ls] = await Promise.all([
      window.api.employees.get(empId),
      window.api.advances.summary(empId),
      window.api.payroll.entriesForEmployee(empId),
      window.api.advances.list({ employee_id: empId }),
      window.api.attendance.list({ employee_id: empId, from: attMonth + '-01', to: attMonth + '-31' }),
      window.api.leaves.list({ employee_id: empId }),
    ]);
    setEmp(e);
    setAdvSummary(summary);
    setPayrollEntries(payroll);
    setAdvList(advances);
    setAttList(attendance);
    setLeaves(ls);
  };
  useEffect(() => { reloadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empId]);

  // Attendance month picker re-fetches on change (only attendance, not everything)
  useEffect(() => {
    if (!empId) return;
    window.api.attendance.list({ employee_id: empId, from: attMonth + '-01', to: attMonth + '-31' })
      .then(setAttList);
  }, [empId, attMonth]);

  // Derived stats for the Overview tab
  const overview = useMemo(() => {
    if (!emp) return null;
    const totalShifts = attList.reduce((s, r) => s + (Number(r.shifts_worked) || 0), 0);
    const lastPayroll = payrollEntries[0]; // most recent
    return {
      totalOutstanding: advSummary.outstanding || 0,
      totalGiven: advSummary.total || 0,
      recovered: (advSummary.total || 0) - (advSummary.outstanding || 0),
      monthShifts: totalShifts,
      lastPayrollNet: lastPayroll?.net_pay || 0,
      lastPayrollPaid: lastPayroll?.paid || 0,
      pendingLeaves: leaves.filter((l) => l.status === 'Pending').length,
    };
  }, [emp, advSummary, attList, payrollEntries, leaves]);

  if (!emp) {
    return (
      <div className="p-8 text-center text-slate-500">
        Loading employee…
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={emp.name}
        subtitle={
          <div className="flex items-center gap-3 flex-wrap text-sm">
            {emp.code && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">Code: {emp.code}</span>}
            {emp.role && <span className="text-slate-500">{emp.role}</span>}
            {emp.phone && <span className="text-slate-500">📞 {emp.phone}</span>}
            <span className={'px-2 py-0.5 rounded text-xs font-semibold ' + (emp.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
              {emp.is_active ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500">
              Pay: {emp.pay_mode === 'per_shift'
                ? `₹${emp.per_shift_rate}/shift`
                : emp.pay_mode === 'weekly'
                ? `₹${emp.weekly_salary}/week`
                : `₹${(emp.basic_salary || 0) + (emp.hra || 0) + (emp.allowances || 0)}/month`}
            </span>
          </div>
        }
        right={
          <>
            <button
              className="btn-primary flex items-center gap-1"
              onClick={openGen}
              title="Compute this week's (or a chosen period's) payroll just for this employee"
            >
              💰 Generate payroll
            </button>
            <button className="btn-secondary" onClick={() => nav('/hr/employees')}>← Back to list</button>
          </>
        }
      />

      {/* Tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 p-1 bg-slate-100 rounded-md w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'px-4 py-2 rounded text-sm font-medium transition ' +
              (tab === t.key ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-900')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card card-body">
              <div className="text-xs uppercase font-semibold text-slate-500">Outstanding advance</div>
              <div className={'mt-1 text-xl font-bold ' + (overview.totalOutstanding > 0 ? 'text-red-700' : 'text-emerald-700')}>
                {inr(overview.totalOutstanding)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Given all-time: {inr(overview.totalGiven)} · Recovered: {inr(overview.recovered)}
              </div>
            </div>
            <div className="card card-body">
              <div className="text-xs uppercase font-semibold text-slate-500">This month's shifts</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{overview.monthShifts}</div>
              <div className="text-xs text-slate-500 mt-1">{attList.length} days marked in {attMonth}</div>
            </div>
            <div className="card card-body">
              <div className="text-xs uppercase font-semibold text-slate-500">Latest payroll</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{inr(overview.lastPayrollNet)}</div>
              <div className="text-xs text-slate-500 mt-1">
                {payrollEntries[0]
                  ? `${payrollEntries[0].run_start || payrollEntries[0].run_period} → ${payrollEntries[0].run_end || ''}${payrollEntries[0].paid ? ' · ✓ Paid' : ' · Pending'}`
                  : 'No payroll yet'}
              </div>
            </div>
            <div className="card card-body">
              <div className="text-xs uppercase font-semibold text-slate-500">Total payroll runs</div>
              <div className="mt-1 text-xl font-bold text-slate-800">{payrollEntries.length}</div>
              <div className="text-xs text-slate-500 mt-1">
                {payrollEntries.filter((p) => p.paid).length} paid, {payrollEntries.filter((p) => !p.paid).length} pending
              </div>
            </div>
          </div>
          <div className="card card-body text-sm text-slate-600">
            Click any tab above to drill in. Attendance shows the shift matrix per day. Advances shows the full loan &amp; recovery trail.
            Payroll history lists every payroll run this employee has been part of.
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title text-sm">Attendance for {attMonth}</div>
            <div className="flex items-center gap-2">
              <input type="month" className="input py-1 text-sm" value={attMonth}
                onChange={(e) => setAttMonth(e.target.value)} />
              <Link to="/hr/attendance" className="text-xs text-brand-600 hover:underline">Edit in Attendance page →</Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Day</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Shifts</th>
                  <th className="th text-right">Hours</th>
                  <th className="th">Notes</th>
                </tr>
              </thead>
              <tbody>
                {attList.length === 0 && (
                  <tr><td colSpan={6} className="td text-center text-slate-500 py-8">No attendance marked for {attMonth}.</td></tr>
                )}
                {attList.map((a) => {
                  const badge = shiftBadge(Number(a.shifts_worked) || 0);
                  const cls = badgeColor(badge, a.status);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="td text-sm whitespace-nowrap">{a.att_date}</td>
                      <td className="td text-xs text-slate-500">
                        {new Date(a.att_date).toLocaleDateString('en-IN', { weekday: 'short' })}
                      </td>
                      <td className="td">
                        <span className={'inline-block px-2 py-0.5 rounded text-xs font-semibold ' + cls}>
                          {a.status}
                        </span>
                      </td>
                      <td className="td text-right font-semibold">
                        {a.shifts_worked > 0 ? shiftBadge(Number(a.shifts_worked)) : '—'}
                      </td>
                      <td className="td text-right text-xs text-slate-600">{a.hours ? `${a.hours}h` : '—'}</td>
                      <td className="td text-xs text-slate-500">{a.notes || '—'}</td>
                    </tr>
                  );
                })}
                {attList.length > 0 && (
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={3} className="td text-right">TOTAL</td>
                    <td className="td text-right text-emerald-700">
                      {attList.reduce((s, a) => s + (Number(a.shifts_worked) || 0), 0)} shifts
                    </td>
                    <td className="td text-right text-slate-600">
                      {attList.reduce((s, a) => s + (Number(a.hours) || 0), 0)}h
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'advances' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title text-sm">Advance history</div>
            <div className="flex items-center gap-3 text-xs">
              <span>Total given: <strong className="text-slate-800">{inr(advSummary.total)}</strong></span>
              <span>Outstanding: <strong className={advSummary.outstanding > 0 ? 'text-red-700' : 'text-emerald-700'}>{inr(advSummary.outstanding)}</strong></span>
              <Link to="/hr/employees" className="text-brand-600 hover:underline">Manage in Employees page →</Link>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Recovered</th>
                <th className="th text-right">Outstanding</th>
                <th className="th">Mode / Ref</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {advList.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-500 py-8">No advances recorded.</td></tr>}
              {advList.map((a) => {
                const amount = Number(a.amount) || 0;
                const deducted = Number(a.deducted_amount) || 0;
                const outstanding = Math.max(0, amount - deducted);
                const fullyRecovered = outstanding < 0.01 && amount > 0;
                const partial = deducted > 0 && !fullyRecovered;
                const bg = fullyRecovered ? '' : partial ? 'bg-amber-50/40' : 'bg-amber-50';
                return (
                  <tr key={a.id} className={'hover:bg-slate-50 border-b border-slate-100 ' + bg}>
                    <td className="td text-sm whitespace-nowrap">{a.advance_date}</td>
                    <td className="td text-right font-semibold">{inr(amount)}</td>
                    <td className={'td text-right ' + (deducted > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400')}>
                      {deducted > 0 ? inr(deducted) : '—'}
                    </td>
                    <td className={'td text-right ' + (outstanding > 0 ? 'text-red-700 font-semibold' : 'text-slate-400')}>
                      {outstanding > 0 ? inr(outstanding) : '✓ Cleared'}
                    </td>
                    <td className="td text-xs">
                      <div>{a.mode || '—'}</div>
                      {a.reference && <div className="text-slate-500">{a.reference}</div>}
                    </td>
                    <td className="td text-xs whitespace-nowrap">
                      {fullyRecovered
                        ? <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">Fully recovered</span>
                        : partial
                          ? <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Partial</span>
                          : <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payroll' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title text-sm">Payroll history — every run this employee was in</div>
            <Link to="/hr/payroll" className="text-xs text-brand-600 hover:underline">Manage in Payroll page →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Period</th>
                  <th className="th text-right">Shifts / Days</th>
                  <th className="th text-right">Gross</th>
                  <th className="th text-right">Advance recovered</th>
                  <th className="th text-right">Net pay</th>
                  <th className="th text-right">Paid</th>
                  <th className="th">Status</th>
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {payrollEntries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="td text-center text-slate-500 py-8">
                      This employee hasn't been in any payroll run yet.
                      <div className="mt-3">
                        <button className="btn-primary text-sm" onClick={openGen}>💰 Generate the first payroll</button>
                      </div>
                    </td>
                  </tr>
                )}
                {payrollEntries.map((p) => {
                  const paidAmt = Number(p.paid_amount) || 0;
                  const balance = Math.max(0, (Number(p.net_pay) || 0) - paidAmt);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="td text-sm whitespace-nowrap">
                        <div className="font-semibold">{p.run_start || p.run_period}</div>
                        {p.run_end && <div className="text-xs text-slate-500">→ {p.run_end}</div>}
                      </td>
                      <td className="td text-right text-xs whitespace-nowrap">
                        {p.pay_mode === 'per_shift'
                          ? `${p.shifts_worked} shifts`
                          : `${p.days_present}d · ${p.days_leave}L`}
                      </td>
                      <td className="td text-right">{inr(p.gross)}</td>
                      <td className={'td text-right ' + (p.advance_deduction > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                        {p.advance_deduction > 0 ? inr(p.advance_deduction) : '—'}
                      </td>
                      <td className="td text-right font-bold text-emerald-700">{inr(p.net_pay)}</td>
                      <td className="td text-right">
                        <div className="text-emerald-700 font-semibold">{inr(paidAmt)}</div>
                        {balance > 0 && !p.paid && <div className="text-[10px] text-red-700">Bal {inr(balance)}</div>}
                      </td>
                      <td className="td text-xs">
                        {p.paid
                          ? <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">✓ Paid {p.paid_date || ''}</span>
                          : paidAmt > 0
                            ? <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Partial</span>
                            : <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">Pending</span>}
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        {!p.paid && (
                          <button className="btn-primary text-xs py-1" onClick={() => openPay(p)}>
                            {paidAmt > 0 ? '+ Pay balance' : '+ Pay'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {payrollEntries.length > 0 && (
                  <tr className="bg-slate-100 font-bold">
                    <td className="td text-right">TOTAL</td>
                    <td></td>
                    <td className="td text-right">{inr(payrollEntries.reduce((s, p) => s + (Number(p.gross) || 0), 0))}</td>
                    <td className="td text-right text-amber-700">{inr(payrollEntries.reduce((s, p) => s + (Number(p.advance_deduction) || 0), 0))}</td>
                    <td className="td text-right text-emerald-700">{inr(payrollEntries.reduce((s, p) => s + (Number(p.net_pay) || 0), 0))}</td>
                    <td className="td text-right text-emerald-700">{inr(payrollEntries.reduce((s, p) => s + (Number(p.paid_amount) || 0), 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leaves' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title text-sm">Leaves taken</div>
            <Link to="/hr/leaves" className="text-xs text-brand-600 hover:underline">Manage in Leaves page →</Link>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">From</th>
                <th className="th">To</th>
                <th className="th text-right">Days</th>
                <th className="th">Type</th>
                <th className="th">Status</th>
                <th className="th">Reason</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 && <tr><td colSpan={6} className="td text-center text-slate-500 py-8">No leaves recorded.</td></tr>}
              {leaves.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 border-b border-slate-100">
                  <td className="td text-sm whitespace-nowrap">{l.from_date}</td>
                  <td className="td text-sm whitespace-nowrap">{l.to_date}</td>
                  <td className="td text-right">{l.days}</td>
                  <td className="td text-xs">{l.leave_type}</td>
                  <td className="td text-xs">
                    <span className={'inline-block px-2 py-0.5 rounded font-semibold ' +
                      (l.status === 'Approved' ? 'bg-emerald-100 text-emerald-700'
                        : l.status === 'Rejected' ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-800')}>
                      {l.status}
                    </span>
                  </td>
                  <td className="td text-xs text-slate-500">{l.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inline pay modal — same 3-section design as the Payroll page */}
      <Modal
        open={!!payingEntry}
        title={payingEntry ? `Pay & Recover advance — ${emp?.name || ''}` : ''}
        onClose={closePay}
        size="lg"
      >
        {payingEntry && modalCalc && (
          <div className="p-5 space-y-4">
            {/* Salary breakdown */}
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-600">
                1. Salary breakdown ({payingEntry.run_start || payingEntry.run_period} → {payingEntry.run_end || ''})
              </div>
              <div className="p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Gross</span><span className="font-semibold">{inr(modalCalc.gross)}</span></div>
                {modalCalc.otherDed > 0 && <div className="flex justify-between text-slate-500"><span>− Other deductions</span><span>{inr(modalCalc.otherDed)}</span></div>}
                <div className="flex justify-between text-amber-700"><span>− Advance recovery</span><span className="font-semibold">{inr(modalCalc.newAdvance)}</span></div>
                <div className="flex justify-between pt-2 mt-2 border-t border-slate-200 font-bold text-emerald-700">
                  <span>= Net pay</span><span className="text-base">{inr(modalCalc.projectedNet)}</span>
                </div>
              </div>
            </div>

            {/* Advance recovery */}
            <div className="rounded-md border border-amber-200 overflow-hidden">
              <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs font-bold uppercase text-amber-800 flex items-center justify-between">
                <span>2. Advance recovery</span>
                <span className="text-[10px] font-normal text-amber-700 normal-case">Total outstanding: <strong>{inr(advOutstandingTotal)}</strong></span>
              </div>
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Recover this run</div>
                    <input type="number" min="0" step="0.01" max={advOutstandingTotal}
                      className="input py-1 text-sm w-full mt-0.5"
                      value={advanceEditAmt}
                      onChange={(e) => setAdvanceEditAmt(e.target.value)} />
                  </div>
                  <div className="rounded bg-white border border-slate-200 p-2">
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Outstanding</div>
                    <div className="mt-1 font-semibold text-slate-800">{inr(advOutstandingTotal)}</div>
                  </div>
                  <div className={'rounded bg-white border p-2 ' + (modalCalc.remainingAdvanceAfter > 0 ? 'border-amber-300' : 'border-emerald-300')}>
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Carried forward</div>
                    <div className={'mt-1 font-semibold ' + (modalCalc.remainingAdvanceAfter > 0 ? 'text-amber-700' : 'text-emerald-700')}>
                      {inr(Math.max(0, modalCalc.remainingAdvanceAfter))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt(String(advOutstandingTotal))}>Recover all</button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('1000')}>₹1,000</button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('2000')}>₹2,000</button>
                  <button className="btn-secondary text-[10px] px-2 py-0.5" onClick={() => setAdvanceEditAmt('0')}>Skip</button>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="rounded-md border border-emerald-200 overflow-hidden">
              <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 text-xs font-bold uppercase text-emerald-800">3. Payment</div>
              <div className="p-3 space-y-2">
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
                    <div className="text-[10px] uppercase text-slate-500 font-semibold">Balance</div>
                    <div className="mt-1 font-semibold text-red-700">{inr(modalCalc.projectedBalance)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Pay now (₹)</label>
                    <input type="number" min="0" step="0.01" className="input"
                      value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                    <div className="text-[10px] text-slate-500 mt-1">Leave as 0 to only update the advance recovery. Extra becomes a new advance.</div>
                  </div>
                  <div>
                    <label className="label">Payment date</label>
                    <input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex gap-2 text-xs flex-wrap">
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount(String(modalCalc.projectedBalance))}>Full balance ({inr(modalCalc.projectedBalance)})</button>
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount(String(+(modalCalc.projectedBalance / 2).toFixed(2)))}>Half</button>
                  <button className="btn-secondary text-xs" onClick={() => setPayAmount('0')}>Skip</button>
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

      {/* Generate-payroll-for-just-this-employee modal */}
      <Modal
        open={showGen}
        title={`Generate payroll — ${emp?.name || ''}`}
        onClose={() => setShowGen(false)}
      >
        <div className="p-5 space-y-3">
          <div className="text-xs text-slate-600">
            Generates a payroll entry <strong>only for {emp?.name}</strong>. If a payroll run already exists for
            this period, this employee's entry is appended to it; otherwise a new single-employee run is created.
          </div>
          <div>
            <label className="label">Quick period</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={() => { setGenStart(genPresets.thisWeek.start); setGenEnd(genPresets.thisWeek.end); }}>
                This week ({genPresets.thisWeek.start} → {genPresets.thisWeek.end})
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => { setGenStart(genPresets.lastWeek.start); setGenEnd(genPresets.lastWeek.end); }}>
                Last week ({genPresets.lastWeek.start} → {genPresets.lastWeek.end})
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => { setGenStart(genPresets.thisMonth.start); setGenEnd(genPresets.thisMonth.end); }}>
                This month
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From *</label>
              <input type="date" className="input" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
            </div>
            <div>
              <label className="label">To *</label>
              <input type="date" className="input" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
            </div>
          </div>
          <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded p-2">
            <strong>What happens:</strong> pulls attendance from {genStart} to {genEnd}, computes gross using {emp?.pay_mode || 'per-shift'} rate,
            recovers all outstanding advances (you can adjust after — the pay dialog will open automatically).
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input className="input" value={genNotes} onChange={(e) => setGenNotes(e.target.value)}
              placeholder={`Single-employee run for ${emp?.name || ''}`} />
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowGen(false)}>Cancel</button>
          <button className="btn-primary" onClick={submitGen}>Generate & pay</button>
        </div>
      </Modal>
    </>
  );
}
