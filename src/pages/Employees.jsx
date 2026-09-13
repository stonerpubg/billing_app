import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { inr, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const empty = () => ({
  name: '', code: '', role: '', phone: '', email: '', address: '',
  joining_date: '', shift_id: null,
  pay_mode: 'per_shift', // per_shift | weekly | monthly
  per_shift_rate: 0,
  weekly_salary: 0,
  basic_salary: 0, hra: 0, allowances: 0, per_day_rate: 0,
  bank_account: '', bank_ifsc: '',
  is_active: 1, notes: '',
});

const PAY_MODES = [
  { key: 'per_shift', label: 'Per shift', hint: 'Pay per shift worked' },
  { key: 'weekly', label: 'Weekly salary', hint: 'Fixed weekly amount, prorated by days worked' },
  { key: 'monthly', label: 'Monthly salary', hint: 'Fixed monthly amount (basic + HRA + allowances)' },
];

export default function Employees() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showShifts, setShowShifts] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [shiftForm, setShiftForm] = useState({ name: '', start_time: '', end_time: '', hours_per_day: 8 });

  const [advEmp, setAdvEmp] = useState(null); // employee whose advances modal is open
  const [advList, setAdvList] = useState([]);
  const [advSummary, setAdvSummary] = useState({ total: 0, outstanding: 0 });
  const [advForm, setAdvForm] = useState({ advance_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
  const [editingAdvId, setEditingAdvId] = useState(null); // null = create; id = edit that advance
  const [outstandingMap, setOutstandingMap] = useState({});

  const loadAll = async () => {
    const [emps, shs] = await Promise.all([window.api.employees.list(), window.api.shifts.list()]);
    setRows(emps);
    setShifts(shs);
    // Preload outstanding advance summary per employee (small N, cheap)
    const map = {};
    await Promise.all(emps.map(async (e) => {
      map[e.id] = await window.api.advances.summary(e.id);
    }));
    setOutstandingMap(map);
  };
  useEffect(() => { loadAll(); }, []);

  const openAdvances = async (emp) => {
    setAdvEmp(emp);
    setAdvForm({ advance_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
    setEditingAdvId(null);
    const list = await window.api.advances.list({ employee_id: emp.id });
    setAdvList(list);
    setAdvSummary(await window.api.advances.summary(emp.id));
  };

  const startEditAdvance = (a) => {
    if (a.adjusted_in_run_id) {
      toast.error('This advance is already adjusted in a payroll run — delete the run first if you need to change it.');
      return;
    }
    setEditingAdvId(a.id);
    setAdvForm({
      advance_date: a.advance_date || today(),
      amount: a.amount || 0,
      mode: a.mode || 'Cash',
      reference: a.reference || '',
      notes: a.notes || '',
    });
  };

  const cancelEditAdvance = () => {
    setEditingAdvId(null);
    setAdvForm({ advance_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
  };

  const reloadAdvances = async () => {
    if (!advEmp) return;
    const list = await window.api.advances.list({ employee_id: advEmp.id });
    setAdvList(list);
    setAdvSummary(await window.api.advances.summary(advEmp.id));
    const s = await window.api.advances.summary(advEmp.id);
    setOutstandingMap((prev) => ({ ...prev, [advEmp.id]: s }));
  };

  const saveAdvance = async () => {
    if (!(Number(advForm.amount) > 0)) return toast.error('Amount must be > 0');
    try {
      if (editingAdvId) {
        await window.api.advances.update({ ...advForm, id: editingAdvId });
        toast.success('Advance updated');
      } else {
        await window.api.advances.create({ ...advForm, employee_id: advEmp.id });
        toast.success('Advance recorded');
      }
      setEditingAdvId(null);
      setAdvForm({ advance_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
      reloadAdvances();
    } catch (e) { toast.error(e.message); }
  };

  const removeAdvance = async (a) => {
    if ((Number(a.deducted_amount) || 0) > 0) {
      return toast.error('Already partially or fully recovered in a payroll run — delete the run first.');
    }
    if (!confirm('Delete this advance?')) return;
    try {
      await window.api.advances.remove(a.id);
      reloadAdvances();
    } catch (e) { toast.error(e.message); }
  };

  const openNew = () => { setEditing(null); setForm(empty()); setShowForm(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...e }); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (editing) await window.api.employees.update({ ...form, id: editing.id });
    else await window.api.employees.create(form);
    toast.success(editing ? 'Employee updated' : 'Employee added');
    setShowForm(false);
    loadAll();
  };

  const remove = async (e) => {
    if (!confirm(`Delete ${e.name}? Attendance and payroll entries will also be deleted.`)) return;
    await window.api.employees.remove(e.id);
    toast.success('Employee deleted');
    loadAll();
  };

  const addShift = async () => {
    if (!shiftForm.name.trim()) return toast.error('Shift name required');
    await window.api.shifts.create(shiftForm);
    toast.success('Shift added');
    setShiftForm({ name: '', start_time: '', end_time: '', hours_per_day: 8 });
    loadAll();
  };
  const removeShift = async (s) => {
    if (!confirm(`Delete shift "${s.name}"?`)) return;
    await window.api.shifts.remove(s.id);
    loadAll();
  };

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Staff master. Salary structure used for payroll calculation."
        right={
          <>
            <button className="btn-secondary" onClick={() => setShowShifts(true)}>Shifts</button>
            <button className="btn-primary" onClick={openNew}>+ Add employee</button>
          </>
        }
      />

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Code</th>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Phone</th>
              <th className="th">Shift</th>
              <th className="th">Pay mode</th>
              <th className="th text-right">Rate</th>
              <th className="th text-right">Advance due</th>
              <th className="th">Status</th>
              <th className="th text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="td text-center text-slate-500 py-10">No employees yet.</td></tr>}
            {rows.map((e) => {
              const outs = (outstandingMap[e.id] || { outstanding: 0 }).outstanding;
              return (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="td text-xs">{e.code || '—'}</td>
                <td className="td font-semibold">
                  <Link to={`/hr/employees/${e.id}`} className="text-brand-700 hover:text-brand-900 hover:underline">
                    {e.name}
                  </Link>
                </td>
                <td className="td">{e.role || '—'}</td>
                <td className="td">{e.phone || '—'}</td>
                <td className="td text-xs">{e.shift_name || '—'}</td>
                <td className="td text-xs">
                  <span className="inline-block px-2 py-0.5 rounded bg-slate-100 font-medium">
                    {e.pay_mode === 'per_shift' ? 'Per-shift' : e.pay_mode === 'weekly' ? 'Weekly' : 'Monthly'}
                  </span>
                </td>
                <td className="td text-right whitespace-nowrap">
                  {e.pay_mode === 'per_shift'
                    ? inr(e.per_shift_rate) + ' /shift'
                    : e.pay_mode === 'weekly'
                    ? inr(e.weekly_salary) + ' /week'
                    : inr(e.basic_salary) + ' /month'}
                </td>
                <td className={'td text-right ' + (outs > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                  {outs > 0 ? inr(outs) : '—'}
                </td>
                <td className="td">
                  <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + (e.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>
                    {e.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="td text-right whitespace-nowrap">
                  <Link
                    to={`/hr/employees/${e.id}`}
                    className="inline-block px-2 py-1 rounded text-xs font-medium bg-brand-600 text-white hover:bg-brand-700 mr-1"
                    title="Attendance, advances, payroll — everything in one place"
                  >
                    📊 View
                  </Link>
                  <button className="btn-secondary text-xs mr-1" onClick={() => openAdvances(e)}>Advances</button>
                  <button className="btn-secondary text-xs mr-1" onClick={() => openEdit(e)}>Edit</button>
                  <button className="btn-ghost text-xs text-red-600" onClick={() => remove(e)}>Delete</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title={editing ? 'Edit employee' : 'Add employee'} onClose={() => setShowForm(false)} size="lg">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className="label">Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Employee code</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div><label className="label">Role</label><input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Joining date</label><input type="date" className="input" value={form.joining_date || ''} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Address</label><textarea className="input min-h-[60px]" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div>
            <label className="label">Shift</label>
            <select className="input" value={form.shift_id || ''} onChange={(e) => setForm({ ...form, shift_id: Number(e.target.value) || null })}>
              <option value="">— None —</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.hours_per_day}h)</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 pt-6">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              <span className="text-sm">Active</span>
            </label>
          </div>
          <div className="md:col-span-2 border-t border-slate-200 pt-3">
            <div className="text-xs uppercase font-semibold text-slate-500 mb-2">Salary structure</div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Pay mode</label>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
              {PAY_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setForm({ ...form, pay_mode: m.key })}
                  className={
                    'flex-1 text-xs py-1.5 rounded font-medium transition ' +
                    (form.pay_mode === m.key ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800')
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {PAY_MODES.find((m) => m.key === form.pay_mode)?.hint}
            </div>
          </div>
          {form.pay_mode === 'per_shift' && (
            <div className="md:col-span-2">
              <label className="label">Amount per shift (₹)</label>
              <input type="number" min="0" step="1" inputMode="numeric" className="input"
                placeholder="e.g. 950"
                value={form.per_shift_rate === 0 || form.per_shift_rate === '0' ? '' : form.per_shift_rate}
                onChange={(e) => setForm({ ...form, per_shift_rate: e.target.value })} />
              <div className="text-xs text-slate-500 mt-1">
                Payroll = shifts worked × this amount. Each employee can have their own rate.
              </div>
            </div>
          )}
          {form.pay_mode === 'weekly' && (
            <div className="md:col-span-2">
              <label className="label">Weekly salary (₹)</label>
              <input type="number" min="0" step="1" inputMode="numeric" className="input"
                placeholder="e.g. 8000"
                value={form.weekly_salary === 0 || form.weekly_salary === '0' ? '' : form.weekly_salary}
                onChange={(e) => setForm({ ...form, weekly_salary: e.target.value })} />
              <div className="text-xs text-slate-500 mt-1">
                Prorated by days worked ÷ 7 in the payroll period.
              </div>
            </div>
          )}
          {form.pay_mode === 'monthly' && (
            <>
              <div><label className="label">Basic (₹/month)</label><input type="number" min="0" step="0.01" className="input" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: e.target.value })} /></div>
              <div><label className="label">HRA (₹/month)</label><input type="number" min="0" step="0.01" className="input" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} /></div>
              <div><label className="label">Other allowances (₹/month)</label><input type="number" min="0" step="0.01" className="input" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} /></div>
              <div><label className="label">Per-day rate (overrides monthly if set)</label><input type="number" min="0" step="0.01" className="input" value={form.per_day_rate} onChange={(e) => setForm({ ...form, per_day_rate: e.target.value })} /></div>
            </>
          )}
          <div><label className="label">Bank A/c</label><input className="input" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} /></div>
          <div><label className="label">IFSC</label><input className="input" value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Notes</label><textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>{editing ? 'Save' : 'Add employee'}</button>
        </div>
      </Modal>

      {/* Advances modal */}
      <Modal open={!!advEmp} title={`Advances — ${advEmp?.name || ''}`} onClose={() => setAdvEmp(null)} size="lg">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-500">Total ever given</div>
              <div className="text-lg font-bold text-slate-900">{inr(advSummary.total)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-500">Outstanding (not yet adjusted)</div>
              <div className="text-lg font-bold text-amber-700">{inr(advSummary.outstanding)}</div>
              <div className="text-xs text-slate-500 mt-0.5">Deducted from next payroll run.</div>
            </div>
          </div>

          {/* Add / edit form */}
          <div className={'border rounded-md p-3 ' + (editingAdvId ? 'border-brand-400 bg-brand-50/30' : 'border-slate-200')}>
            <div className="text-xs font-semibold text-slate-600 mb-2">
              {editingAdvId ? `Editing advance #${editingAdvId}` : 'Record new advance'}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><label className="label">Date</label><input type="date" className="input py-1 text-sm" value={advForm.advance_date} onChange={(e) => setAdvForm({ ...advForm, advance_date: e.target.value })} /></div>
              <div><label className="label">Amount (₹)</label><input type="number" min="0" step="0.01" className="input py-1 text-sm" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} /></div>
              <div><label className="label">Mode</label>
                <select className="input py-1 text-sm" value={advForm.mode} onChange={(e) => setAdvForm({ ...advForm, mode: e.target.value })}>
                  {['Cash', 'UPI', 'Bank Transfer', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="label">Reference</label><input className="input py-1 text-sm" value={advForm.reference} onChange={(e) => setAdvForm({ ...advForm, reference: e.target.value })} /></div>
              <div className="col-span-2 md:col-span-4"><label className="label">Notes</label><input className="input py-1 text-sm" value={advForm.notes} onChange={(e) => setAdvForm({ ...advForm, notes: e.target.value })} /></div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              {editingAdvId && (
                <button className="btn-secondary text-xs" onClick={cancelEditAdvance}>Cancel edit</button>
              )}
              <button className="btn-primary text-xs" onClick={saveAdvance}>
                {editingAdvId ? 'Save changes' : '+ Add advance'}
              </button>
            </div>
          </div>

          {/* History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-600">History (each advance + recovery trail)</div>
              <button
                className="text-xs text-brand-600 hover:text-brand-800 hover:underline"
                onClick={reloadAdvances}
                title="Refresh in case new advances were created from payroll over-payments"
              >
                ↻ Refresh
              </button>
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
                  <th className="th text-right"></th>
                </tr>
              </thead>
              <tbody>
                {advList.length === 0 && <tr><td colSpan={7} className="td text-center text-slate-500 py-6">No advances recorded.</td></tr>}
                {advList.map((a) => {
                  const amount = Number(a.amount) || 0;
                  const deducted = Number(a.deducted_amount) || 0;
                  const outstanding = Math.max(0, amount - deducted);
                  const fullyRecovered = outstanding < 0.01 && amount > 0;
                  const partial = deducted > 0 && !fullyRecovered;
                  const rowBg = fullyRecovered ? '' : partial ? 'bg-amber-50/40' : 'bg-amber-50';
                  const canEdit = deducted <= 0.001;
                  return (
                    <tr key={a.id} className={'hover:bg-slate-50 border-b border-slate-100 ' + rowBg}>
                      <td className="td text-sm whitespace-nowrap">{a.advance_date}</td>
                      <td className="td text-right font-semibold whitespace-nowrap">{inr(amount)}</td>
                      <td className="td text-right whitespace-nowrap">
                        <span className={deducted > 0 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {deducted > 0 ? inr(deducted) : '—'}
                        </span>
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        <span className={outstanding > 0 ? 'text-red-700 font-semibold' : 'text-slate-400'}>
                          {outstanding > 0 ? inr(outstanding) : '✓ Cleared'}
                        </span>
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
                        {a.adjusted_period && fullyRecovered && (
                          <div className="text-slate-500 mt-0.5">in Payroll {a.adjusted_period}</div>
                        )}
                      </td>
                      <td className="td text-right whitespace-nowrap">
                        {canEdit ? (
                          <>
                            <button
                              className={'text-xs mr-2 ' + (editingAdvId === a.id ? 'text-brand-700 font-semibold' : 'text-brand-600 hover:text-brand-800')}
                              onClick={() => startEditAdvance(a)}
                            >
                              {editingAdvId === a.id ? '↑ Editing' : 'Edit'}
                            </button>
                            <button className="text-red-600 text-xs hover:text-red-800" onClick={() => removeAdvance(a)}>Delete</button>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400" title="Some or all of this advance has been recovered in a payroll run">🔒 locked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={showShifts} title="Shifts" onClose={() => setShowShifts(false)}>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Name</label><input className="input" placeholder="Morning" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} /></div>
            <div><label className="label">Hours/day</label><input type="number" min="0" step="0.5" className="input" value={shiftForm.hours_per_day} onChange={(e) => setShiftForm({ ...shiftForm, hours_per_day: e.target.value })} /></div>
            <div><label className="label">Start</label><input type="time" className="input" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></div>
            <div><label className="label">End</label><input type="time" className="input" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></div>
          </div>
          <button className="btn-primary text-xs" onClick={addShift}>+ Add shift</button>

          <div className="border-t border-slate-200 pt-3">
            {shifts.length === 0 && <div className="text-sm text-slate-500">No shifts yet.</div>}
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                <div><span className="font-semibold">{s.name}</span> <span className="text-slate-500">— {s.start_time} to {s.end_time} • {s.hours_per_day}h</span></div>
                <button className="text-red-600 text-xs" onClick={() => removeShift(s)}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
