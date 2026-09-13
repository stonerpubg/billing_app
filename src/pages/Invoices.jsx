import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import PdfPreviewModal from '../components/PdfPreviewModal.jsx';
import { inr } from '../utils/format.js';
import ExportButton from '../components/ExportButton.jsx';
import { useToast } from '../context/ToastContext.jsx';

const statusColor = (s) => {
  if (s === 'Paid') return 'bg-emerald-100 text-emerald-700';
  if (s === 'Partial') return 'bg-amber-100 text-amber-700';
  if (s === 'Overdue') return 'bg-red-100 text-red-700';
  if (s === 'Draft') return 'bg-slate-100 text-slate-600';
  return 'bg-brand-100 text-brand-700';
};

export default function Invoices() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewingId, setPreviewingId] = useState(null);

  const load = () => window.api.invoices.list().then(setRows);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.invoice_number.toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const remove = async (r) => {
    if (!confirm(`Delete invoice ${r.invoice_number}?`)) return;
    await window.api.invoices.remove(r.id);
    toast.success('Invoice deleted');
    load();
  };

  const preview = async (r) => {
    try {
      const res = await window.api.pdf.previewInvoice(r.id);
      setPreviewingId(r.id);
      setPreviewData(res);
    } catch (e) { toast.error(e.message); }
  };

  const exportFromPreview = async () => {
    if (!previewingId) return;
    try {
      const res = await window.api.pdf.exportInvoice(previewingId);
      if (!res.canceled) toast.success('PDF saved');
    } catch (e) { toast.error(e.message); }
  };

  const totalOutstanding = rows.reduce((s, r) => s + (r.balance || 0), 0);
  const totalBilled = rows.reduce((s, r) => s + (r.grand_total || 0), 0);
  const totalPaid = rows.reduce((s, r) => s + (r.paid_total || 0), 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Bills sent to customers, with payment tracking."
        right={
          <>
            <ExportButton
              filename="Invoices"
              title="Invoices"
              subtitle={`${filtered.length} invoice${filtered.length === 1 ? '' : 's'}`}
              columns={[
                { key: 'invoice_number', label: 'Number' },
                { key: 'invoice_date', label: 'Date' },
                { key: 'due_date', label: 'Due' },
                { key: 'customer_name', label: 'Customer' },
                { key: 'grand_total', label: 'Total', align: 'right', format: (v) => inr(v) },
                { key: 'paid_total', label: 'Paid', align: 'right', format: (v) => inr(v) },
                { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
                { key: 'status', label: 'Status' },
              ]}
              rows={filtered}
              disabled={filtered.length === 0}
            />
            <Link to="/invoices/new" className="btn-primary">+ New Invoice</Link>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Billed</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{inr(totalBilled)}</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Received</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{inr(totalPaid)}</div>
        </div>
        <div className="card card-body">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">Outstanding</div>
          <div className="mt-1 text-xl font-bold text-red-700">{inr(totalOutstanding)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header gap-4">
          <input
            className="input max-w-sm"
            placeholder="Search by number, customer, subject…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="text-sm text-slate-500">{filtered.length} of {rows.length}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Number</th>
                <th className="th">Date</th>
                <th className="th">Due</th>
                <th className="th">Customer</th>
                <th className="th text-right">Total</th>
                <th className="th text-right">Paid</th>
                <th className="th text-right">Balance</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="td text-center text-slate-500 py-10">
                    No invoices yet.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td font-semibold">
                    <Link to={`/invoices/${r.id}`} className="text-brand-700 hover:underline">
                      {r.invoice_number}
                    </Link>
                  </td>
                  <td className="td">{r.invoice_date}</td>
                  <td className="td">{r.due_date || '—'}</td>
                  <td className="td">{r.customer_name || '—'}</td>
                  <td className="td text-right font-semibold">{inr(r.grand_total)}</td>
                  <td className="td text-right text-emerald-700">{inr(r.paid_total)}</td>
                  <td className={'td text-right font-semibold ' + (r.balance > 0 ? 'text-red-700' : 'text-slate-500')}>
                    {inr(r.balance)}
                  </td>
                  <td className="td">
                    <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + statusColor(r.status)}>
                      {r.status}
                    </span>
                  </td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost text-xs" onClick={() => preview(r)}>Preview</button>
                      <Link to={`/invoices/${r.id}/edit`} className="btn-secondary text-xs">Edit</Link>
                      <button className="btn-ghost text-xs text-red-600" onClick={() => remove(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PdfPreviewModal
        data={previewData}
        onClose={() => { setPreviewData(null); setPreviewingId(null); }}
        onExport={exportFromPreview}
      />
    </>
  );
}
