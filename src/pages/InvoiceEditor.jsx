import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader.jsx';
import { inr, money, today } from '../utils/format.js';
import { useToast } from '../context/ToastContext.jsx';

const emptyItem = () => ({
  product_id: null,
  name: '',
  description: '',
  hsn_code: '',
  unit: 'Nos',
  size: '',
  weight: '',
  price_by: 'size',
  quantity: 1,
  rate: 0,
  gst_rate: 18,
});

// Parse size: "4x4" → 16, "4x4x4" → 64, "17.25x4.5+12.5x4.55" → 134.5, "16" → 16, blank → 1
function parseSize(size) {
  if (size == null || size === '') return 1;
  const s = String(size).trim().toLowerCase();
  const groups = s.split('+').map((g) => g.trim()).filter(Boolean);
  let sum = 0;
  let anyGroupParsed = false;
  for (const g of groups) {
    const parts = g.split(/\s*[x*×]\s*/).filter(Boolean);
    if (parts.length >= 1 && parts.every((p) => /^\d+(?:\.\d+)?$/.test(p))) {
      sum += parts.reduce((prod, p) => prod * Number(p), 1);
      anyGroupParsed = true;
    }
  }
  if (anyGroupParsed) return sum;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Weight cell → numeric value (accepts "317.6" or "317.6 kg"). Zero if blank.
function parseWeight(weight) {
  if (weight == null || weight === '') return 0;
  const m = String(weight).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// Amount honoring price_by:
//   'weight' → weight × qty × rate  (per-unit weight × pieces × ₹/kg rate)
//   'size'   → size × qty × rate    (default)
function computeLineAmount(it) {
  const rate = Number(it.rate) || 0;
  const qty = Number(it.quantity) || 0;
  if (it.price_by === 'weight') {
    const w = parseWeight(it.weight);
    if (w > 0) return w * qty * rate;
  }
  return parseSize(it.size) * qty * rate;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function InvoiceEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuotation = searchParams.get('fromQuotation');
  const nav = useNavigate();
  const toast = useToast();
  const isEditing = Boolean(id);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [previewNumber, setPreviewNumber] = useState('');
  const initialDate = today();

  const [form, setForm] = useState({
    invoice_number: '',
    customer_id: null,
    invoice_date: initialDate,
    due_date: addDays(initialDate, 15),
    subject: '',
    notes: '',
    terms: '',
    gst_mode: 'per_line',
    flat_gst_rate: 18,
    items: [emptyItem()],
  });

  useEffect(() => {
    (async () => {
      const [ps, cs, settings] = await Promise.all([
        window.api.products.list(),
        window.api.customers.list(),
        window.api.settings.get(),
      ]);
      setProducts(ps);
      setCustomers(cs);
      setForm((f) => ({ ...f, terms: settings.default_terms || '' }));

      if (isEditing) {
        const inv = await window.api.invoices.get(Number(id));
        if (inv) {
          setForm({
            invoice_number: inv.invoice_number,
            customer_id: inv.customer_id,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date || '',
            subject: inv.subject || '',
            notes: inv.notes || '',
            terms: inv.terms || '',
            gst_mode: inv.gst_mode || 'per_line',
            flat_gst_rate: inv.flat_gst_rate != null ? inv.flat_gst_rate : 18,
            items: inv.items.map((it) => ({
              product_id: it.product_id,
              name: it.name,
              description: it.description || '',
              hsn_code: it.hsn_code || '',
              unit: it.unit || 'Nos',
              size: it.size || '',
              weight: it.weight || '',
              price_by: it.price_by === 'weight' ? 'weight' : 'size',
              quantity: it.quantity,
              rate: it.rate,
              gst_rate: it.gst_rate,
            })),
          });
        }
      } else if (fromQuotation) {
        // Prefill from quotation
        const q = await window.api.quotations.get(Number(fromQuotation));
        if (q) {
          setForm((f) => ({
            ...f,
            customer_id: q.customer_id,
            subject: q.subject || '',
            notes: q.notes || '',
            terms: q.terms || '',
            gst_mode: q.gst_mode || 'per_line',
            flat_gst_rate: q.flat_gst_rate || 18,
            items: q.items.map((it) => ({
              product_id: it.product_id,
              name: it.name,
              description: it.description || '',
              hsn_code: it.hsn_code || '',
              unit: it.unit || 'Nos',
              size: it.size || '',
              weight: it.weight || '',
              price_by: it.price_by === 'weight' ? 'weight' : 'size',
              quantity: it.quantity,
              rate: it.rate,
              gst_rate: it.gst_rate,
            })),
          }));
        }
        const next = await window.api.invoices.nextNumber();
        setPreviewNumber(next.number);
      } else {
        const next = await window.api.invoices.nextNumber();
        setPreviewNumber(next.number);
      }
    })();
  }, [id, isEditing, fromQuotation]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    const breakdown = {};
    for (const it of form.items) {
      const amount = computeLineAmount(it);
      subtotal += amount;
      if (form.gst_mode === 'per_line') {
        const rate = Number(it.gst_rate) || 0;
        const gAmt = (amount * rate) / 100;
        gst += gAmt;
        if (!breakdown[rate]) breakdown[rate] = { taxable: 0, tax: 0 };
        breakdown[rate].taxable += amount;
        breakdown[rate].tax += gAmt;
      }
    }
    if (form.gst_mode === 'flat_on_total') {
      const rate = Number(form.flat_gst_rate) || 0;
      gst = (subtotal * rate) / 100;
      breakdown[rate] = { taxable: subtotal, tax: gst };
    }
    return {
      subtotal: +subtotal.toFixed(2),
      gst: +gst.toFixed(2),
      grand: +(subtotal + gst).toFixed(2),
      breakdown,
    };
  }, [form.items, form.gst_mode, form.flat_gst_rate]);

  const updateItem = (idx, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));

  const pickProduct = (idx, productId) => {
    if (!productId) return updateItem(idx, { product_id: null });
    const p = products.find((x) => x.id === Number(productId));
    if (!p) return;
    updateItem(idx, {
      product_id: p.id,
      name: p.name,
      description: p.description || '',
      hsn_code: p.hsn_code || '',
      unit: p.unit || 'Nos',
      rate: p.rate,
      gst_rate: p.gst_rate,
    });
  };

  const addRow = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeRow = (idx) =>
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));

  const validate = () => {
    if (!form.customer_id) return 'Select a customer.';
    if (!form.invoice_date) return 'Invoice date is required.';
    if (form.items.length === 0) return 'Add at least one item.';
    for (const [i, it] of form.items.entries()) {
      if (!it.name.trim()) return `Row ${i + 1}: item name is required.`;
      if ((Number(it.quantity) || 0) <= 0) return `Row ${i + 1}: quantity must be > 0.`;
    }
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) return toast.error(err);
    const payload = { ...form };
    if (isEditing) {
      await window.api.invoices.update({ ...payload, id: Number(id) });
      toast.success('Invoice updated');
      nav(`/invoices/${id}`);
    } else {
      if (fromQuotation) payload.quotation_id = Number(fromQuotation);
      const created = await window.api.invoices.create(payload);
      toast.success(`Invoice ${created.invoice_number} created`);
      nav(`/invoices/${created.id}`);
    }
  };

  return (
    <>
      <PageHeader
        title={isEditing ? 'Edit Invoice' : 'New Invoice'}
        subtitle={
          isEditing
            ? `Invoice ${form.invoice_number}`
            : `Next number will be: ${previewNumber || '…'}${fromQuotation ? ' (from quotation)' : ''}`
        }
        right={
          <>
            <button className="btn-secondary" onClick={() => nav(-1)}>Cancel</button>
            <button className="btn-primary" onClick={save}>{isEditing ? 'Save changes' : 'Create invoice'}</button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="card lg:col-span-2">
          <div className="card-header"><div className="card-title">Bill To</div></div>
          <div className="card-body space-y-3">
            <div>
              <label className="label">Customer</label>
              <select
                className="input"
                value={form.customer_id || ''}
                onChange={(e) => setForm({ ...form, customer_id: Number(e.target.value) || null })}
              >
                <option value="">Select customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.city ? ` — ${c.city}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <input
                className="input"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Invoice details</div></div>
          <div className="card-body space-y-3">
            <div>
              <label className="label">Invoice date</label>
              <input type="date" className="input" value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input" value={form.due_date || ''}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Line items</div>
          <button className="btn-secondary text-xs" onClick={addRow}>+ Add row</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1620px] table-fixed">
            <thead>
              <tr>
                <th className="th w-[190px]">Product</th>
                <th className="th min-w-[160px]">Description</th>
                <th className="th w-[90px]">HSN / SAC</th>
                <th className="th w-[70px] text-center">Unit</th>
                <th className="th w-[150px] text-center" title="4x4=16 · 4x4x6=96 · 17.25x4.5+12.5x4.55=134.5">Size</th>
                <th className="th w-[110px] text-right" title="kg / ton value. Toggle Price-by below to bill by weight.">Weight</th>
                <th className="th w-[90px] text-right">Qty</th>
                <th className="th w-[100px] text-right">Rate</th>
                <th className="th w-[110px] text-right">Amount</th>
                <th className="th w-[90px] text-right">GST %</th>
                <th className="th w-[100px] text-right">GST Amt</th>
                <th className="th w-[120px] text-right">Total</th>
                <th className="th w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it, idx) => {
                const sizeMult = parseSize(it.size);
                const amount = computeLineAmount(it);
                const perLine = form.gst_mode === 'per_line';
                const gstAmt = perLine ? (amount * (Number(it.gst_rate) || 0)) / 100 : 0;
                const total = amount + gstAmt;
                const byWeight = it.price_by === 'weight';
                return (
                  <tr key={idx} className="align-top">
                    <td className="td">
                      <select className="input py-2 text-sm w-full" value={it.product_id || ''}
                        onChange={(e) => pickProduct(idx, e.target.value)}>
                        <option value="">— Manual entry —</option>
                        {products.filter((p) => p.is_active).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <input className="input py-2 text-sm mt-1 w-full" placeholder="Item name"
                        value={it.name} onChange={(e) => updateItem(idx, { name: e.target.value })} />
                    </td>
                    <td className="td">
                      <textarea className="input py-2 text-sm min-h-[72px] w-full"
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })} />
                    </td>
                    <td className="td">
                      <input
                        className="input py-2 text-sm w-full"
                        placeholder="7308"
                        value={it.hsn_code}
                        onChange={(e) => updateItem(idx, { hsn_code: e.target.value })}
                      />
                    </td>
                    <td className="td">
                      <input className="input py-2 text-sm text-center w-full" value={it.unit}
                        onChange={(e) => updateItem(idx, { unit: e.target.value })} />
                    </td>
                    <td className="td">
                      <input className="input py-2 text-sm text-center w-full"
                        placeholder="4x4  or  17.25x4.5+12.5x4.55"
                        title="Single: 4x4=16 · Volume: 4x4x6=96 · Multi-face: 17.25x4.5+12.5x4.55=134.5 (sum of areas)"
                        value={it.size} onChange={(e) => updateItem(idx, { size: e.target.value })} />
                      {it.size && sizeMult !== 1 && (
                        <div className="text-[10px] text-slate-500 text-center mt-0.5">= {sizeMult % 1 === 0 ? sizeMult : sizeMult.toFixed(3)}</div>
                      )}
                    </td>
                    <td className="td">
                      <input
                        type="text"
                        className={'input py-2 text-sm text-right w-full ' + (byWeight ? 'ring-1 ring-brand-300' : '')}
                        placeholder="317.6"
                        value={it.weight}
                        onChange={(e) => updateItem(idx, { weight: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => updateItem(idx, { price_by: byWeight ? 'size' : 'weight' })}
                        className={
                          'mt-1 w-full text-[10px] px-1 py-0.5 rounded transition ' +
                          (byWeight
                            ? 'bg-brand-600 text-white hover:bg-brand-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                        }
                        title={byWeight ? 'Amount = weight × qty × rate' : 'Amount = size × qty × rate'}
                      >
                        {byWeight ? '⚖ by Weight' : '📐 by Size'}
                      </button>
                    </td>
                    <td className="td">
                      <input type="number" min="0" step="0.01"
                        className="input py-2 text-sm text-right w-full"
                        value={it.quantity} onChange={(e) => updateItem(idx, { quantity: e.target.value })} />
                    </td>
                    <td className="td">
                      <input type="number" min="0" step="0.01" className="input py-2 text-sm text-right w-full"
                        value={it.rate} onChange={(e) => updateItem(idx, { rate: e.target.value })} />
                    </td>
                    <td className="td text-right text-sm font-medium">{money(amount)}</td>
                    <td className="td">
                      <input type="number" min="0" step="0.01"
                        className={'input py-2 text-sm text-right w-full ' + (!perLine ? 'opacity-40 cursor-not-allowed' : '')}
                        disabled={!perLine} value={it.gst_rate}
                        onChange={(e) => updateItem(idx, { gst_rate: e.target.value })} />
                    </td>
                    <td className={'td text-right text-sm ' + (!perLine ? 'text-slate-400' : '')}>
                      {perLine ? money(gstAmt) : '—'}
                    </td>
                    <td className="td text-right text-sm font-bold">{money(total)}</td>
                    <td className="td text-right">
                      <button onClick={() => removeRow(idx)} className="text-red-600 hover:bg-red-50 rounded p-1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 border-t border-slate-200">
          <div className="lg:col-span-2 space-y-3">
            <div>
              <label className="label">Notes (on PDF)</label>
              <textarea className="input min-h-[80px]" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <label className="label">Terms & Conditions</label>
              <textarea className="input min-h-[120px] font-mono text-xs" value={form.terms}
                onChange={(e) => setForm({ ...form, terms: e.target.value })} />
            </div>
          </div>
          <div className="bg-slate-50 rounded-md p-4 h-fit border border-slate-200 space-y-3">
            <div>
              <label className="label mb-1">GST calculation</label>
              <div className="flex gap-1 p-1 bg-white rounded-md border border-slate-200">
                <button type="button" onClick={() => setForm((f) => ({ ...f, gst_mode: 'per_line' }))}
                  className={'flex-1 text-xs py-1.5 rounded font-medium transition ' +
                    (form.gst_mode === 'per_line' ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800')}>
                  Per product
                </button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, gst_mode: 'flat_on_total' }))}
                  className={'flex-1 text-xs py-1.5 rounded font-medium transition ' +
                    (form.gst_mode === 'flat_on_total' ? 'bg-brand-600 text-white shadow' : 'text-slate-500 hover:text-slate-800')}>
                  Flat on total
                </button>
              </div>
              {form.gst_mode === 'flat_on_total' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-slate-600">GST rate %</span>
                  <input type="number" min="0" step="0.01" className="input py-1 text-xs w-20"
                    value={form.flat_gst_rate}
                    onChange={(e) => setForm((f) => ({ ...f, flat_gst_rate: e.target.value }))} />
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-2">
              <div className="flex justify-between py-1 text-sm">
                <span>Subtotal</span>
                <span className="font-medium">{inr(totals.subtotal)}</span>
              </div>
              {Object.keys(totals.breakdown).length > 0 && (
                <div className="py-1 text-xs text-slate-600 space-y-0.5">
                  {Object.entries(totals.breakdown)
                    .sort((a, b) => Number(a[0]) - Number(b[0]))
                    .map(([rate, v]) => (
                      <div key={rate} className="flex justify-between">
                        <span>GST @ {rate}% on {inr(v.taxable)}</span>
                        <span>{inr(v.tax)}</span>
                      </div>
                    ))}
                </div>
              )}
              <div className="flex justify-between py-1 text-sm">
                <span>Total GST</span>
                <span className="font-medium">{inr(totals.gst)}</span>
              </div>
              <div className="flex justify-between py-2 mt-2 border-t border-slate-300 text-base">
                <span className="font-semibold">Grand total</span>
                <span className="font-bold text-brand-700">{inr(totals.grand)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
