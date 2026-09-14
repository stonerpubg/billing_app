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
      render={(data) => {
        const totalBilled = data.invoices.reduce((s, r) => s + (r.grand_total || 0), 0);
        const totalPaid = data.invoices.reduce((s, r) => s + (r.paid_total || 0), 0);
        const kindLabel = (v) => v === 'invoice' ? 'Invoice' : v === 'quotation' ? 'Quotation' : v === 'income' ? 'Income' : v;
        return {
          tiles: [
            { label: 'Total billed', value: inr(totalBilled) },
            { label: 'Total paid', value: inr(totalPaid), tone: 'good' },
            { label: 'Total outstanding', value: inr(data.total_outstanding), tone: data.total_outstanding > 0 ? 'warn' : undefined },
            { label: '0 – 30 days', value: inr(data.aging.b0_30), tone: 'good' },
            { label: '31 – 60 days', value: inr(data.aging.b31_60), tone: 'warn' },
            { label: '60+ days', value: inr(data.aging.b60_plus), tone: 'bad' },
            { label: 'Open documents', value: data.invoices.length },
          ],
          columns: [
            { key: 'invoice_number', label: 'Number', bold: true },
            { key: 'kind', label: 'Type', format: kindLabel },
            { key: 'customer_name', label: 'Customer' },
            { key: 'invoice_date', label: 'Date' },
            { key: 'due_date', label: 'Due', format: (v) => v || '—' },
            { key: 'grand_total', label: 'Total', align: 'right', format: (v) => inr(v) },
            { key: 'paid_total', label: 'Paid', align: 'right', format: (v) => inr(v) },
            { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
          ],
          rows: data.invoices,
          totals: [
            { text: 'TOTALS', align: 'right', colSpan: 5 },
            { text: inr(totalBilled), align: 'right' },
            { text: inr(totalPaid), align: 'right' },
            { text: inr(data.total_outstanding), align: 'right' },
          ],
        };
      }}
    />
  );
}
