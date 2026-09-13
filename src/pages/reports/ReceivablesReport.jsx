import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function ReceivablesReport() {
  return (
    <ReportShell
      title="Receivables Aging"
      subtitle="Money owed to you — grouped by how old the bill is."
      loader={() => window.api.invoices.receivables()}
      showDateFilter={false}
      csvFilename="receivables"
      render={(data) => ({
        tiles: [
          { label: '0 – 30 days', value: inr(data.aging.b0_30), tone: 'good' },
          { label: '31 – 60 days', value: inr(data.aging.b31_60), tone: 'warn' },
          { label: '60+ days', value: inr(data.aging.b60_plus), tone: 'bad' },
          { label: 'Total outstanding', value: inr(data.total_outstanding), tone: data.total_outstanding > 0 ? 'warn' : undefined },
          { label: 'Open documents', value: data.invoices.length },
        ],
        columns: [
          { key: 'invoice_number', label: 'Number', bold: true },
          { key: 'kind', label: 'Type', format: (v) => (v === 'invoice' ? 'Invoice' : 'Quotation') },
          { key: 'customer_name', label: 'Customer' },
          { key: 'invoice_date', label: 'Date' },
          { key: 'due_date', label: 'Due', format: (v) => v || '—' },
          { key: 'grand_total', label: 'Total', align: 'right', format: (v) => inr(v) },
          { key: 'paid_total', label: 'Paid', align: 'right', format: (v) => inr(v) },
          { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
        ],
        rows: data.invoices,
        totals: [
          { text: 'TOTAL OUTSTANDING', align: 'right', colSpan: 7 },
          { text: inr(data.total_outstanding), align: 'right' },
        ],
      })}
    />
  );
}
