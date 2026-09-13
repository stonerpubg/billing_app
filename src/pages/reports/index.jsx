import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const GROUPS = [
  {
    title: 'Financial',
    subtitle: 'Money in / out, profit, tax',
    tone: 'text-brand-700 bg-brand-50 border-brand-200',
    reports: [
      { path: 'cashflow', label: 'Cashflow (In / Out)', desc: 'Bank-statement view — credits & debits with running balance.', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z' },
      { path: 'sales', label: 'Sales', desc: 'All billed quotations + invoices with received & balance.', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
      { path: 'profit-loss', label: 'Profit & Loss', desc: 'Income minus deducted expenses over a period.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { path: 'receivables', label: 'Receivables Aging', desc: 'Outstanding money by age (0-30 / 31-60 / 60+ days).', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
      { path: 'gst', label: 'GST Summary', desc: 'Output GST by rate — for GSTR filing.', icon: 'M9 12h6M9 16h6M9 8h6M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z' },
      { path: 'credit', label: 'Credit Management', desc: 'Vendor credit / partial-paid material — what you still owe.', adminOnly: true, icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    ],
  },
  {
    title: 'HR & Payroll',
    subtitle: 'Staff, attendance, salaries',
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    reports: [
      { path: 'attendance', label: 'Attendance Summary', desc: 'Per-employee days present, half-day, absent, leave.', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { path: 'payroll-register', label: 'Payroll Register', desc: 'Every payroll entry across all runs.', adminOnly: true, icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
      { path: 'advances-outstanding', label: 'Advances Outstanding', desc: 'Employees who still owe from past advances.', adminOnly: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    title: 'Directory',
    subtitle: 'Contacts & suppliers',
    tone: 'text-amber-700 bg-amber-50 border-amber-200',
    reports: [
      { path: 'customers', label: 'Customer Directory', desc: 'All customers with volume + outstanding.', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m4-3a4 4 0 100-8 4 4 0 000 8z' },
      { path: 'vendors', label: 'Vendor Directory', desc: 'All vendors with spend in period.', adminOnly: true, icon: 'M3 3h18v4H3zM3 10h18v11H3zM8 14h8' },
    ],
  },
];

export default function ReportsIndex() {
  const { isAdmin } = useAuth();
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Pick a report. Every one downloads as CSV or PDF."
      />
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-base font-bold text-slate-900">{group.title}</h2>
              <span className="text-xs text-slate-500">— {group.subtitle}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.reports
                .filter((r) => !r.adminOnly || isAdmin)
                .map((r) => (
                  <Link
                    key={r.path}
                    to={r.path}
                    className="card p-4 hover:border-brand-400 hover:shadow-md transition group flex items-start gap-3"
                  >
                    <div className={'shrink-0 p-2 rounded-md border ' + group.tone}>
                      <Icon d={r.icon} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">
                        {r.label}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">{r.desc}</div>
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
