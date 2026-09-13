import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function SalesReport() {
  return (
    <ReportShell
      title="Sales Report"
      subtitle="All billed quotations + invoices in the period."
      loader={(f) => window.api.reports.sales(f)}
      csvFilename="sales"
      render={(data) => ({
        tiles: [
          { label: 'Billed', value: inr(data.total_billed) },
          { label: 'Received', value: inr(data.total_received), tone: 'good' },
          { label: 'Outstanding', value: inr(data.total_outstanding), tone: data.total_outstanding > 0 ? 'warn' : undefined },
          { label: 'Documents', value: data.rows.length },
        ],
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'number', label: 'Number', bold: true },
          { key: 'kind', label: 'Type', format: (v) => (v === 'invoice' ? 'Invoice' : 'Quotation') },
          { key: 'customer_name', label: 'Customer' },
          { key: 'subject', label: 'Subject' },
          { key: 'grand_total', label: 'Total', align: 'right', format: (v) => inr(v) },
          { key: 'paid_total', label: 'Received', align: 'right', format: (v) => inr(v) },
          { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
          { key: 'status', label: 'Status' },
        ],
        rows: data.rows,
        totals: [
          { text: 'TOTAL', align: 'right', colSpan: 5 },
          { text: inr(data.total_billed), align: 'right' },
          { text: inr(data.total_received), align: 'right' },
          { text: inr(data.total_outstanding), align: 'right' },
          { text: '', align: 'left' },
        ],
      })}
    />
  );
}
