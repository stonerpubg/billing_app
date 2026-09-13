import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function CustomerReport() {
  return (
    <ReportShell
      title="Customer Directory"
      subtitle="All customers with contact + business volume."
      loader={() => window.api.reports.customers()}
      showDateFilter={false}
      csvFilename="customers"
      render={(rows) => ({
        tiles: [
          { label: 'Customers', value: rows.length },
          { label: 'Total quotations', value: rows.reduce((s, r) => s + r.quotation_count, 0) },
          { label: 'Total invoiced', value: inr(rows.reduce((s, r) => s + r.invoice_value, 0)) },
          { label: 'Total received', value: inr(rows.reduce((s, r) => s + r.total_paid, 0)), tone: 'good' },
          { label: 'Total outstanding', value: inr(rows.reduce((s, r) => s + r.outstanding, 0)), tone: 'warn' },
        ],
        columns: [
          { key: 'name', label: 'Name', bold: true },
          { key: 'contact_person', label: 'Contact' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'gstin', label: 'GSTIN' },
          { key: 'city', label: 'City' },
          { key: 'quotation_count', label: 'Quotes', align: 'right' },
          { key: 'invoice_count', label: 'Invoices', align: 'right' },
          { key: 'total_paid', label: 'Paid', align: 'right', format: (v) => inr(v) },
          { key: 'outstanding', label: 'Outstanding', align: 'right', format: (v) => inr(v) },
        ],
        rows,
      })}
    />
  );
}
