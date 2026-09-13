import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import PdfPreviewModal from '../components/PdfPreviewModal.jsx';
import Modal from '../components/Modal.jsx';
import { inr, money, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const statusColor = (s) => {
  if (s === 'Paid') return 'bg-emerald-100 text-emerald-700';
  if (s === 'Partial') return 'bg-amber-100 text-amber-700';
  if (s === 'Overdue') return 'bg-red-100 text-red-700';
  if (s === 'Draft') return 'bg-slate-100 text-slate-600';
  return 'bg-brand-100 text-brand-700';
};

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export default function InvoiceView() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({
    payment_date: today(),
    amount: 0,
    mode: 'Cash',
    reference: '',
    notes: '',
  });

  const load = () => window.api.invoices.get(Number(id)).then(setInv);
  useEffect(() => { load(); }, [id]);

  if (!inv) return <div className="text-slate-500">Loading…</div>;

  const customer = inv.customer || inv.customer_snapshot || {};
  const balance = inv.balance;

  const preview = async () => {
    try {
      const res = await window.api.pdf.previewInvoice(inv.id);
      setPreviewData(res);
    } catch (e) { toast.error(e.message); }
  };

  const exportPdf = async () => {
    try {
      const res = await window.api.pdf.exportInvoice(inv.id);
      if (!res.canceled) toast.success('PDF saved');
    } catch (e) { toast.error(e.message); }
  };

  const remove = async () => {
    if (!confirm(`Delete invoice ${inv.invoice_number}?`)) return;
    await window.api.invoices.remove(inv.id);
    toast.success('Invoice deleted');
    nav('/invoices');
  };

  const addPayment = async () => {
    const amt = Number(payment.amount);
    if (!amt || amt <= 0) return toast.error('Enter a positive amount');
    if (amt > balance + 0.01) {
      if (!confirm(`Amount ${inr(amt)} is larger than balance ${inr(balance)}. Proceed?`)) return;
    }
    await window.api.payments.add({ ...payment, invoice_id: inv.id, amount: amt });
    toast.success('Payment recorded');
    setShowPayment(false);
    setPayment({ payment_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
    load();
  };

  const removePayment = async (pid) => {
    if (!confirm('Delete this payment?')) return;
    await window.api.payments.remove(pid);
    toast.success('Payment removed');
    load();
  };

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.invoice_number}`}
        subtitle={`Issued ${inv.invoice_date}${inv.due_date ? ` • Due ${inv.due_date}` : ''}`}
        right={
          <>
            <button className="btn-secondary" onClick={preview}>Preview</button>
            <button className="btn-secondary" onClick={exportPdf}>Export PDF</button>
            <Link to={`/invoices/${inv.id}/edit`} className="btn-secondary">Edit</Link>
            <button className="btn-ghost text-red-600" onClick={remove}>Delete</button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="card-title">Bill To</div>
            <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + statusColor(inv.status)}>
              {inv.status}
            </span>
          </div>
          <div className="card-body">
            <div className="text-lg font-semibold">{customer.name || '—'}</div>
            <div className="text-sm text-slate-600 whitespace-pre-line">
              {[customer.contact_person && 'Attn: ' + customer.contact_person,
                customer.address,
                [customer.city, customer.state, customer.pincode].filter(Boolean).join(', '),
                customer.phone && 'Phone: ' + customer.phone,
                customer.email && 'Email: ' + customer.email,
                customer.gstin && 'GSTIN: ' + customer.gstin,
              ].filter(Boolean).join('\n')}
            </div>
            {inv.subject && (
              <div className="text-sm italic text-brand-700 mt-2">Subject: {inv.subject}</div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Amounts</div></div>
          <div className="card-body space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{inr(inv.subtotal)}</span></div>
            <div className="flex justify-between"><span>GST</span><span>{inr(inv.gst_total)}</span></div>
            <div className="flex justify-between py-1 border-t border-slate-200 font-semibold text-base">
              <span>Grand Total</span><span>{inr(inv.grand_total)}</span>
            </div>
            <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{inr(inv.paid_total)}</span></div>
            <div className={'flex justify-between font-bold pt-1 border-t border-slate-200 ' + (balance > 0 ? 'text-red-700' : 'text-slate-500')}>
              <span>Balance Due</span><span>{inr(balance)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><div className="card-title">Line items</div></div>
        <div className="overflow-x-auto">
          {(() => {
            const anyWeight = inv.items.some((it) => it.weight && String(it.weight).trim() !== '');
            return (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">#</th>
                    <th className="th">Description</th>
                    <th className="th">HSN / SAC</th>
                    <th className="th text-center">Size</th>
                    {anyWeight && <th className="th text-right">Weight</th>}
                    <th className="th text-right">Qty</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-right">GST</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it, i) => (
                    <tr key={it.id}>
                      <td className="td">{i + 1}</td>
                      <td className="td">
                        <div className="font-semibold">{it.name}</div>
                        {it.description && <div className="text-xs text-slate-500 italic">{it.description}</div>}
                      </td>
                      <td className="td text-xs">{it.hsn_code || '—'}</td>
                      <td className="td text-center whitespace-nowrap">
                        {it.size
                          ? String(it.size).split('+').map((g, gi) => (
                              <div key={gi}>{gi > 0 ? '+ ' : ''}{g.trim()}</div>
                            ))
                          : '—'}
                      </td>
                      {anyWeight && (
                        <td className={'td text-right whitespace-nowrap ' + (it.price_by === 'weight' ? 'font-semibold text-brand-700' : 'text-slate-500')}>
                          {it.weight || '—'}
                        </td>
                      )}
                      <td className="td text-right">{money(it.quantity)}</td>
                      <td className="td text-right">{money(it.rate)}</td>
                      <td className="td text-right">{money(it.amount)}</td>
                      <td className="td text-right">{money(it.gst_amount)}</td>
                      <td className="td text-right font-semibold">{money(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Payments</div>
          {balance > 0 && (
            <button className="btn-primary text-xs" onClick={() => {
              setPayment((p) => ({ ...p, amount: balance }));
              setShowPayment(true);
            }}>+ Record payment</button>
          )}
        </div>
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Mode</th>
                <th className="th">Reference</th>
                <th className="th">Notes</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right"></th>
              </tr>
            </thead>
            <tbody>
              {inv.payments.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-slate-500 py-6">No payments recorded yet.</td></tr>
              )}
              {inv.payments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="td">{p.payment_date}</td>
                  <td className="td">{p.mode || 'Cash'}</td>
                  <td className="td">{p.reference || '—'}</td>
                  <td className="td text-slate-600">{p.notes || '—'}</td>
                  <td className="td text-right font-semibold text-emerald-700">{inr(p.amount)}</td>
                  <td className="td text-right">
                    <button className="text-xs text-red-600 hover:underline" onClick={() => removePayment(p.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showPayment} title="Record payment" onClose={() => setShowPayment(false)}>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input"
                value={payment.payment_date}
                onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input type="number" min="0" step="0.01" className="input"
                value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Payment mode</label>
            <select className="input" value={payment.mode}
              onChange={(e) => setPayment({ ...payment, mode: e.target.value })}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference (cheque no., txn id, etc.)</label>
            <input className="input" value={payment.reference}
              onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px]" value={payment.notes}
              onChange={(e) => setPayment({ ...payment, notes: e.target.value })} />
          </div>
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setShowPayment(false)}>Cancel</button>
          <button className="btn-primary" onClick={addPayment}>Save payment</button>
        </div>
      </Modal>

      <PdfPreviewModal
        data={previewData}
        onClose={() => setPreviewData(null)}
        onExport={exportPdf}
      />
    </>
  );
}
