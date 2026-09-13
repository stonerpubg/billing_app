import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';

// Show a compact badge summarising the day for the grid cell.
// Uses "½" and "1½" for half-shift values so it fits in the cell.
function shiftBadge(n) {
  if (n == null) return '';
  if (n === 0) return '';
  if (n === 0.5) return '½';
  if (n === 1) return '1';
  if (n === 1.5) return '1½';
  if (n === 2) return '2';
  if (n === 2.5) return '2½';
  if (n === 3) return '3';
  if (n === 3.5) return '3½';
  if (n === 4) return '4';
  return String(n);
}
function rowToBadge(row) {
  if (!row) return '';
  if (row.status === 'Leave') return 'L';
  if (row.status === 'Absent' && (!row.shifts_worked || row.shifts_worked === 0)) return 'A';
  const n = Number(row.shifts_worked) || 0;
  if (n > 0) return shiftBadge(n);
  if (row.status === 'Present') return '2';
  if (row.status === 'Half') return '½';
  return '';
}
const badgeColor = (b) => {
  if (b === '½') return 'bg-amber-100 text-amber-700';
  if (b === '1') return 'bg-amber-100 text-amber-700';
  if (b === '1½') return 'bg-amber-200 text-amber-800';
  if (b === '2' || b === '2½') return 'bg-emerald-100 text-emerald-700';
  if (b === '3' || b === '3½') return 'bg-emerald-200 text-emerald-800';
  if (b === '4') return 'bg-emerald-300 text-emerald-900';
  if (b === 'L') return 'bg-blue-100 text-blue-700';
  if (b === 'A') return 'bg-red-100 text-red-700';
  return 'bg-slate-50 text-slate-400 hover:bg-slate-100';
};

// Date helpers
function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function sundayOf(d) {
  const day = d.getDay();
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}
function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Picker presets — the four options the user actually uses.
const SHIFT_PRESETS = [
  { value: 0.5, label: '½ shift' },
  { value: 1, label: '1 shift' },
  { value: 1.5, label: '1½ shifts' },
  { value: 2, label: '2 shifts' },
];

export default function Attendance() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [monthPeriod, setMonthPeriod] = useState(currentMonth());
  const [weekAnchor, setWeekAnchor] = useState(() => isoDate(new Date())); // any date in the week
  const [matrix, setMatrix] = useState(null);

  // Picker modal state
  const [picker, setPicker] = useState(null);
  // picker = { emp, dateStr, row, pick: { kind: 'shifts'|'leave'|'absent', value? } | null }

  // Compute the fetch key
  const fetchKey = useMemo(() => {
    if (viewMode === 'week') {
      const start = sundayOf(new Date(weekAnchor));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return `${isoDate(start)}..${isoDate(end)}`;
    }
    return monthPeriod;
  }, [viewMode, weekAnchor, monthPeriod]);

  const load = () => window.api.attendance.matrix(fetchKey).then(setMatrix);
  useEffect(() => { load(); }, [fetchKey]);

  const openPicker = (emp, dateStr, row) => {
    // Restore the currently-recorded selection into the picker state.
    let pick = null;
    if (row?.status === 'Leave') pick = { kind: 'leave' };
    else if (row?.status === 'Absent') pick = { kind: 'absent' };
    else if (row && Number(row.shifts_worked) > 0) pick = { kind: 'shifts', value: Number(row.shifts_worked) };
    setPicker({ emp, dateStr, row, pick });
  };

  // Pick auto-saves and closes the modal. Reopening the picker restores the current selection so the user can edit.
  const pickAndSave = async (pick) => {
    if (!picker) return;
    let shifts_worked = 0;
    let status = 'Absent';
    if (pick?.kind === 'leave') status = 'Leave';
    else if (pick?.kind === 'absent') status = 'Absent';
    else if (pick?.kind === 'shifts') {
      shifts_worked = pick.value;
      status = shifts_worked >= 1 ? 'Present' : 'Half';
    }
    try {
      await window.api.attendance.upsert({
        employee_id: picker.emp.id,
        att_date: picker.dateStr,
        status, shifts_worked, shift_ids: [],
      });
      setPicker(null);
      load();
    } catch (e) { toast.error(e.message || 'Save failed'); }
  };

  const clearPicker = async () => {
    if (!picker || !picker.row) { setPicker(null); return; }
    await window.api.attendance.remove(picker.row.id);
    setPicker(null);
    load();
  };

  // Compute the dates and lookup func for the current view
  const view = useMemo(() => {
    if (!matrix) return null;
    if (matrix.mode === 'range') {
      return {
        dates: matrix.dates,
        getRow: (emp, dateStr) => emp.byDate?.[dateStr],
        headerFor: (dateStr) => ({
          d: new Date(dateStr).getDate(),
          dow: new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short' }),
        }),
      };
    }
    // month mode
    const days = matrix.days;
    const period = matrix.period;
    const dates = Array.from({ length: days }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
    return {
      dates,
      getRow: (emp, dateStr) => emp.byDay?.[dateStr.slice(-2)],
      headerFor: (dateStr) => ({
        d: Number(dateStr.slice(-2)),
        dow: new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short' })[0],
      }),
    };
  }, [matrix]);

  const shiftWeekBy = (delta) => {
    const s = sundayOf(new Date(weekAnchor));
    s.setDate(s.getDate() + delta * 7);
    setWeekAnchor(isoDate(s));
  };

  const weekLabel = useMemo(() => {
    if (viewMode !== 'week') return '';
    const s = sundayOf(new Date(weekAnchor));
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return `${s.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} → ${e.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }, [viewMode, weekAnchor]);

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle="Click any day cell to mark which shifts the employee worked."
        right={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
              ].map((m) => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key)}
                  className={
                    'px-3 py-1 rounded text-xs font-medium transition ' +
                    (viewMode === m.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-800')
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
            {viewMode === 'month' ? (
              <input type="month" className="input py-1 text-sm" value={monthPeriod} onChange={(e) => setMonthPeriod(e.target.value)} />
            ) : (
              <div className="flex items-center gap-1">
                <button className="btn-secondary text-xs px-2 py-1" onClick={() => shiftWeekBy(-1)}>◀</button>
                <input type="date" className="input py-1 text-sm" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)} />
                <button className="btn-secondary text-xs px-2 py-1" onClick={() => shiftWeekBy(1)}>▶</button>
              </div>
            )}
          </div>
        }
      />

      {viewMode === 'week' && (
        <div className="text-xs text-slate-500 mb-2">Showing week: <strong className="text-slate-700">{weekLabel}</strong> (Sun → Sat) — this is one payroll week.</div>
      )}

      {/* Legend — matches the picker options */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs items-center">
        <span className="text-slate-500 font-medium">Shifts →</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-amber-100 text-amber-700 text-center font-bold text-[11px] leading-5">½</span> half</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-amber-100 text-amber-700 text-center font-bold text-[11px] leading-5">1</span> one</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-amber-200 text-amber-800 text-center font-bold text-[11px] leading-5">1½</span> one and half</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-emerald-100 text-emerald-700 text-center font-bold text-[11px] leading-5">2</span> two</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-blue-100 text-blue-700 text-center font-bold text-[11px] leading-5">L</span> Leave</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 h-5 rounded bg-red-100 text-red-700 text-center font-bold text-[11px] leading-5">A</span> Absent</span>
      </div>

      <div className="card overflow-x-auto">
        {matrix && matrix.employees.length === 0 ? (
          <div className="p-6 text-center text-slate-500">Add employees first to start tracking attendance.</div>
        ) : view && matrix ? (
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="th sticky left-0 bg-white z-10 min-w-[180px]">Employee</th>
                {view.dates.map((dateStr) => {
                  const h = view.headerFor(dateStr);
                  return (
                    <th key={dateStr} className={'th p-1 text-center ' + (viewMode === 'week' ? 'min-w-[80px]' : 'min-w-[28px]')}>
                      <div className={viewMode === 'week' ? 'text-xs font-bold' : 'text-[10px]'}>{h.d}</div>
                      <div className={viewMode === 'week' ? 'text-[10px] text-slate-500' : 'text-[9px] text-slate-400'}>{h.dow}</div>
                    </th>
                  );
                })}
                <th className="th text-center min-w-[60px]">Shifts</th>
              </tr>
            </thead>
            <tbody>
              {matrix.employees.map((emp) => {
                const total = view.dates.reduce((sum, dateStr) => {
                  const c = view.getRow(emp, dateStr);
                  if (!c) return sum;
                  const n = Number(c.shifts_worked) || 0;
                  if (n > 0) return sum + n;
                  if (c.status === 'Present') return sum + 2;
                  if (c.status === 'Half') return sum + 1;
                  return sum;
                }, 0);
                return (
                  <tr key={emp.id} className="border-b border-slate-100">
                    <td className="td sticky left-0 bg-white z-10 font-medium">{emp.name}</td>
                    {view.dates.map((dateStr) => {
                      const cell = view.getRow(emp, dateStr);
                      const b = rowToBadge(cell);
                      return (
                        <td key={dateStr} className="p-0.5 text-center">
                          <button
                            onClick={() => openPicker(emp, dateStr, cell)}
                            className={
                              (viewMode === 'week' ? 'w-16 h-8 ' : 'w-7 h-7 ') +
                              'rounded text-[11px] font-bold transition ' + badgeColor(b)
                            }
                            title={b ? 'Click to edit' : 'Click to mark attendance'}
                          >
                            {b || '·'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="td text-center text-sm font-semibold text-emerald-700">{total % 1 === 0 ? total : total.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-6 text-slate-500">Loading…</div>
        )}
      </div>

      {/* Shift picker modal */}
      <Modal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={
          picker
            ? `${picker.emp.name} — ${new Date(picker.dateStr).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}`
            : ''
        }
      >
        {picker && (
          <div className="p-5 space-y-4">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                How many shifts did they work?
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SHIFT_PRESETS.map((p) => {
                  const active = picker.pick?.kind === 'shifts' && picker.pick.value === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => pickAndSave({ kind: 'shifts', value: p.value })}
                      className={
                        'py-3 rounded border font-semibold transition text-sm ' +
                        (active
                          ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200 text-emerald-800'
                          : 'bg-white border-slate-200 hover:border-slate-400 text-slate-700')
                      }
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => pickAndSave({ kind: 'leave' })}
                className={
                  'py-3 rounded border font-semibold transition text-sm ' +
                  (picker.pick?.kind === 'leave'
                    ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200 text-blue-800'
                    : 'bg-white border-slate-200 hover:border-slate-400 text-slate-700')
                }
              >
                Leave
              </button>
              <button
                type="button"
                onClick={() => pickAndSave({ kind: 'absent' })}
                className={
                  'py-3 rounded border font-semibold transition text-sm ' +
                  (picker.pick?.kind === 'absent'
                    ? 'bg-red-50 border-red-500 ring-2 ring-red-200 text-red-800'
                    : 'bg-white border-slate-200 hover:border-slate-400 text-slate-700')
                }
              >
                Absent
              </button>
            </div>

            <div className="text-xs text-slate-500 text-center pt-1">
              Pick an option to save automatically. Press <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200">Esc</kbd> or click outside to close without changes.
            </div>
          </div>
        )}
        {picker?.row && (
          <div className="p-3 border-t border-slate-200 flex justify-center">
            <button
              className="btn-ghost text-xs text-red-600"
              onClick={clearPicker}
            >
              Clear this day
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
