import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';

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

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.gstin || '').toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you buy from (labour, material, transport, etc)."
        right={<button className="btn-primary" onClick={openNew}>+ Add vendor</button>}
      />

      <div className="card">
        <div className="card-header">
          <input className="input max-w-sm" placeholder="Search…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="text-sm text-slate-500">{filtered.length} of {rows.length}</div>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Phone</th>
              <th className="th">Email</th>
              <th className="th">GSTIN</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="td text-center text-slate-500 py-10">No vendors yet.</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="td font-semibold">{r.name}</td>
                <td className="td">{r.phone || '—'}</td>
                <td className="td">{r.email || '—'}</td>
                <td className="td">{r.gstin || '—'}</td>
                <td className="td text-right">
                  <button className="btn-secondary text-xs mr-1" onClick={() => openEdit(r)}>Edit</button>
                  <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
