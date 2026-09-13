import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { inr, money, today } from '../utils/format.js';
import { assetUrl } from '../utils/asset.js';
import { useToast } from '../context/ToastContext.jsx';

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];
const emptyExpense = () => ({
  expense_date: today(),
  category: 'Material',
  amount: 0,
  paid_amount: 0, // will default to amount on save if not touched
  payment_status: 'paid', // 'paid' | 'partial' | 'credit' — controls how paid_amount is derived
  vendor_id: null,
  vendor_name: '',
  description: '',
  payment_mode: 'Cash',
  reference: '',
  receipt_path: '',
  items: [],
  deduct_from_income: 1,
});

function derivePaymentStatus(row) {
  if (!row) return 'paid';
  const paid = Number(row.paid_amount) || 0;
  const amt = Number(row.amount) || 0;
  if (paid >= amt) return 'paid';
  if (paid <= 0) return 'credit';
  return 'partial';
}

const emptyItem = () => ({ name: '', size: '', weight: '', unit: 'Nos', quantity: 1, rate: 0, amount: 0 });

// Categories that support line-item breakdown (materials purchased)
const ITEMIZABLE = new Set(['Material']);

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function Expenses() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({ total: 0, byCategory: [] });
  const [filters, setFilters] = useState({ from: firstOfMonth(), to: '', category: '' });
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyExpense());
  const [tab, setTab] = useState('all'); // all | deducted | extra

  const load = async () => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, s] = await Promise.all([
      window.api.expenses.list(clean),
      window.api.expenses.stats(clean),
    ]);
    setRows(list);
    setStats(s);
  };

  useEffect(() => {
    (async () => {
      const [cats, vs] = await Promise.all([
        window.api.expenses.categories(),
        window.api.vendors.list(),
      ]);
      setCategories(cats);
      setVendors(vs);
    })();
  }, []);

  useEffect(() => { load(); }, [filters.from, filters.to, filters.category]);

  const openNew = () => { setEditing(null); setForm(emptyExpense()); setShowForm(true); };
  const openEdit = async (e) => {
    const full = await window.api.expenses.get(e.id);
    setEditing(full);
    setForm({
      ...full,
      items: full.items || [],
      payment_status: derivePaymentStatus(full),
    });
    setShowForm(true);
  };

  const [payingId, setPayingId] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const recordPayment = async () => {
    if (!payingId) return;
    const amt = Number(payAmount);
    if (!(amt > 0)) return toast.error('Enter an amount > 0');
    try {
      await window.api.expenses.recordPayment(payingId, amt);
      toast.success('Payment recorded');
      setPayingId(null); setPayAmount('');
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const setItem = (idx, patch) => {
    setForm((f) => ({
      ...f,
      items: (f.items || []).map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        const qty = Number(merged.quantity) || 0;
        const rate = Number(merged.rate) || 0;
        if (patch.quantity != null || patch.rate != null) merged.amount = +(qty * rate).toFixed(2);
        return merged;
      }),
    }));
  };
  const addItem = () => setForm((f) => ({ ...f, items: [...(f.items || []), emptyItem()] }));
  const removeItem = (idx) => setForm((f) => ({ ...f, items: (f.items || []).filter((_, i) => i !== idx) }));
  const itemsTotal = (form.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const showItems = ITEMIZABLE.has(form.category);

  const pickReceipt = async () => {
    const p = await window.api.dialog.pickReceipt();
    if (p) setForm((f) => ({ ...f, receipt_path: p }));
  };

  const save = async () => {
    if (!form.expense_date) return toast.error('Date is required');
    const payload = { ...form };
    if (showItems && (form.items || []).length > 0) {
      payload.amount = itemsTotal;
    }
    const amt = Number(payload.amount) || 0;
    if (!(amt > 0)) return toast.error('Amount must be > 0');
    // Derive paid_amount from payment_status radio (only Partial keeps the user-entered value)
    if (form.payment_status === 'paid') payload.paid_amount = amt;
    else if (form.payment_status === 'credit') payload.paid_amount = 0;
    else {
      const p = Number(form.paid_amount) || 0;
      if (p <= 0) return toast.error('Enter the amount already paid');
      if (p >= amt) return toast.error('Partial paid must be less than total. Choose "Paid" instead.');
      payload.paid_amount = p;
    }
    try {
      const saved = editing
        ? await window.api.expenses.update({ ...payload, id: editing.id })
        : await window.api.expenses.create(payload);
      toast.success(editing ? 'Expense updated' : 'Expense added');
      setShowForm(false);
      // Optimistic update: if the new row falls outside the current filter window,
      // widen the filter so the user actually SEES what they just saved.
      if (saved && saved.expense_date) {
        setFilters((f) => {
          const next = { ...f };
          if (f.from && saved.expense_date < f.from) next.from = saved.expense_date;
          if (f.to && saved.expense_date > f.to) next.to = saved.expense_date;
          if (f.category && f.category !== saved.category) next.category = '';
          return next;
        });
      }
      await load();
    } catch (err) { toast.error(err.message || 'Save failed'); }
  };

  const remove = async (e) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await window.api.expenses.remove(e.id);
      // Optimistic UI: drop from rows immediately so it disappears even if load() is slow.
      setRows((prev) => prev.filter((r) => r.id !== e.id));
      toast.success('Expense deleted');
      await load();
    } catch (err) { toast.error(err.message || 'Delete failed'); }
  };

  const filteredRows = useMemo(() => {
    let list = rows;
    if (tab === 'deducted') list = list.filter((r) => r.deduct_from_income !== 0 && r.deduct_from_income !== false);
    else if (tab === 'extra') list = list.filter((r) => r.deduct_from_income === 0 || r.deduct_from_income === false);
    else if (tab === 'credit') list = list.filter((r) => (r.amount || 0) > (r.paid_amount || 0));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const vendor = (r.vendor_name || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        const ref = (r.reference || '').toLowerCase();
        return vendor.includes(q) || desc.includes(q) || ref.includes(q);
      });
    }
    return list;
  }, [rows, tab, search]);
  const totalShown = useMemo(() => filteredRows.reduce((s, r) => s + (r.amount || 0), 0), [filteredRows]);
  const totalOwing = useMemo(
    () => rows.reduce((s, r) => s + Math.max(0, (r.amount || 0) - (r.paid_amount || 0)), 0),
    [rows]
  );
  const tabCounts = useMemo(() => ({
    all: rows.length,
    deducted: rows.filter((r) => r.deduct_from_income !== 0 && r.deduct_from_income !== false).length,
    extra: rows.filter((r) => r.deduct_from_income === 0 || r.deduct_from_income === false).length,
    credit: rows.filter((r) => (r.amount || 0) > (r.paid_amount || 0)).length,
  }), [rows]);

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Money going out — track by category and vendor."
        right={
          <>
            <ExportButton
              filename={`Expenses ${filters.from || ''}${filters.to ? ' to ' + filters.to : ''}`.trim()}
              title="Expenses"
              subtitle={`${filteredRows.length} entries · Total ${inr(totalShown)}`}
              period={filters.from ? { from: filters.from, to: filters.to || today() } : undefined}
              tiles={[
                { label: 'Total', value: inr(stats.total || 0) },
                { label: 'Deducted (paid)', value: inr(stats.total_deducted || 0) },
                { label: 'Extra', value: inr(stats.total_extra || 0), tone: 'warn' },
                { label: 'Owing to vendors', value: inr(totalOwing), tone: 'bad' },
              ]}
              columns={[
                { key: 'expense_date', label: 'Date' },
                { key: 'category', label: 'Category' },
                { key: 'vendor_name', label: 'Vendor' },
                { key: 'description', label: 'Description' },
                { key: 'payment_mode', label: 'Mode' },
                { key: 'reference', label: 'Reference' },
                { key: 'amount', label: 'Amount', align: 'right', format: (v) => inr(v) },
                { key: 'paid_amount', label: 'Paid', align: 'right', format: (v) => inr(v) },
                { key: 'balance', label: 'Owing', align: 'right', get: (r) => Math.max(0, (r.amount || 0) - (r.paid_amount || 0)), format: (v) => v > 0 ? inr(v) : '—' },
                { key: 'payment_status', label: 'Status', get: (r) => derivePaymentStatus(r) },
              ]}
              rows={filteredRows}
              disabled={filteredRows.length === 0}
            />
            <button className="btn-primary" onClick={openNew}>+ Add expense</button>
          </>
        }
      />

      {/* Stats tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Total (filtered)</div>
          <div className="mt-1 text-xl font-bold text-red-700">{inr(stats.total)}</div>
          <div className="text-xs text-slate-500 mt-1">{rows.length} entries</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Deducted from income</div>
          <div className="mt-1 text-xl font-bold text-red-700">{inr(stats.total_deducted || 0)}</div>
          <div className="text-xs text-slate-500 mt-1">Reduces P&amp;L (paid only)</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Extra (not deducted)</div>
          <div className="mt-1 text-xl font-bold text-amber-700">{inr(stats.total_extra || 0)}</div>
          <div className="text-xs text-slate-500 mt-1">Tracked separately</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Owing to vendors</div>
          <div className="mt-1 text-xl font-bold text-orange-700">{inr(totalOwing)}</div>
          <div className="text-xs text-slate-500 mt-1">Credit + partial balance</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body flex flex-wrap items-end gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="label">Search</label>
            <div className="relative">
              <input
                type="text"
                className="input pr-8"
                placeholder="Vendor name, description or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  title="Clear"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="ml-auto text-sm text-slate-500">
            Total shown: <span className="font-bold text-slate-800">{inr(totalShown)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
            {[
              { key: 'all', label: 'All' },
              { key: 'deducted', label: 'Deducted' },
              { key: 'extra', label: 'Extra' },
              { key: 'credit', label: 'Credit / Partial' },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  'px-3 py-1.5 rounded text-xs font-medium transition ' +
                  (tab === t.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-800')
                }
              >
                {t.label} <span className="ml-1 opacity-70">({tabCounts[t.key] || 0})</span>
              </button>
            ))}
          </div>
          <div className="ml-auto text-sm text-slate-500">
            Total: <span className="font-bold text-slate-800">{inr(totalShown)}</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Category</th>
              <th className="th">Vendor</th>
              <th className="th">Description</th>
              <th className="th text-right">Amount</th>
              <th className="th text-right">Paid</th>
              <th className="th text-right">Owing</th>
              <th className="th">Status</th>
              <th className="th text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={9} className="td text-center text-slate-500 py-10">No expenses in this view.</td></tr>
            )}
            {filteredRows.map((r) => {
              const paid = Number(r.paid_amount) || 0;
              const amt = Number(r.amount) || 0;
              const owing = Math.max(0, amt - paid);
              const status = derivePaymentStatus(r);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">{r.expense_date}</td>
                  <td className="td whitespace-nowrap">
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-xs font-medium">{r.category}</span>
                    {r.deduct_from_income === 0 && (
                      <span
                        className="ml-1 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold"
                        title="Extra expense — NOT deducted from income"
                      >
                        EXTRA
                      </span>
                    )}
                  </td>
                  <td className="td">{r.vendor_name || '—'}</td>
                  <td className="td text-slate-600 max-w-xs truncate" title={r.description || ''}>{r.description || '—'}</td>
                  <td className="td text-right font-semibold whitespace-nowrap">{inr(amt)}</td>
                  <td className={'td text-right whitespace-nowrap ' + (status === 'paid' ? 'text-emerald-700' : 'text-slate-600')}>{inr(paid)}</td>
                  <td className={'td text-right whitespace-nowrap ' + (owing > 0 ? 'font-semibold text-orange-700' : 'text-slate-400')}>
                    {owing > 0 ? inr(owing) : '—'}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={
                      'inline-block px-2 py-0.5 rounded text-xs font-semibold ' +
                      (status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                        : status === 'partial' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700')
                    }>
                      {status === 'paid' ? '✓ Paid' : status === 'partial' ? 'Partial' : 'Credit'}
                    </span>
                  </td>
                  <td className="td text-right whitespace-nowrap">
                    {owing > 0 && (
                      <button
                        className="btn-primary text-xs py-1 mr-1"
                        onClick={() => { setPayingId(r.id); setPayAmount(String(owing)); }}
                        title={`Record a payment against ${inr(owing)} owed`}
                      >
                        + Pay
                      </button>
                    )}
                    <button className="btn-secondary text-xs mr-1" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} title={editing ? 'Edit expense' : 'Add expense'} onClose={() => setShowForm(false)} size="lg">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Amount (₹) *</label>
            <input type="number" min="0" step="0.01" className="input" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Payment mode</label>
            <select className="input" value={form.payment_mode}
              onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.deduct_from_income !== 0 && form.deduct_from_income !== false}
                onChange={(e) => setForm({ ...form, deduct_from_income: e.target.checked ? 1 : 0 })}
              />
              <span className="text-sm font-medium text-slate-800">Deduct from income</span>
            </label>
          </div>

          {/* Payment status — Paid (default) / Partial / Credit */}
          <div className="md:col-span-2">
            <label className="label">Payment status</label>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { key: 'paid', label: '✓ Fully paid', hint: 'Cash out now — full amount goes to expense' },
                { key: 'partial', label: 'Partial', hint: 'Some paid, rest on credit' },
                { key: 'credit', label: 'Credit', hint: 'Nothing paid yet — track as owing to vendor' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setForm({ ...form, payment_status: s.key })}
                  className={
                    'flex-1 text-xs py-2 rounded font-medium transition ' +
                    (form.payment_status === s.key
                      ? (s.key === 'paid' ? 'bg-emerald-600 text-white shadow'
                         : s.key === 'partial' ? 'bg-amber-500 text-white shadow'
                         : 'bg-red-500 text-white shadow')
                      : 'text-slate-500 hover:text-slate-800')
                  }
                  title={s.hint}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {form.payment_status === 'partial' && (
              <div className="mt-2">
                <label className="label">Amount paid so far (₹)</label>
                <input
                  type="number" min="0" step="0.01" className="input"
                  placeholder="e.g. 5000"
                  value={form.paid_amount || ''}
                  onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                />
                <div className="text-xs text-slate-500 mt-1">
                  Remaining owed to vendor: <strong className="text-orange-700">
                    {inr(Math.max(0, (Number(form.amount) || 0) - (Number(form.paid_amount) || 0)))}
                  </strong>
                </div>
              </div>
            )}
            {form.payment_status === 'credit' && (
              <div className="text-xs text-slate-500 mt-2">
                Nothing counts as expense yet. Full {inr(Number(form.amount) || 0)} shows in <strong>Owing</strong> column.
              </div>
            )}
          </div>
          <div>
            <label className="label">Vendor</label>
            <select className="input"
              value={form.vendor_id || ''}
              onChange={(e) => {
                const vid = Number(e.target.value) || null;
                const v = vendors.find((x) => x.id === vid);
                setForm({ ...form, vendor_id: vid, vendor_name: v ? v.name : '' });
              }}>
              <option value="">— Select vendor or free-text below —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vendor name (free-text)</label>
            <input className="input" value={form.vendor_name || ''}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Description</label>
            <textarea className="input min-h-[70px]" value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Reference (invoice #, bill #)</label>
            <input className="input" value={form.reference || ''}
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div>
            <label className="label">Receipt</label>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={pickReceipt}>
                {form.receipt_path ? 'Change' : 'Upload receipt'}
              </button>
              {form.receipt_path && (
                <>
                  <a href={assetUrl(form.receipt_path)} target="_blank" rel="noreferrer"
                    className="text-brand-600 hover:underline text-xs">View</a>
                  <button type="button" className="text-red-600 text-xs"
                    onClick={() => setForm({ ...form, receipt_path: '' })}>Remove</button>
                </>
              )}
            </div>
          </div>

          {/* Line items table — shown only for itemizable categories (Material) */}
          {showItems && (
            <div className="md:col-span-2 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase font-semibold text-slate-500">
                  Items purchased {form.vendor_name ? `from ${form.vendor_name}` : ''}
                </div>
                <button type="button" className="btn-secondary text-xs" onClick={addItem}>+ Add item</button>
              </div>
              {(form.items || []).length === 0 ? (
                <div className="text-xs text-slate-500 italic border border-dashed border-slate-200 rounded p-3 text-center">
                  Optional. Add material line items (steel rods, sheets, bolts, etc.) with size / weight to keep detailed purchase records.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="th text-left">Item</th>
                      <th className="th text-center">Size</th>
                      <th className="th text-center">Weight</th>
                      <th className="th text-center">Unit</th>
                      <th className="th text-right">Qty</th>
                      <th className="th text-right">Rate</th>
                      <th className="th text-right">Amount</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((it, idx) => (
                      <tr key={idx} className="align-top">
                        <td className="p-1">
                          <input className="input py-1 text-xs" placeholder="e.g. MS Round Bar"
                            value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input className="input py-1 text-xs text-center" placeholder="12mm"
                            value={it.size} onChange={(e) => setItem(idx, { size: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input className="input py-1 text-xs text-center" placeholder="45 kg"
                            value={it.weight} onChange={(e) => setItem(idx, { weight: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input className="input py-1 text-xs text-center"
                            value={it.unit} onChange={(e) => setItem(idx, { unit: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input type="number" min="0" step="0.01" className="input py-1 text-xs text-right"
                            value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} />
                        </td>
                        <td className="p-1">
                          <input type="number" min="0" step="0.01" className="input py-1 text-xs text-right"
                            value={it.rate} onChange={(e) => setItem(idx, { rate: e.target.value })} />
                        </td>
                        <td className="p-1 text-right font-semibold pt-2">{inr(Number(it.amount) || 0)}</td>
                        <td className="p-1 text-right pt-1.5">
                          <button className="text-red-600" onClick={() => removeItem(idx)} type="button" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={6} className="p-1.5 text-right">Total (auto-fills expense amount)</td>
                      <td className="p-1.5 text-right text-brand-700">{inr(itemsTotal)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>{editing ? 'Save changes' : 'Add expense'}</button>
        </div>
      </Modal>

      {/* Quick "Record payment" dialog for credit/partial expenses */}
      <Modal open={!!payingId} title="Record payment" onClose={() => { setPayingId(null); setPayAmount(''); }}>
        {payingId && (() => {
          const row = rows.find((r) => r.id === payingId);
          const amt = Number(row?.amount) || 0;
          const paid = Number(row?.paid_amount) || 0;
          const owing = Math.max(0, amt - paid);
          return (
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700">
                <div><strong>{row?.vendor_name || row?.category || 'Expense'}</strong> — {row?.description || ''}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Total: {inr(amt)} · Paid: {inr(paid)} · <span className="text-orange-700 font-semibold">Owing: {inr(owing)}</span>
                </div>
              </div>
              <div>
                <label className="label">Payment now (₹)</label>
                <input type="number" min="0.01" step="0.01" max={owing} className="input"
                  value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus />
                <div className="text-xs text-slate-500 mt-1">Max {inr(owing)}. Adds to expense total for P&amp;L.</div>
              </div>
              <div className="flex gap-2 text-xs">
                <button className="btn-secondary" onClick={() => setPayAmount(String(owing))}>Full remaining ({inr(owing)})</button>
                <button className="btn-secondary" onClick={() => setPayAmount(String(+(owing / 2).toFixed(2)))}>Half ({inr(owing / 2)})</button>
              </div>
            </div>
          );
        })()}
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => { setPayingId(null); setPayAmount(''); }}>Cancel</button>
          <button className="btn-primary" onClick={recordPayment}>Record payment</button>
        </div>
      </Modal>
    </>
  );
}
