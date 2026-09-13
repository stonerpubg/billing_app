import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const TYPES = ['Casual', 'Sick', 'Earned', 'Unpaid'];
const STATUSES = ['Approved', 'Pending', 'Rejected'];

function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

export default function Leaves() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [emps, setEmps] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employee_id: null, from_date: today(), to_date: today(), days: 1, leave_type: 'Casual', status: 'Approved', reason: '' });

  const load = () => window.api.leaves.list().then(setRows);
  useEffect(() => { load(); window.api.employees.list().then(setEmps); }, []);

  const openNew = () => {
    setForm({ employee_id: null, from_date: today(), to_date: today(), days: 1, leave_type: 'Casual', status: 'Approved', reason: '' });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.employee_id) return toast.error('Select an employee');
    const days = daysBetween(form.from_date, form.to_date);
    await window.api.leaves.create({ ...form, days });
    toast.success('Leave recorded');
    setShowForm(false);
    load();
  };

  const remove = async (l) => {
    if (!confirm('Delete this leave record?')) return;
    await window.api.leaves.remove(l.id);
    load();
  };

  return (
    <>
      <PageHeader
        title="Leaves"
        subtitle="Approved leaves count as paid days in payroll (except Unpaid)."
        right={<button className="btn-primary" onClick={openNew}>+ Record leave</button>}
      />

      <div className="card">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Employee</th>
              <th className="th">From</th>
              <th className="th">To</th>
              <th className="th text-right">Days</th>
              <th className="th">Type</th>
              <th className="th">Status</th>
              <th className="th">Reason</th>
              <th className="th text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="td text-center text-slate-500 py-10">No leaves recorded.</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="td font-medium">{l.employee_name}</td>
                <td className="td">{l.from_date}</td>
                <td className="td">{l.to_date}</td>
                <td className="td text-right">{l.days}</td>
                <td className="td text-xs">{l.leave_type}</td>
                <td className="td text-xs">{l.status}</td>
                <td className="td text-slate-600 max-w-xs truncate">{l.reason || '—'}</td>
                <td className="td text-right"><button className="text-red-600 text-xs" onClick={() => remove(l)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title="Record leave" onClose={() => setShowForm(false)}>
        <div className="p-5 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Employee *</label>
            <select className="input" value={form.employee_id || ''} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) || null })}>
              <option value="">Select…</option>
              {emps.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div><label className="label">From</label><input type="date" className="input" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
          <div><label className="label">To</label><input type="date" className="input" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
          <div><label className="label">Type</label><select className="input" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="label">Status</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="col-span-2"><label className="label">Reason</label><textarea className="input min-h-[60px]" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="col-span-2 text-sm text-slate-600">Days: <strong>{daysBetween(form.from_date, form.to_date)}</strong></div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </>
  );
}
