import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { inr, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

const emptyIncome = () => ({
  income_date: today(),
  customer_id: null,
  customer_name: '',
  amount: 0,          // total the customer owes
  received_amount: 0, // what's actually been collected so far
  payment_status: 'paid', // radio: paid | partial | credit — controls how received is derived
  mode: 'Cash',
  reference: '',
  notes: '',
});

function derivePaymentStatus(row) {
  if (!row) return 'paid';
  const rec = Number(row.received_amount) || 0;
  const amt = Number(row.amount) || 0;
  if (rec >= amt) return 'paid';
  if (rec <= 0) return 'credit';
  return 'partial';
}

function firstOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function Income() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({ total: 0, received: 0, outstanding: 0, count: 0 });
  const [filters, setFilters] = useState({ from: firstOfMonth(), to: '', customer_id: '' });
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all'); // all | paid | partial | credit
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyIncome());
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '' });
  const [payingId, setPayingId] = useState(null);
  const [payAmt, setPayAmt] = useState('');

  const load = async () => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, s] = await Promise.all([
      window.api.incomes.list(clean),
      window.api.incomes.stats(clean),
    ]);
    setRows(list);
    setStats(s);
  };
  useEffect(() => {
    (async () => {
      const cs = await window.api.customers.list();
      setCustomers(cs);
    })();
  }, []);
  useEffect(() => { load(); }, [filters.from, filters.to, filters.customer_id]);

  const openNew = () => { setEditing(null); setForm(emptyIncome()); setShowForm(true); };
  const openEdit = async (r) => {
    const full = await window.api.incomes.get(r.id);
    setEditing(full);
    setForm({ ...full, payment_status: derivePaymentStatus(full) });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.income_date) return toast.error('Date is required');
    const amt = Number(form.amount) || 0;
    if (!(amt > 0)) return toast.error('Amount must be > 0');
    if (!form.customer_id && !(form.customer_name || '').trim()) {
      return toast.error('Pick a customer or enter a name');
    }
    const payload = { ...form };
    // Derive received_amount from the payment_status radio
    if (form.payment_status === 'paid') payload.received_amount = amt;
    else if (form.payment_status === 'credit') payload.received_amount = 0;
    else {
      const r = Number(form.received_amount) || 0;
      if (r <= 0) return toast.error('Enter the amount already received');
      if (r >= amt) return toast.error('Partial received must be less than total. Choose "Fully received" instead.');
      payload.received_amount = r;
    }
    try {
      if (editing) await window.api.incomes.update({ ...payload, id: editing.id });
      else await window.api.incomes.create(payload);
      toast.success(editing ? 'Income updated' : 'Income added');
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.message || 'Save failed'); }
  };

  const remove = async (r) => {
    if (!confirm(`Delete this income entry (${inr(r.amount)} on ${r.income_date})?`)) return;
    try {
      await window.api.incomes.remove(r.id);
      toast.success('Income deleted');
      load();
    } catch (err) { toast.error(err.message || 'Delete failed'); }
  };

  const recordPayment = async () => {
    if (!payingId) return;
    const amt = Number(payAmt);
    if (!(amt > 0)) return toast.error('Enter an amount > 0');
    try {
      await window.api.incomes.recordPayment(payingId, amt);
      toast.success('Payment recorded');
      setPayingId(null); setPayAmt('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const saveNewCustomer = async () => {
    if (!newCustomer.name.trim()) return toast.error('Customer name is required');
    try {
      const created = await window.api.customers.create(newCustomer);
      setCustomers((prev) => [...prev, created]);
      setForm((f) => ({ ...f, customer_id: created.id, customer_name: created.name }));
      setNewCustomer({ name: '', phone: '', email: '', gstin: '', address: '', city: '', state: '' });
      setShowNewCustomer(false);
      toast.success(`Added customer "${created.name}"`);
    } catch (e) { toast.error(e.message || 'Failed to add customer'); }
  };

  const filteredRows = useMemo(() => {
    let list = rows;
    if (tab === 'paid') list = list.filter((r) => derivePaymentStatus(r) === 'paid');
    else if (tab === 'partial') list = list.filter((r) => derivePaymentStatus(r) === 'partial');
    else if (tab === 'credit') list = list.filter((r) => derivePaymentStatus(r) === 'credit');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = (r.customer_name || r.customer_lookup_name || '').toLowerCase();
        const ref = (r.reference || '').toLowerCase();
        const notes = (r.notes || '').toLowerCase();
        return name.includes(q) || ref.includes(q) || notes.includes(q);
      });
    }
    return list;
  }, [rows, tab, search]);

  const totalShown = filteredRows.reduce((s, r) => s + (r.received_amount || 0), 0);
  const balanceShown = filteredRows.reduce((s, r) => s + Math.max(0, (r.amount || 0) - (r.received_amount || 0)), 0);

  const tabCounts = useMemo(() => ({
    all: rows.length,
    paid: rows.filter((r) => derivePaymentStatus(r) === 'paid').length,
    partial: rows.filter((r) => derivePaymentStatus(r) === 'partial').length,
    credit: rows.filter((r) => derivePaymentStatus(r) === 'credit').length,
  }), [rows]);

  return (
    <>
      <PageHeader
        title="Income"
        subtitle="Free-form receipts — money collected without a quotation or invoice. Only RECEIVED amount adds to Dashboard/P&L."
        right={
          <>
            <ExportButton
              filename={`Income ${filters.from || ''}${filters.to ? ' to ' + filters.to : ''}`.trim()}
              title="Income"
              subtitle={`${filteredRows.length} entries · Received ${inr(totalShown)}`}
              period={filters.from ? { from: filters.from, to: filters.to || today() } : undefined}
              tiles={[
                { label: 'Total invoiced', value: inr(stats.total || 0) },
                { label: 'Received', value: inr(stats.received || 0), tone: 'good' },
                { label: 'Outstanding', value: inr(stats.outstanding || 0), tone: stats.outstanding > 0 ? 'bad' : undefined },
              ]}
              columns={[
                { key: 'income_date', label: 'Date' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'mode', label: 'Mode' },
                { key: 'reference', label: 'Reference' },
                { key: 'amount', label: 'Total', align: 'right', format: (v) => inr(v) },
                { key: 'received_amount', label: 'Received', align: 'right', format: (v) => inr(v) },
                { key: 'balance', label: 'Balance', align: 'right', get: (r) => Math.max(0, (r.amount || 0) - (r.received_amount || 0)), format: (v) => v > 0 ? inr(v) : '—' },
                { key: 'payment_status', label: 'Status', get: (r) => derivePaymentStatus(r) },
              ]}
              rows={filteredRows}
              disabled={filteredRows.length === 0}
            />
            <button className="btn-primary" onClick={openNew}>+ Add income</button>
          </>
        }
      />

      {/* Stats tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Total (filtered)</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{inr(stats.total)}</div>
          <div className="text-xs text-slate-500 mt-1">{stats.count} entr{stats.count === 1 ? 'y' : 'ies'}</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Actually received</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{inr(stats.received)}</div>
          <div className="text-xs text-slate-500 mt-1">Counts in Dashboard / P&amp;L income</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Outstanding</div>
          <div className={'mt-1 text-xl font-bold ' + (stats.outstanding > 0 ? 'text-red-700' : 'text-slate-400')}>{inr(stats.outstanding)}</div>
          <div className="text-xs text-slate-500 mt-1">Owed to you by customers</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Shown after search</div>
          <div className="mt-1 text-xl font-bold text-slate-800">{inr(totalShown)}</div>
          <div className="text-xs text-slate-500 mt-1">{filteredRows.length} rows · Bal {inr(balanceShown)}</div>
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
            <label className="label">Customer</label>
            <select className="input" value={filters.customer_id}
              onChange={(e) => setFilters({ ...filters, customer_id: e.target.value })}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="label">Search</label>
            <div className="relative">
              <input type="text" className="input pr-8" placeholder="Customer, reference, notes…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">×</button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
            {[
              { key: 'all', label: 'All' },
              { key: 'paid', label: 'Paid' },
              { key: 'partial', label: 'Partial' },
              { key: 'credit', label: 'Credit / Pending' },
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
            Received: <span className="font-bold text-emerald-700">{inr(totalShown)}</span>
            {balanceShown > 0 && (
              <> · Balance: <span className="font-bold text-red-700">{inr(balanceShown)}</span></>
            )}
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Customer</th>
              <th className="th">Mode</th>
              <th className="th text-right">Total</th>
              <th className="th text-right">Received</th>
              <th className="th text-right">Balance</th>
              <th className="th">Status</th>
              <th className="th">Notes</th>
              <th className="th text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan={9} className="td text-center text-slate-500 py-10">No income entries in this view.</td></tr>
            )}
            {filteredRows.map((r) => {
              const amount = Number(r.amount) || 0;
              const received = Number(r.received_amount) || 0;
              const balance = Math.max(0, amount - received);
              const status = derivePaymentStatus(r);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td whitespace-nowrap">{r.income_date}</td>
                  <td className="td font-medium">{r.customer_name || r.customer_lookup_name || '—'}</td>
                  <td className="td text-xs">{r.mode || '—'}</td>
                  <td className="td text-right font-semibold whitespace-nowrap">{inr(amount)}</td>
                  <td className={'td text-right whitespace-nowrap ' + (status === 'paid' ? 'text-emerald-700 font-semibold' : 'text-slate-600')}>
                    {inr(received)}
                  </td>
                  <td className={'td text-right whitespace-nowrap ' + (balance > 0 ? 'font-semibold text-red-700' : 'text-slate-400')}>
                    {balance > 0 ? inr(balance) : '—'}
                  </td>
                  <td className="td whitespace-nowrap">
                    <span className={
                      'inline-block px-2 py-0.5 rounded text-xs font-semibold ' +
                      (status === 'paid' ? 'bg-emerald-100 text-emerald-700'
                        : status === 'partial' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700')
                    }>
                      {status === 'paid' ? '✓ Paid' : status === 'partial' ? 'Partial' : 'Pending'}
                    </span>
                  </td>
                  <td className="td text-xs text-slate-500 max-w-xs truncate" title={r.notes || ''}>{r.notes || '—'}</td>
                  <td className="td text-right whitespace-nowrap">
                    {balance > 0 && (
                      <button
                        className="btn-primary text-xs py-1 mr-1"
                        onClick={() => { setPayingId(r.id); setPayAmt(String(balance)); }}
                        title={`Record a receipt against ${inr(balance)} owed`}
                      >
                        + Receive
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

      {/* Add / edit income form */}
      <Modal open={showForm} title={editing ? 'Edit income' : 'Add income'} onClose={() => setShowForm(false)} size="lg">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label">Date *</label>
            <input type="date" className="input" value={form.income_date}
              onChange={(e) => setForm({ ...form, income_date: e.target.value })} />
          </div>
          <div>
            <label className="label">Total amount (₹) *</label>
            <input type="number" min="0" step="0.01" className="input" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <div className="text-[10px] text-slate-500 mt-1">The full amount the customer owes for this receipt.</div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Customer</label>
            <div className="flex gap-2">
              <select className="input flex-1"
                value={form.customer_id || ''}
                onChange={(e) => {
                  const cid = Number(e.target.value) || null;
                  const c = customers.find((x) => x.id === cid);
                  setForm({ ...form, customer_id: cid, customer_name: c ? c.name : form.customer_name });
                }}>
                <option value="">— Select or type a name below —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
              </select>
              <button type="button" className="btn-secondary text-xs whitespace-nowrap" onClick={() => setShowNewCustomer(true)}>
                + New customer
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="label">Customer name (or free-text if not in list)</label>
            <input className="input" value={form.customer_name || ''}
              placeholder="e.g. Walk-in customer, Ramesh, ABC Fabrications"
              onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </div>

          {/* Payment status radio — Fully received / Partial / Credit */}
          <div className="md:col-span-2">
            <label className="label">Payment status</label>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { key: 'paid', label: '✓ Fully received', hint: 'Customer paid the full amount now' },
                { key: 'partial', label: 'Partial', hint: 'Customer paid some — rest still owed' },
                { key: 'credit', label: 'Credit (nothing yet)', hint: 'Nothing collected yet — track as outstanding' },
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
                <label className="label">Received so far (₹)</label>
                <input type="number" min="0" step="0.01" className="input"
                  placeholder="e.g. 5000"
                  value={form.received_amount || ''}
                  onChange={(e) => setForm({ ...form, received_amount: e.target.value })} />
                <div className="text-xs text-slate-500 mt-1">
                  Remaining outstanding: <strong className="text-red-700">
                    {inr(Math.max(0, (Number(form.amount) || 0) - (Number(form.received_amount) || 0)))}
                  </strong>
                </div>
              </div>
            )}
            {form.payment_status === 'credit' && (
              <div className="text-xs text-slate-500 mt-2">
                Nothing counts as income yet. Full {inr(Number(form.amount) || 0)} shows in <strong>Outstanding</strong> column.
              </div>
            )}
          </div>

          <div>
            <label className="label">Payment mode</label>
            <select className="input" value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" value={form.reference || ''}
              placeholder="Cheque no., UPI ref, receipt #…"
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input min-h-[70px]" value={form.notes || ''}
              placeholder="What was this payment for? (e.g. Advance for MRL/Q/0012, Cash job — grill installation)"
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>{editing ? 'Save changes' : 'Add income'}</button>
        </div>
      </Modal>

      {/* Quick "Record receipt" for outstanding / partial rows */}
      <Modal open={!!payingId} title="Record receipt" onClose={() => { setPayingId(null); setPayAmt(''); }}>
        {payingId && (() => {
          const row = rows.find((r) => r.id === payingId);
          const amount = Number(row?.amount) || 0;
          const received = Number(row?.received_amount) || 0;
          const balance = Math.max(0, amount - received);
          return (
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700">
                <div><strong>{row?.customer_name || 'Customer'}</strong> — {row?.notes || row?.reference || ''}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Total: {inr(amount)} · Received: {inr(received)} · <span className="text-red-700 font-semibold">Balance: {inr(balance)}</span>
                </div>
              </div>
              <div>
                <label className="label">Received now (₹)</label>
                <input type="number" min="0.01" step="0.01" max={balance} className="input"
                  value={payAmt} onChange={(e) => setPayAmt(e.target.value)} autoFocus />
                <div className="text-xs text-slate-500 mt-1">Max {inr(balance)}. Adds to Dashboard / P&amp;L income.</div>
              </div>
              <div className="flex gap-2 text-xs">
                <button className="btn-secondary" onClick={() => setPayAmt(String(balance))}>Full balance ({inr(balance)})</button>
                <button className="btn-secondary" onClick={() => setPayAmt(String(+(balance / 2).toFixed(2)))}>Half ({inr(balance / 2)})</button>
              </div>
            </div>
          );
        })()}
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => { setPayingId(null); setPayAmt(''); }}>Cancel</button>
          <button className="btn-primary" onClick={recordPayment}>Record receipt</button>
        </div>
      </Modal>

      {/* Inline "add customer" modal */}
      <Modal open={showNewCustomer} title="Add customer" onClose={() => setShowNewCustomer(false)}>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="label">Name *</label>
            <input className="input" value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input className="input" value={newCustomer.gstin}
              onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value })} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={newCustomer.city}
              onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <textarea className="input min-h-[50px]" value={newCustomer.address}
              onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowNewCustomer(false)}>Cancel</button>
          <button className="btn-primary" onClick={saveNewCustomer}>Save customer</button>
        </div>
      </Modal>
    </>
  );
}
