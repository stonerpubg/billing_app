import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function VendorReport() {
  return (
    <ReportShell
      title="Vendor Directory"
      subtitle="All vendors with contact + total spent in the selected period."
      loader={(f) => window.api.reports.vendors(f)}
      csvFilename="vendors"
      render={(rows) => ({
        tiles: [
          { label: 'Vendors', value: rows.length },
          { label: 'Total spent', value: inr(rows.reduce((s, r) => s + r.total_spent, 0)), tone: 'bad' },
        ],
        columns: [
          { key: 'name', label: 'Name', bold: true },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'gstin', label: 'GSTIN' },
          { key: 'expense_count', label: 'Purchases', align: 'right' },
          { key: 'total_spent', label: 'Total spent', align: 'right', format: (v) => inr(v) },
        ],
        rows,
      })}
    />
  );
}
