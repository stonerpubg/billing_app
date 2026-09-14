import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { inr } from '../utils/format.js';

const empty = { name: '', phone: '', email: '', gstin: '', notes: '' };

export default function Vendors() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);

  const load = () => window.api.vendors.list().then(setRows);
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setShowForm(true); };
  const openEdit = (v) => { setEditing(v); setForm(v); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Vendor name is required');
    if (editing) await window.api.vendors.update({ ...form, id: editing.id });
    else await window.api.vendors.create(form);
    toast.success(editing ? 'Vendor updated' : 'Vendor added');
    setShowForm(false);
    load();
  };

  const remove = async (v) => {
    if (!confirm(`Delete vendor "${v.name}"?`)) return;
    await window.api.vendors.remove(v.id);
    toast.success('Vendor deleted');
    load();
  };

  const [sortBy, setSortBy] = useState('name'); // name | expense_count | total_spent | outstanding

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.gstin || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
    );
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return (b[sortBy] || 0) - (a[sortBy] || 0);
  });

  const withExpenses = rows.filter((r) => (r.expense_count || 0) > 0).length;

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you buy from (labour, material, transport, etc)."
        right={<button className="btn-primary" onClick={openNew}>+ Add vendor</button>}
      />

      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-3">
          <input
            className="input max-w-sm flex-1 min-w-[200px]"
            placeholder="Search name, phone, email, GSTIN, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="input w-auto" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Sort: Name (A–Z)</option>
            <option value="expense_count">Sort: Most expenses</option>
            <option value="total_spent">Sort: Highest spend</option>
            <option value="outstanding">Sort: Highest outstanding</option>
          </select>
          <div className="text-xs text-slate-500 ml-auto">
            {filtered.length} of {rows.length} · {withExpenses} with expenses
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th">Email</th>
                <th className="th">GSTIN</th>
                <th className="th text-right">Expenses</th>
                <th className="th text-right">Total spent</th>
                <th className="th text-right">Outstanding</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="td text-center text-slate-500 py-10">No vendors yet.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-semibold">{r.name}</td>
                  <td className="td">{r.phone || '—'}</td>
                  <td className="td">{r.email || '—'}</td>
                  <td className="td">{r.gstin || '—'}</td>
                  <td className="td text-right">
                    {r.expense_count > 0
                      ? <Link to={`/expenses?vendor=${encodeURIComponent(r.name)}`} className="text-brand-600 hover:underline">{r.expense_count}</Link>
                      : <span className="text-slate-400">0</span>}
                  </td>
                  <td className="td text-right tabular-nums">{r.total_spent > 0 ? inr(r.total_spent) : '—'}</td>
                  <td className={'td text-right tabular-nums ' + (r.outstanding > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                    {r.outstanding > 0 ? inr(r.outstanding) : '—'}
                  </td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="btn-secondary text-xs mr-1" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showForm} title={editing ? 'Edit vendor' : 'Add vendor'} onClose={() => setShowForm(false)}>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['name', 'Name *'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['gstin', 'GSTIN'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" value={form[k] || ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input min-h-[70px]" value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>{editing ? 'Save changes' : 'Add vendor'}</button>
        </div>
      </Modal>
    </>
  );
}
