import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function GstReport() {
  return (
    <ReportShell
      title="GST Summary"
      subtitle="Output GST from billed sales, grouped by rate. Use these numbers when filing GSTR-1."
      loader={(f) => window.api.reports.gst(f)}
      csvFilename="gst-summary"
      render={(data) => ({
        tiles: [
          { label: 'Taxable value', value: inr(data.total_taxable) },
          { label: 'CGST', value: inr(data.total_cgst) },
          { label: 'SGST', value: inr(data.total_sgst) },
          { label: 'Total GST', value: inr(data.total_tax), tone: 'warn' },
        ],
        columns: [
          { key: 'rate', label: 'GST Rate', format: (v) => v + '%', align: 'center' },
          { key: 'taxable', label: 'Taxable Value', align: 'right', format: (v) => inr(v) },
          { key: 'cgst', label: 'CGST', align: 'right', format: (v) => inr(v) },
          { key: 'sgst', label: 'SGST', align: 'right', format: (v) => inr(v) },
          { key: 'tax_total', label: 'Total GST', align: 'right', format: (v) => inr(v) },
        ],
        rows: data.rows,
        totals: [
          { text: 'TOTAL', align: 'right' },
          { text: inr(data.total_taxable), align: 'right' },
          { text: inr(data.total_cgst), align: 'right' },
          { text: inr(data.total_sgst), align: 'right' },
          { text: inr(data.total_tax), align: 'right' },
        ],
      })}
    />
  );
}
