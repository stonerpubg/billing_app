import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function AdvancesOutstandingReport() {
  return (
    <ReportShell
      title="Advances Outstanding"
      subtitle="Balance still owed after all partial recoveries. Outstanding = advance amount − sum of recoveries across payroll runs."
      loader={() => window.api.reports.advancesOutstanding()}
      showDateFilter={false}
      csvFilename="advances-outstanding"
      render={(data) => ({
        tiles: [
          { label: 'Employees with dues', value: data.rows.length },
          { label: 'Total outstanding', value: inr(data.total_outstanding), tone: 'warn' },
        ],
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Employee', bold: true },
          { key: 'advance_count', label: 'Open advances', align: 'right' },
          { key: 'oldest_date', label: 'Oldest open advance' },
          { key: 'outstanding', label: 'Outstanding balance', align: 'right', format: (v) => inr(v) },
        ],
        rows: data.rows,
        totals: [
          { text: 'TOTAL', align: 'right', colSpan: 4 },
          { text: inr(data.total_outstanding), align: 'right' },
        ],
      })}
    />
  );
}
