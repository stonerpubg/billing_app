import ReportShell from '../../components/ReportShell.jsx';
import { inr } from '../../utils/format.js';

export default function CashflowReport() {
  return (
    <ReportShell
      title="Cashflow (In / Out)"
      subtitle="Bank-statement view: credits (payments received) and debits (expenses, advances, salaries)"
      loader={(f) => window.api.reports.cashflow(f)}
      csvFilename="cashflow"
      render={(data) => ({
        tiles: [
          { label: 'Total credit (In)', value: inr(data.total_credit), tone: 'good' },
          { label: 'Total debit (Out)', value: inr(data.total_debit), tone: 'bad' },
          { label: 'Net (In − Out)', value: inr(data.net), tone: data.net >= 0 ? 'good' : 'warn' },
          { label: 'Transactions', value: data.transactions.length },
        ],
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'kind', label: 'Type', format: (v) => v },
          { key: 'source', label: 'Source' },
          { key: 'party', label: 'Party' },
          { key: 'description', label: 'Purpose' },
          { key: 'mode', label: 'Mode' },
          { key: 'reference', label: 'Reference' },
          { key: 'credit', label: 'Credit (In)', align: 'right', format: (v) => (v > 0 ? inr(v) : '') },
          { key: 'debit', label: 'Debit (Out)', align: 'right', format: (v) => (v > 0 ? inr(v) : '') },
          { key: 'balance', label: 'Balance', align: 'right', format: (v) => inr(v) },
        ],
        rows: data.transactions,
        totals: [
          { text: 'TOTAL', align: 'right', colSpan: 7 },
          { text: inr(data.total_credit), align: 'right' },
          { text: inr(data.total_debit), align: 'right' },
          { text: inr(data.net), align: 'right' },
        ],
      })}
    />
  );
}
