import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';

const emptyForm = () => ({
  id: null,
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
});

export default function Customers() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = () => window.api.customers.list().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.gstin || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const openNew = () => {
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (r) => {
    setForm({ ...r });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.id) {
      await window.api.customers.update(form);
      toast.success('Customer updated');
    } else {
      await window.api.customers.create(form);
      toast.success('Customer added');
    }
    setOpen(false);
    load();
  };

  const remove = async (r) => {
    if (!confirm(`Delete customer "${r.name}"?`)) return;
    await window.api.customers.remove(r.id);
    toast.success('Deleted');
    load();
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Manage the customers you quote to."
        right={
          <button className="btn-primary" onClick={openNew}>
            + Add customer
          </button>
        }
      />

      <div className="card">
        <div className="card-header">
          <input
            className="input max-w-sm"
            placeholder="Search by name, city, phone, GSTIN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="text-sm text-slate-500">{filtered.length} of {rows.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Contact</th>
                <th className="th">Phone</th>
                <th className="th">City</th>
                <th className="th">GSTIN</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="td text-center text-slate-500 py-10">
                    No customers yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{r.name}</td>
                  <td className="td">{r.contact_person || '—'}</td>
                  <td className="td">{r.phone || '—'}</td>
                  <td className="td">{r.city || '—'}</td>
                  <td className="td">{r.gstin || '—'}</td>
                  <td className="td text-right">
                    <button className="btn-ghost text-xs" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit customer' : 'Add customer'} size="lg">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['name', 'Name *'],
            ['contact_person', 'Contact person'],
            ['phone', 'Phone'],
            ['email', 'Email'],
            ['gstin', 'GSTIN'],
            ['pincode', 'Pincode'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input
                className="input"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <textarea
              className="input min-h-[70px]"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="label">City</label>
            <input
              className="input"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">State</label>
            <input
              className="input"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </Modal>
    </>
  );
}
