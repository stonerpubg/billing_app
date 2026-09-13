import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import PdfPreviewModal from '../components/PdfPreviewModal.jsx';
import Modal from '../components/Modal.jsx';
import { inr, today } from '../utils/format.js';
import ExportButton from '../components/ExportButton.jsx';
import { useToast } from '../context/ToastContext.jsx';

const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'];

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending / Follow-up', match: (s) => !s || s === 'Draft' || s === 'Sent' || s === 'Pending' },
  { key: 'Billed', label: 'Billed' },
  { key: 'Lost', label: 'Not Billed' },
];

const statusColor = (s) => {
  if (s === 'Billed') return 'bg-emerald-100 text-emerald-700';
  if (s === 'Lost') return 'bg-red-100 text-red-700';
  if (s === 'Sent') return 'bg-brand-100 text-brand-700';
  return 'bg-amber-100 text-amber-700';
};

// User-facing label for the "Lost" status
const statusLabel = (s) => (s === 'Lost' ? 'Not Billed' : (s || 'Draft'));

export default function Quotations() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [previewData, setPreviewData] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);

  const load = () => window.api.quotations.list().then(setRows);
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let base = rows;
    // Tab filter
    const activeTab = STATUS_TABS.find((t) => t.key === tab);
    if (activeTab && activeTab.match) {
      base = base.filter((r) => activeTab.match(r.status));
    } else if (activeTab && activeTab.key !== 'all') {
      base = base.filter((r) => r.status === activeTab.key);
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (r) =>
        r.quote_number.toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q)
    );
  }, [rows, query, tab]);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, Billed: 0, Lost: 0 };
    for (const r of rows) {
      if (r.status === 'Billed') c.Billed++;
      else if (r.status === 'Lost') c.Lost++;
      else c.pending++;
    }
    return c;
  }, [rows]);

  const [payQuote, setPayQuote] = useState(null); // quotation object for payment modal
  const [payForm, setPayForm] = useState({ payment_date: today(), amount: 0, mode: 'Cash', reference: '', notes: '' });

  const openPayment = async (r) => {
    // Fetch fresh quote for accurate balance
    const q = await window.api.quotations.get(r.id);
    setPayQuote(q);
    const balance = q.balance != null ? q.balance : (q.grand_total - (q.paid_total || 0));
    setPayForm({ payment_date: today(), amount: balance, mode: 'Cash', reference: '', notes: '' });
  };

  const savePayment = async () => {
    if (!payQuote) return;
    const amt = Number(payForm.amount);
    if (!amt || amt <= 0) return toast.error('Amount must be > 0');
    await window.api.quotePayments.add({ ...payForm, quotation_id: payQuote.id, amount: amt });
    toast.success('Payment recorded');
    setPayQuote(null);
    load();
  };

  const markBilled = async (r) => {
    await window.api.quotations.markBilled(r.id);
    toast.success(`${r.quote_number} marked as Billed`);
    load();
  };
  const markLost = async (r) => {
    if (!confirm(`Mark ${r.quote_number} as Not Billed?`)) return;
    await window.api.quotations.markLost(r.id);
    toast.info(`${r.quote_number} marked as Not Billed`);
    load();
  };
  const markPending = async (r) => {
    await window.api.quotations.markPending(r.id);
    toast.info(`${r.quote_number} back to Pending`);
    load();
  };

  const remove = async (r) => {
    if (!confirm(`Delete quotation ${r.quote_number}?`)) return;
    await window.api.quotations.remove(r.id);
    toast.success('Quotation deleted');
    load();
  };

  const exportPdf = async (r) => {
    try {
      const res = await window.api.pdf.export(r.id);
      if (!res.canceled) toast.success('PDF saved');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const preview = async (r) => {
    try {
      const res = await window.api.pdf.preview(r.id);
      setPreviewingId(r.id);
      setPreviewData(res);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportFromPreview = async () => {
    if (!previewingId) return;
    try {
      const res = await window.api.pdf.export(previewingId);
      if (!res.canceled) toast.success('PDF saved');
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="All quotations, searchable."
        right={
          <>
            <ExportButton
              filename="Quotations"
              title="Quotations"
              subtitle={`${filtered.length} quotation${filtered.length === 1 ? '' : 's'}`}
              columns={[
                { key: 'quote_number', label: 'Number' },
                { key: 'quote_date', label: 'Date' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'subject', label: 'Subject' },
                { key: 'subtotal', label: 'Subtotal', align: 'right', format: (v) => inr(v) },
                { key: 'gst_total', label: 'GST', align: 'right', format: (v) => inr(v) },
                { key: 'grand_total', label: 'Grand Total', align: 'right', format: (v) => inr(v) },
                { key: 'status', label: 'Status' },
              ]}
              rows={filtered}
              disabled={filtered.length === 0}
            />
            <Link to="/quotations/new" className="btn-primary">+ New Quotation</Link>
          </>
        }
      />

      <div className="card">
        <div className="card-header gap-4 flex-wrap">
          {/* Status tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  'px-3 py-1.5 rounded text-xs font-medium transition ' +
                  (tab === t.key
                    ? 'bg-white shadow text-brand-700'
                    : 'text-slate-500 hover:text-slate-800')
                }
              >
                {t.label}
                <span className="ml-1 text-[10px] opacity-70">({counts[t.key] || 0})</span>
              </button>
            ))}
          </div>
          <input
            className="input max-w-sm"
            placeholder="Search by number, customer, subject…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="text-sm text-slate-500 ml-auto">
            {filtered.length} of {rows.length}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Number</th>
                <th className="th">Date</th>
                <th className="th">Customer</th>
                <th className="th">Subject</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Received</th>
                <th className="th text-right">Balance</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="td text-center text-slate-500 py-10">
                    No quotations in this view.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const balance = (Number(r.grand_total) || 0) - (Number(r.paid_total) || 0);
                return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-semibold">
                    <Link to={`/quotations/${r.id}`} className="text-brand-700 hover:underline">
                      {r.quote_number}
                    </Link>
                  </td>
                  <td className="td">{r.quote_date}</td>
                  <td className="td">{r.customer_name || '—'}</td>
                  <td className="td max-w-xs truncate">{r.subject || '—'}</td>
                  <td className="td text-right font-semibold whitespace-nowrap">{inr(r.grand_total)}</td>
                  <td className={'td text-right whitespace-nowrap ' + (r.status === 'Billed' ? 'text-emerald-700 font-medium' : 'text-slate-400')}>
                    {r.status === 'Billed' ? inr(r.paid_total || 0) : '—'}
                  </td>
                  <td className={'td text-right font-medium whitespace-nowrap ' + (r.status === 'Billed' && balance > 0 ? 'text-red-700' : 'text-slate-400')}>
                    {r.status === 'Billed' ? inr(balance) : '—'}
                  </td>
                  <td className="td">
                    <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + statusColor(r.status)}>
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {r.status === 'Billed' && balance > 0 && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700"
                          onClick={() => openPayment(r)}
                          title="Record a payment received against this quotation"
                        >
                          ₹ Record payment
                        </button>
                      )}
                      {r.status !== 'Billed' && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          onClick={() => markBilled(r)}
                          title="Mark as Billed — counts as income"
                        >
                          ✓ Billed
                        </button>
                      )}
                      {r.status !== 'Lost' && r.status !== 'Billed' && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                          onClick={() => markLost(r)}
                          title="Mark as Not Billed — customer didn't buy"
                        >
                          ✗ Not Billed
                        </button>
                      )}
                      {(r.status === 'Billed' || r.status === 'Lost') && (
                        <button
                          className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                          onClick={() => markPending(r)}
                          title="Move back to pending"
                        >
                          ↺ Reset
                        </button>
                      )}
                      <button className="btn-ghost text-xs" onClick={() => preview(r)}>Preview</button>
                      <Link to={`/quotations/${r.id}/edit`} className="btn-secondary text-xs">Edit</Link>
                      <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <PdfPreviewModal
        data={previewData}
        onClose={() => {
          setPreviewData(null);
          setPreviewingId(null);
        }}
        onExport={exportFromPreview}
      />

      <Modal
        open={!!payQuote}
        title={payQuote ? `Record payment — ${payQuote.quote_number}` : ''}
        onClose={() => setPayQuote(null)}
      >
        {payQuote && (
          <>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Billed</div>
                  <div className="font-bold">{inr(payQuote.grand_total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Received</div>
                  <div className="font-bold text-emerald-700">{inr(payQuote.paid_total || 0)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Balance</div>
                  <div className="font-bold text-red-700">{inr(payQuote.balance || 0)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={payForm.payment_date}
                    onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Amount (₹)</label>
                  <input type="number" min="0" step="0.01" className="input" value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Mode</label>
                <select className="input" value={payForm.mode}
                  onChange={(e) => setPayForm({ ...payForm, mode: e.target.value })}>
                  {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Reference (cheque no., txn id)</label>
                <input className="input" value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[60px]" value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setPayQuote(null)}>Cancel</button>
              <button className="btn-primary" onClick={savePayment}>Save payment</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
