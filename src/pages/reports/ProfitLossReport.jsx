import ReportShell from '../../components/ReportShell.jsx';
import { CategoryDonut } from '../../components/Charts.jsx';
import { inr } from '../../utils/format.js';

export default function ProfitLossReport() {
  return (
    <ReportShell
      title="Profit & Loss"
      subtitle="Income (payments received) minus deducted expenses. Outstanding = billed but not yet paid."
      loader={(f) => window.api.reports.profitLoss(f)}
      csvFilename="profit-loss"
      render={(data) => ({
        tiles: [
          { label: 'Invoiced / Billed', value: inr(data.invoiced) },
          { label: 'Income received', value: inr(data.income), tone: 'good' },
          { label: 'Outstanding', value: inr(data.outstanding), tone: 'warn' },
          { label: 'Expenses (deducted)', value: inr(data.expense), tone: 'bad' },
          { label: 'Extra expenses', value: inr(data.extra_expense || 0), tone: 'warn' },
          { label: 'Net (Income − Expenses)', value: inr(data.net), tone: data.net >= 0 ? 'good' : 'bad' },
        ],
        columns: [
          { key: 'category', label: 'Expense category' },
          { key: 'total', label: 'Total', align: 'right', format: (v) => inr(v) },
          { key: 'share', label: 'Share', align: 'right', get: (r) => (data.expense > 0 ? ((r.total / data.expense) * 100).toFixed(1) + '%' : '0%') },
        ],
        rows: data.byExpenseCategory,
        totals: [
          { text: 'TOTAL EXPENSES', align: 'right', colSpan: 1 },
          { text: inr(data.expense), align: 'right' },
          { text: '100%', align: 'right' },
        ],
        extra: (
          <div className="card card-body mt-4">
            <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
              Expense mix
            </div>
            <CategoryDonut data={data.byExpenseCategory || []} />
          </div>
        ),
      })}
    />
  );
}
