import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import PdfPreviewModal from '../components/PdfPreviewModal.jsx';
import Modal from '../components/Modal.jsx';
import { inr, money, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { assetUrl } from '../utils/asset.js';

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

export default function QuotationView() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState(null);
  const [settings, setSettings] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payment, setPayment] = useState({ payment_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });

  const reload = async () => {
    const fresh = await window.api.quotations.get(Number(id));
    setQ(fresh);
  };

  useEffect(() => {
    (async () => {
      const [quotation, s] = await Promise.all([
        window.api.quotations.get(Number(id)),
        window.api.settings.get(),
      ]);
      setQ(quotation);
      setSettings(s);
    })();
  }, [id]);

  const addPayment = async () => {
    const amt = Number(payment.amount);
    if (!amt || amt <= 0) return toast.error('Amount must be > 0');
    const balance = q.balance != null ? q.balance : (q.grand_total - (q.paid_total || 0));
    if (amt > balance + 0.01) {
      if (!confirm(`Amount ${inr(amt)} is greater than the balance ${inr(balance)}. Continue?`)) return;
    }
    await window.api.quotePayments.add({ ...payment, quotation_id: q.id, amount: amt });
    toast.success('Payment recorded');
    setShowPayment(false);
    setPayment({ payment_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });
    reload();
  };

  const removePayment = async (pid) => {
    if (!confirm('Delete this payment?')) return;
    await window.api.quotePayments.remove(pid);
    toast.success('Payment removed');
    reload();
  };

  if (!q || !settings) return <div className="text-slate-500">Loading…</div>;

  const customer = q.customer || q.customer_snapshot || {};

  const remove = async () => {
    if (!confirm(`Delete quotation ${q.quote_number}?`)) return;
    await window.api.quotations.remove(q.id);
    toast.success('Deleted');
    nav('/quotations');
  };

  const exportPdf = async () => {
    try {
      const res = await window.api.pdf.export(q.id);
      if (!res.canceled) toast.success('PDF saved');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const preview = async () => {
    try {
      const res = await window.api.pdf.preview(q.id);
      setPreviewData(res);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span>Quotation {q.quote_number}</span>
            <span
              className={
                'inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ' +
                (q.status === 'Billed'
                  ? 'bg-emerald-100 text-emerald-700'
                  : q.status === 'Lost'
                  ? 'bg-red-100 text-red-700'
                  : q.status === 'Sent'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-amber-100 text-amber-700')
              }
            >
              {q.status === 'Lost' ? 'Not Billed' : (q.status || 'Draft')}
            </span>
          </span>
        }
        subtitle={q.subject || 'Quotation detail'}
        right={
          <>
            {q.status === 'Billed' && (q.balance || 0) > 0 && (
              <button
                className="btn-primary"
                onClick={() => {
                  setPayment((p) => ({ ...p, amount: q.balance }));
                  setShowPayment(true);
                }}
              >
                + Record Payment
              </button>
            )}
            <button className="btn-ghost" onClick={preview}>Preview PDF</button>
            <button className="btn-secondary" onClick={exportPdf}>Export PDF</button>
            {q.status !== 'Billed' && (
              <button
                className="btn-primary"
                onClick={async () => {
                  await window.api.quotations.markBilled(q.id);
                  toast.success('Marked as Billed — counted as sale');
                  const fresh = await window.api.quotations.get(q.id);
                  setQ(fresh);
                }}
              >
                Mark as Billed
              </button>
            )}
            {q.status !== 'Lost' && (
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (!confirm('Mark this quotation as Not Billed (customer didn\'t buy)?')) return;
                  await window.api.quotations.markLost(q.id);
                  toast.info('Marked as Not Billed');
                  const fresh = await window.api.quotations.get(q.id);
                  setQ(fresh);
                }}
              >
                Mark as Not Billed
              </button>
            )}
            {(q.status === 'Billed' || q.status === 'Lost') && (
              <button
                className="btn-ghost text-xs"
                onClick={async () => {
                  await window.api.quotations.markPending(q.id);
                  toast.info('Moved back to Pending');
                  const fresh = await window.api.quotations.get(q.id);
                  setQ(fresh);
                }}
              >
                Reset to Pending
              </button>
            )}
            <Link to={`/quotations/${q.id}/edit`} className="btn-secondary">Edit</Link>
            <button className="btn-ghost text-red-600" onClick={remove}>Delete</button>
          </>
        }
      />

      {/* Payment banner — highly visible when billed with balance pending */}
      {q.status === 'Billed' && (
        <div
          className={
            'rounded-md border p-4 mb-4 flex flex-wrap items-center gap-4 ' +
            ((q.balance || 0) > 0
              ? 'bg-amber-50 border-amber-300'
              : 'bg-emerald-50 border-emerald-300')
          }
        >
          <div className="flex-1 min-w-[240px]">
            <div className="text-xs uppercase font-semibold tracking-wide text-slate-500">
              Payment status
            </div>
            <div className="mt-1 flex items-center gap-4">
              <div>
                <div className="text-[10px] text-slate-500">Billed</div>
                <div className="font-bold text-slate-900">{inr(q.grand_total)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Received</div>
                <div className="font-bold text-emerald-700">{inr(q.paid_total || 0)}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">Pending</div>
                <div className={'font-bold ' + ((q.balance || 0) > 0 ? 'text-red-700' : 'text-slate-500')}>
                  {inr(q.balance || 0)}
                </div>
              </div>
            </div>
          </div>
          {(q.balance || 0) > 0 ? (
            <button
              className="btn-primary"
              onClick={() => {
                setPayment((p) => ({ ...p, amount: q.balance }));
                setShowPayment(true);
              }}
            >
              + Record payment
            </button>
          ) : (
            <div className="text-emerald-700 font-semibold text-sm">✓ Fully paid</div>
          )}
        </div>
      )}

      <div className="card mb-4">
        <div className="p-6 flex flex-col md:flex-row md:items-start md:justify-between gap-6 border-b border-slate-200">
          <div className="flex gap-4">
            {settings.logo_path && (
              <img
                src={assetUrl(settings.logo_path)}
                alt="Logo"
                className="w-16 h-16 object-contain rounded border border-slate-200 bg-white"
              />
            )}
            <div>
              <div className="text-xl font-bold text-brand-800">{settings.company_name}</div>
              <div className="text-xs text-slate-500">{settings.company_tagline}</div>
              <div className="text-xs text-slate-600 mt-1">
                {settings.company_address}
                {settings.company_city ? `, ${settings.company_city}` : ''}
                {settings.company_state ? `, ${settings.company_state}` : ''}
                {settings.company_pincode ? ` - ${settings.company_pincode}` : ''}
              </div>
              <div className="text-xs text-slate-600">
                {settings.company_phone} {settings.company_email && ` • ${settings.company_email}`}
              </div>
              {settings.company_gstin && (
                <div className="text-xs text-slate-600">GSTIN: {settings.company_gstin}</div>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-brand-700 tracking-tight">QUOTATION</div>
            <div className="mt-2 text-sm">
              <div>
                <span className="text-slate-500">Number: </span>
                <span className="font-semibold">{q.quote_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Date: </span>
                <span className="font-semibold">{q.quote_date}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-200">
          <div>
            <div className="text-xs uppercase font-semibold text-slate-500 mb-1">Quote To</div>
            <div className="font-semibold text-slate-900">{customer.name || '—'}</div>
            {customer.contact_person && (
              <div className="text-sm text-slate-700">Attn: {customer.contact_person}</div>
            )}
            {customer.address && <div className="text-sm text-slate-700">{customer.address}</div>}
            {(customer.city || customer.state || customer.pincode) && (
              <div className="text-sm text-slate-700">
                {[customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}
              </div>
            )}
            {customer.phone && <div className="text-sm text-slate-700">Phone: {customer.phone}</div>}
            {customer.email && <div className="text-sm text-slate-700">Email: {customer.email}</div>}
            {customer.gstin && <div className="text-sm text-slate-700">GSTIN: {customer.gstin}</div>}
          </div>
          {q.subject && (
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500 mb-1">Subject</div>
              <div className="text-sm text-slate-800">{q.subject}</div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {(() => {
            const anySize = q.items.some((it) => it.size && String(it.size).trim() !== '');
            const anyWeight = q.items.some((it) => it.weight && String(it.weight).trim() !== '');
            return (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-10 text-center">#</th>
                    <th className="th">Description</th>
                    {anySize && <th className="th text-center">Size</th>}
                    {anyWeight && <th className="th text-right">Weight</th>}
                    <th className="th text-right">Qty</th>
                    <th className="th">Unit</th>
                    <th className="th text-right">Rate</th>
                    <th className="th text-right">Amount</th>
                    <th className="th text-right">GST %</th>
                    <th className="th text-right">GST Amt</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((it, i) => (
                    <tr key={it.id}>
                      <td className="td text-center">{i + 1}</td>
                      <td className="td">
                        <div className="font-semibold">{it.name}</div>
                        {it.description && (
                          <div className="text-xs text-slate-500 whitespace-pre-line">{it.description}</div>
                        )}
                      </td>
                      {anySize && (
                        <td className="td text-center whitespace-nowrap">
                          {it.size
                            ? String(it.size).split('+').map((g, gi) => (
                                <div key={gi}>{gi > 0 ? '+ ' : ''}{g.trim()}</div>
                              ))
                            : '—'}
                        </td>
                      )}
                      {anyWeight && (
                        <td className={'td text-right whitespace-nowrap ' + (it.price_by === 'weight' ? 'font-semibold text-brand-700' : 'text-slate-500')}>
                          {it.weight || '—'}
                        </td>
                      )}
                      <td className="td text-right">{money(it.quantity)}</td>
                      <td className="td">{it.unit}</td>
                      <td className="td text-right">{money(it.rate)}</td>
                      <td className="td text-right">{money(it.amount)}</td>
                      <td className="td text-right">{money(it.gst_rate)}%</td>
                      <td className="td text-right">{money(it.gst_amount)}</td>
                      <td className="td text-right font-semibold">{money(it.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            {q.terms && (
              <div>
                <div className="text-xs uppercase font-semibold text-slate-500 mb-1">Terms</div>
                <div className="text-sm text-slate-700 whitespace-pre-line">{q.terms}</div>
              </div>
            )}
            {q.notes && (
              <div>
                <div className="text-xs uppercase font-semibold text-slate-500 mb-1">Notes</div>
                <div className="text-sm text-slate-700 whitespace-pre-line">{q.notes}</div>
              </div>
            )}
          </div>
          <div>
            <div className="bg-slate-50 rounded-md p-4 border border-slate-200 max-w-sm ml-auto">
              <div className="flex justify-between py-1 text-sm">
                <span>Subtotal</span>
                <span className="font-semibold">{inr(q.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span>Total GST</span>
                <span className="font-semibold">{inr(q.gst_total)}</span>
              </div>
              <div className="flex justify-between py-2 mt-2 border-t-2 border-slate-300">
                <span className="font-bold">Grand Total</span>
                <span className="font-bold text-brand-700 text-lg">{inr(q.grand_total)}</span>
              </div>
              {q.status === 'Billed' && (
                <>
                  <div className="flex justify-between py-1 text-sm mt-2 border-t border-slate-200 pt-2">
                    <span>Received</span>
                    <span className="font-semibold text-emerald-700">{inr(q.paid_total || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="font-semibold">Balance</span>
                    <span className={'font-bold ' + ((q.balance || 0) > 0 ? 'text-red-700' : 'text-slate-500')}>
                      {inr(q.balance || 0)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payments panel — visible when quotation is Billed */}
      {q.status === 'Billed' && (
        <div className="card mt-4">
          <div className="card-header">
            <div className="card-title">Payments received</div>
            {(q.balance || 0) > 0 && (
              <button
                className="btn-primary text-xs"
                onClick={() => {
                  setPayment((p) => ({ ...p, amount: q.balance }));
                  setShowPayment(true);
                }}
              >
                + Record payment
              </button>
            )}
          </div>
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
              {(!q.payments || q.payments.length === 0) && (
                <tr>
                  <td colSpan={6} className="td text-center text-slate-500 py-6">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
              {q.payments && q.payments.map((p) => (
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
      )}

      <Modal open={showPayment} title="Record payment" onClose={() => setShowPayment(false)}>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={payment.payment_date}
                onChange={(e) => setPayment({ ...payment, payment_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input type="number" min="0" step="0.01" className="input" value={payment.amount}
                onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Mode</label>
            <select className="input" value={payment.mode} onChange={(e) => setPayment({ ...payment, mode: e.target.value })}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
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
