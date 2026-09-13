import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { money } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const CATEGORIES = ['Plumbing', 'Roofing', 'Electrical', 'Fabrication', 'Labour', 'Material', 'Other'];
const GST_PRESETS = [0, 5, 12, 18, 28];

const emptyForm = () => ({
  id: null,
  name: '',
  description: '',
  category: 'Fabrication',
  hsn_code: '',
  unit: 'Nos',
  rate: 0,
  gst_rate: 18,
  is_active: 1,
});

export default function Products() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = () => window.api.products.list().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== 'All' && r.category !== category) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.hsn_code || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, category]);

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
      toast.error('Product name is required');
      return;
    }
    if (form.id) {
      await window.api.products.update(form);
      toast.success('Product updated');
    } else {
      await window.api.products.create(form);
      toast.success('Product added');
    }
    setOpen(false);
    load();
  };

  const remove = async (r) => {
    if (!confirm(`Delete product "${r.name}"?`)) return;
    await window.api.products.remove(r.id);
    toast.success('Deleted');
    load();
  };

  return (
    <>
      <PageHeader
        title="Products & Services"
        subtitle="Admin only — items available in the quotation dropdown."
        right={
          <button className="btn-primary" onClick={openNew}>
            + Add product
          </button>
        }
      />

      <div className="card">
        <div className="card-header gap-3">
          <div className="flex-1 flex items-center gap-2">
            <input
              className="input max-w-sm"
              placeholder="Search by name, HSN or description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="input max-w-[180px]"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>All</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500">{filtered.length} of {rows.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Category</th>
                <th className="th">HSN / SAC</th>
                <th className="th">Unit</th>
                <th className="th text-right">Rate</th>
                <th className="th text-right">GST</th>
                <th className="th">Active</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="td text-center text-slate-500 py-10">
                    No products yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="font-medium">{r.name}</div>
                    {r.description && (
                      <div className="text-xs text-slate-500 truncate max-w-xs">{r.description}</div>
                    )}
                  </td>
                  <td className="td">{r.category || '—'}</td>
                  <td className="td text-xs">{r.hsn_code || '—'}</td>
                  <td className="td">{r.unit}</td>
                  <td className="td text-right font-medium">₹ {money(r.rate)}</td>
                  <td className="td text-right">{money(r.gst_rate)}%</td>
                  <td className="td">
                    <span className={r.is_active ? 'badge-accepted' : 'badge-draft'}>
                      {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit product' : 'Add product'} size="lg">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input min-h-[70px]"
              placeholder="Specs / details shown on the quotation"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">HSN / SAC code <span className="text-xs text-slate-400 font-normal">(shows on invoices)</span></label>
            <input
              className="input"
              placeholder="e.g. 7308 or 995461"
              value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Unit</label>
            <input
              className="input"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Rate (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">GST rate (%)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {GST_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm({ ...form, gst_rate: r })}
                  className={
                    'px-3 py-1 text-xs rounded-full border ' +
                    (Number(form.gst_rate) === r
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')
                  }
                >
                  {r}%
                </button>
              ))}
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.gst_rate}
              onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={Boolean(form.is_active)}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })}
            />
            <label htmlFor="is_active" className="text-sm text-slate-700">
              Active (available in quotation dropdown)
            </label>
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
