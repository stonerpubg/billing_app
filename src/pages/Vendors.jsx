import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { inr } from '../utils/format.js';

const empty = { name: '', phone: '', email: '', gstin: '', notes: '' };
const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyPayment = () => ({ payment_date: todayISO(), amount: '', mode: 'Cash', reference: '', notes: '' });

export default function Vendors() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [sortBy, setSortBy] = useState('name');

  const [payTarget, setPayTarget] = useState(null); // vendor row
  const [payForm, setPayForm] = useState(emptyPayment());

  const [detailVendor, setDetailVendor] = useState(null);
  const [detail, setDetail] = useState(null); // { total_billed, total_paid, outstanding, expenses, payments }

  const load = () => window.api.vendors.list().then(setRows);
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setShowForm(true); };
  const openEdit = (v) => { setEditing(v); setForm(v); setShowForm(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Vendor name is required');
    try {
      if (editing) await window.api.vendors.update({ ...form, id: editing.id });
      else await window.api.vendors.create(form);
      toast.success(editing ? 'Vendor updated' : 'Vendor added');
      setShowForm(false);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (v) => {
    if (!confirm(`Delete vendor "${v.name}"? This also removes their payment history.`)) return;
    try {
      await window.api.vendors.remove(v.id);
      toast.success('Vendor deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openPay = (v) => { setPayTarget(v); setPayForm(emptyPayment()); };
  const savePay = async () => {
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Enter a payment amount');
    if (!payForm.payment_date) return toast.error('Pick a payment date');
    try {
      const r = await window.api.vendors.pay(payTarget.id, {
        payment_date: payForm.payment_date,
        amount: amt,
        mode: payForm.mode,
        reference: payForm.reference,
        notes: payForm.notes,
      });
      toast.success(
        r.unapplied > 0
          ? `Recorded ₹${amt.toLocaleString('en-IN')} — ₹${r.unapplied.toLocaleString('en-IN')} kept as advance`
          : `Recorded ₹${amt.toLocaleString('en-IN')} against outstanding`
      );
      setPayTarget(null);
      load();
      if (detailVendor?.id === payTarget.id) openHistory(payTarget); // refresh open history
    } catch (e) { toast.error(e.message); }
  };

  const openHistory = async (v) => {
    setDetailVendor(v);
    setDetail(null);
    try {
      const s = await window.api.vendors.summary(v.id);
      setDetail(s);
    } catch (e) { toast.error(e.message); }
  };

  const deletePayment = async (paymentId) => {
    if (!confirm('Delete this payment? The vendor’s outstanding will restore to the amount before this payment.')) return;
    try {
      await window.api.vendors.removePayment(paymentId);
      toast.success('Payment deleted');
      load();
      openHistory(detailVendor);
    } catch (e) { toast.error(e.message); }
  };

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
  const totalOutstanding = rows.reduce((s, r) => s + (r.outstanding || 0), 0);

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you buy from. Record payments here — each settlement is dated separately."
        right={<button className="btn-primary" onClick={openNew}>+ Add vendor</button>}
      />

      {totalOutstanding > 0 && (
        <div className="card card-body mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">Total outstanding</div>
            <div className="text-2xl font-bold text-amber-700 tabular-nums">{inr(totalOutstanding)}</div>
          </div>
          <div className="text-xs text-slate-500">across {rows.filter(r => r.outstanding > 0).length} vendor(s)</div>
        </div>
      )}

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
            <option value="total_billed">Sort: Highest spend</option>
            <option value="total_paid">Sort: Highest settled</option>
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
                <th className="th text-right">Expenses</th>
                <th className="th text-right">Billed</th>
                <th className="th text-right">Settled</th>
                <th className="th text-right">Outstanding</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="td text-center text-slate-500 py-10">No vendors yet.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-semibold">
                    <button className="text-brand-700 hover:underline text-left" onClick={() => openHistory(r)}>{r.name}</button>
                    {r.gstin && <div className="text-[10px] text-slate-400">GSTIN {r.gstin}</div>}
                  </td>
                  <td className="td">{r.phone || '—'}</td>
                  <td className="td text-right">
                    {r.expense_count > 0
                      ? <Link to={`/expenses?vendor=${encodeURIComponent(r.name)}`} className="text-brand-600 hover:underline">{r.expense_count}</Link>
                      : <span className="text-slate-400">0</span>}
                  </td>
                  <td className="td text-right tabular-nums">{r.total_billed > 0 ? inr(r.total_billed) : '—'}</td>
                  <td className="td text-right tabular-nums text-emerald-700">{r.total_paid > 0 ? inr(r.total_paid) : '—'}</td>
                  <td className={'td text-right tabular-nums ' + (r.outstanding > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                    {r.outstanding > 0 ? inr(r.outstanding) : '—'}
                  </td>
                  <td className="td text-right whitespace-nowrap">
                    <button
                      className={'text-xs mr-1 ' + (r.outstanding > 0 ? 'btn-primary' : 'btn-secondary')}
                      onClick={() => openPay(r)}
                      title={r.outstanding > 0 ? 'Record payment against outstanding' : 'Record advance / payment'}
                    >
                      + Pay
                    </button>
                    <button className="btn-ghost text-xs" onClick={() => openHistory(r)}>History</button>
                    <button className="btn-ghost text-xs" onClick={() => openEdit(r)}>Edit</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / edit vendor */}
      <Modal open={showForm} title={editing ? 'Edit vendor' : 'Add vendor'} onClose={() => setShowForm(false)} size="lg">
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

      {/* Record payment */}
      <Modal open={!!payTarget} title={payTarget ? `Record payment — ${payTarget.name}` : ''} onClose={() => setPayTarget(null)} size="lg">
        {payTarget && (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="card card-body">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Outstanding</div>
                <div className="text-lg font-bold text-amber-700 tabular-nums">{inr(payTarget.outstanding || 0)}</div>
              </div>
              <div className="card card-body">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Already settled</div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">{inr(payTarget.total_paid || 0)}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">Payment date *</label>
                <input type="date" className="input" value={payForm.payment_date}
                  onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Amount *</label>
                <input type="number" step="0.01" min="0" className="input" value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                  placeholder="0.00" autoFocus />
              </div>
              <div>
                <label className="label">Mode</label>
                <select className="input" value={payForm.mode}
                  onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
                  {['Cash', 'UPI', 'Bank', 'Cheque', 'Card', 'Other'].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reference</label>
                <input className="input" value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  placeholder="UTR / cheque no." />
              </div>
              <div className="md:col-span-2">
                <label className="label">Notes</label>
                <input className="input" value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Payment applies FIFO to the vendor's oldest unpaid expenses. Any surplus above outstanding is stored as an advance credit.
            </p>
          </div>
        )}
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setPayTarget(null)}>Cancel</button>
          <button className="btn-primary" onClick={savePay}>Record payment</button>
        </div>
      </Modal>

      {/* History */}
      <Modal open={!!detailVendor} title={detailVendor ? `${detailVendor.name} — History` : ''} onClose={() => { setDetailVendor(null); setDetail(null); }} size="lg">
        {!detail ? (
          <div className="p-5 text-slate-500 text-sm">Loading…</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="card card-body">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Total billed</div>
                <div className="text-lg font-bold tabular-nums">{inr(detail.total_billed)}</div>
              </div>
              <div className="card card-body">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Total settled</div>
                <div className="text-lg font-bold text-emerald-700 tabular-nums">{inr(detail.total_paid)}</div>
              </div>
              <div className="card card-body">
                <div className="text-[10px] uppercase font-semibold text-slate-500">Outstanding</div>
                <div className={'text-lg font-bold tabular-nums ' + (detail.outstanding > 0 ? 'text-amber-700' : 'text-slate-400')}>{inr(detail.outstanding)}</div>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 mb-2">Payments ({detail.payments.length})</div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th text-right">Amount</th>
                      <th className="th">Mode</th>
                      <th className="th">Reference</th>
                      <th className="th">Notes</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.length === 0 && (
                      <tr><td colSpan={6} className="td text-center text-slate-400 py-6 text-xs">No payments recorded yet.</td></tr>
                    )}
                    {detail.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="td whitespace-nowrap">{p.payment_date}</td>
                        <td className="td text-right tabular-nums text-emerald-700 font-semibold">{inr(p.amount)}</td>
                        <td className="td">{p.mode || '—'}</td>
                        <td className="td text-xs">{p.reference || '—'}</td>
                        <td className="td text-xs">{p.notes || '—'}</td>
                        <td className="td text-right">
                          <button className="btn-ghost text-xs text-red-600" onClick={() => deletePayment(p.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 mb-2">Expenses ({detail.expenses.length})</div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Date</th>
                      <th className="th">Category</th>
                      <th className="th">Description</th>
                      <th className="th text-right">Billed</th>
                      <th className="th text-right">Paid</th>
                      <th className="th text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.expenses.length === 0 && (
                      <tr><td colSpan={6} className="td text-center text-slate-400 py-6 text-xs">No expenses yet.</td></tr>
                    )}
                    {detail.expenses.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="td whitespace-nowrap">{e.expense_date}</td>
                        <td className="td">{e.category}</td>
                        <td className="td text-xs">{e.description || '—'}</td>
                        <td className="td text-right tabular-nums">{inr(e.amount)}</td>
                        <td className="td text-right tabular-nums text-emerald-700">{inr(e.paid_amount)}</td>
                        <td className={'td text-right tabular-nums ' + (e.balance > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400')}>
                          {e.balance > 0 ? inr(e.balance) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          {detailVendor && (
            <button
              className="btn-primary"
              onClick={() => { const v = detailVendor; setDetailVendor(null); setDetail(null); openPay(v); }}
            >
              + Record payment
            </button>
          )}
          <button className="btn-secondary" onClick={() => { setDetailVendor(null); setDetail(null); }}>Close</button>
        </div>
      </Modal>
    </>
  );
}
