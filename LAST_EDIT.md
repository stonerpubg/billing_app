# LAST_EDIT — 2026-09-12

Not a git repo (no branch). Working from `d:\New folder (2)`.

## What changed this session

### Shift / attendance model overhaul
- **electron/database.js** — new columns `attendance.shifts_worked`, `attendance.shift_ids`, `employees.pay_mode / per_shift_rate / weekly_salary`, `payroll_entries.*` matching. Back-fill migration: legacy Present→2 shifts, Half→1 shift.
- **electron/database.js `computePayroll`** — 3 pay modes: per_shift (shifts × rate), weekly (prorated by paid_days/7), monthly (monthly/30 × paid_days). Monthly proration bugfix (was 5/7 of monthly salary for a 5-day week; now correct per-day rate).
- **electron/database.js `runWeeklyPayrollIfDue`** — Sun→Sat weekly period, auto-fires on app/server startup and Payroll page load. Idempotent.
- **electron/database.js `recalculatePayrollRun`** — rebuild entries with current attendance/salary while preserving paid flags.
- **electron/database.js `attendanceMatrix`** — accepts `YYYY-MM-DD..YYYY-MM-DD` range in addition to `YYYY-MM`.
- **src/pages/Attendance.jsx** — Week (default) / Month toggle. Click any cell → picker modal with ½ · 1 · 1½ · 2 buttons plus Leave / Absent (previous shift-checkboxes UI removed per request).
- **src/pages/Payroll.jsx** — Sun-Sat presets, mode-aware detail table (Rate + Shifts + Gross columns; hides basic for per-shift). Sidebar collapsed by default, ‹ › toggle. Recalculate button. Auto-Saturday banner suppressed when nothing to say.
- **src/pages/Employees.jsx** — Pay mode toggle (Per-shift / Weekly / Monthly) with conditional rate field; integer input (`step=1`).

### Credit / vendor payables system (new)
- **electron/database.js `expenses.paid_amount` column** + `_normalizePaidAmount`, `recordExpensePayment(id, amount)`, `creditReport()` grouped by vendor + line items. All P&L / cashflow / dashboard "expense" aggregates now use `paid_amount` (only cash-out counts).
- **electron/database.js `dashboardStatsPlus`** — added `payables { total_owed, item_count, top_vendors }` and `extra_expense { this_month, this_year, all_time, recent_items }`.
- **src/pages/Expenses.jsx** — Payment status radio (Paid / Partial / Credit) in form. Table has Paid / Owing columns + status pill + "+ Pay" quick-payment button + Credit tab. Optimistic filter-widening after save so newly-created rows are always visible.
- **src/pages/Dashboard.jsx** — new "📤 Vendor payables" section (total owing + top vendors, links to Credit report). Money summary tile row extended to include "Extra expenses". Recent extra-expense items table.
- **src/pages/reports/CreditReport.jsx** *(new)* — separate report at `/reports/credit`, has toggle between Line-items view and By-vendor view.

### Dashboard trend filter
- **electron/database.js `dashboardTrend(granularity, count)`** — flexible bucketing: `week` (Mon-Sun × 12), `month` (existing 12), `year` (5).
- **src/pages/Dashboard.jsx** — Trends section has Week/Month/Year toggle; drives both charts + Monthly-performance table.

### Reports overhaul
- **electron/database.js `attendanceSummary`** — adds `working_days`, `total_days`, per-row `total_shifts`, `days_worked`, `attendance_pct`, `day_attendance_pct`.
- **electron/database.js `payrollRegister`** — filter fixed: was filtering by `run_date` (day the report ran), now uses `period_end` overlap. Selecting "this week" no longer leaks old monthly runs.
- **src/pages/reports/AttendanceReport.jsx** — shift-based columns + Days Present (worked/working) for bonus calc.
- **src/pages/reports/PayrollRegisterReport.jsx** — mode-aware columns; period shown as human date range.
- **src/components/ReportShell.jsx** — added `searchable` prop (client-side name/code search) + `useMemo` fix (include `render` in deps so CreditReport view toggle works).

### PDF generator + unified export
- **electron/pdf-generator.js** — landscape A4, `pdfSafe()` helper replaces ₹ with "Rs." (Roboto/Helvetica don't ship U+20B9), better column-width distribution.
- **src/components/ExportButton.jsx** *(new)* — one dropdown button showing CSV or PDF; used by Payroll, Expenses, Quotations, Invoices, and ReportShell.
- **src/components/ReportShell.jsx** — switched from separate CSV/PDF buttons to unified ExportButton. Filenames now just the report title (no date-range suffix).

### Removed / cleaned up
- **src/pages/QuotationView.jsx** — "Convert to Invoice" link removed per request.
- **src/pages/Dashboard.jsx** — "+ Quotation" button removed from header (available inside Quotations page).

## Verified end-to-end via API
- Dinesh V (per-shift, ₹950): 6 shifts × 950 = ₹5,700 gross - ₹1,000 advance = ₹4,700 net.
- Suresh M (monthly, ₹25k): 2.5 paid days × (25000/30) = ₹2,083 gross for a 1-week period (post monthly-proration fix).
- 10K material credit → 3K partial payment → dashboard payables shows 7K owing → +4K payment → 3K remaining.
- Auto-Saturday payroll fires with Sun→Sat range on server startup.
- Dashboard trend endpoints return sensible data for week/month/year granularities.

## Known / to verify by user
- **Hard-refresh needed** — bundle rebuilt multiple times. Browser cache can serve old JS; press Ctrl+Shift+R at least once.
- **HMR quirks** — if the running dev process kept state from before the schema migrations, some pages may show stale data until restart.
- **Legacy monthly payroll runs** (period='YYYY-MM' from seeder) still exist in DB. They render with the human-readable period label, but they were generated pre-migration.

## What's next / open questions
- No pending work items — user said "end".
- Yearly bonus calculation formula isn't wired up as a report yet; the raw data (`days_worked / working_days`, `attendance_pct`) is available in Attendance report tiles + columns. If the user later wants a `Bonus = daily_rate × days_present × bonus_multiplier` report, add a new Bonus Report page.
- Consider consolidating the `payment_status` derivation into a helper module rather than duplicated in Expenses.jsx / creditReport SQL. Not urgent.
