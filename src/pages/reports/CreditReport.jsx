import { useState } from 'react';
import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

// Two views: by-vendor aggregate, or line-item detail. User toggles.
export default function CreditReport() {
  const [view, setView] = useState('items'); // 'items' | 'vendors'

  const commonProps = {
    title: 'Credit Management',
    subtitle: 'Material and expenses that are unpaid or partially paid. Track what you still owe vendors.',
    loader: (f) => window.api.reports.credit(f),
    csvFilename: view === 'vendors' ? 'Vendor Payables' : 'Credit Items',
    searchable: true,
    searchPlaceholder: 'Search vendor / item / category…',
  };

  const toggle = (
    <div className="card mb-4">
      <div className="card-body flex items-center gap-3">
        <div className="text-xs text-slate-500 uppercase tracking-wide font-semibold">View:</div>
        <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
          {[
            { key: 'items', label: 'Line items' },
            { key: 'vendors', label: 'By vendor' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setView(m.key)}
              className={
                'px-3 py-1.5 rounded text-xs font-medium transition ' +
                (view === m.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-800')
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 ml-auto">
          {view === 'items'
            ? 'Every unpaid/partial expense entry, newest first.'
            : 'Total balance grouped per vendor.'}
        </div>
      </div>
    </div>
  );

  if (view === 'vendors') {
    return (
      <>
        {toggle}
        <ReportShell
          {...commonProps}
          searchKeys={['vendor_name']}
          render={(data) => ({
            tiles: [
              { label: 'Vendors owed', value: data.vendors.length },
              { label: 'Total billed', value: inr(data.total_billed) },
              { label: 'Total paid', value: inr(data.total_paid), tone: 'good' },
              { label: 'Total outstanding', value: inr(data.total_outstanding), tone: data.total_outstanding > 0 ? 'bad' : 'good' },
            ],
            columns: [
              { key: 'vendor_name', label: 'Vendor', bold: true },
              { key: 'item_count', label: 'Open items', align: 'right' },
              { key: 'oldest_credit_date', label: 'Oldest since' },
              { key: 'total_billed', label: 'Billed', align: 'right', format: (v) => inr(v) },
              { key: 'total_paid', label: 'Paid', align: 'right', format: (v) => inr(v) },
              { key: 'total_outstanding', label: 'Outstanding', align: 'right', format: (v) => inr(v) },
            ],
            rows: data.vendors,
            totals: [
              { text: 'TOTAL', align: 'right', colSpan: 3 },
              { text: inr(data.total_billed), align: 'right' },
              { text: inr(data.total_paid), align: 'right' },
              { text: inr(data.total_outstanding), align: 'right' },
            ],
          })}
        />
      </>
    );
  }

  // Line-item view
  return (
    <>
      {toggle}
      <ReportShell
        {...commonProps}
        searchKeys={['vendor_name', 'description', 'category']}
        render={(data) => ({
          tiles: [
            { label: 'Open items', value: data.items.length },
            { label: 'Total billed', value: inr(data.total_billed) },
            { label: 'Paid so far', value: inr(data.total_paid), tone: 'good' },
            { label: 'Balance owing', value: inr(data.total_outstanding), tone: data.total_outstanding > 0 ? 'bad' : 'good' },
          ],
          columns: [
            { key: 'expense_date', label: 'Date' },
            { key: 'vendor_name', label: 'Vendor', bold: true },
            { key: 'category', label: 'Category' },
            { key: 'description', label: 'Item / description' },
            { key: 'amount', label: 'Billed', align: 'right', format: (v) => inr(v) },
            { key: 'paid_amount', label: 'Paid', align: 'right', format: (v) => inr(v) },
            { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
            { key: 'payment_status', label: 'Status' },
          ],
          rows: data.items,
          totals: [
            { text: 'TOTAL', align: 'right', colSpan: 4 },
            { text: inr(data.total_billed), align: 'right' },
            { text: inr(data.total_paid), align: 'right' },
            { text: inr(data.total_outstanding), align: 'right' },
            { text: '', align: 'left' },
          ],
        })}
      />
    </>
  );
}
