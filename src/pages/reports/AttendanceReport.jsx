import ReportShell from '../../components/ReportShell.jsx';

export default function AttendanceReport() {
  return (
    <ReportShell
      title="Attendance Summary"
      subtitle="Per-employee shift totals for the selected period. A full day = 2 shifts."
      loader={(f) => window.api.reports.attendance(f)}
      csvFilename="Attendance Summary"
      searchable
      searchPlaceholder="Search employee name / code…"
      render={(data) => {
        const workingDays = data.working_days || 0;
        const totalShifts = data.rows.reduce((s, r) => s + (r.total_shifts || 0), 0);
        const totalLeave = data.rows.reduce((s, r) => s + (r.leave_days || 0), 0);
        const totalAbsent = data.rows.reduce((s, r) => s + (r.absent || 0), 0);
        const totalDaysWorked = data.rows.reduce((s, r) => s + (r.days_worked || 0), 0);
        // Overall shift-based attendance %
        const expectedShifts = workingDays * 2 * data.rows.length;
        const overallPct = expectedShifts > 0 ? +(100 * totalShifts / expectedShifts).toFixed(1) : 0;
        return {
          tiles: [
            { label: 'Employees', value: data.rows.length },
            { label: 'Period days (calendar)', value: data.total_days || 0 },
            { label: 'Working days (excl Sun)', value: workingDays },
            { label: 'Total shifts worked', value: totalShifts, tone: 'good' },
            { label: 'Overall attendance %', value: overallPct + '%', tone: overallPct >= 80 ? 'good' : overallPct >= 60 ? 'warn' : 'bad' },
            { label: 'Leave / Absent days', value: `${totalLeave} / ${totalAbsent}`, tone: 'warn' },
          ],
          pdfSubtitle: `Working days in period: ${workingDays}. Days-present column shows "worked / working" for bonus calc.`,
          columns: [
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Employee', bold: true },
            { key: 'pay_mode', label: 'Mode', format: (v) => (v === 'per_shift' ? 'Per-shift' : v === 'weekly' ? 'Weekly' : 'Monthly') },
            { key: 'days_worked', label: 'Days Present', align: 'right', format: (v) => `${v} / ${workingDays}` },
            { key: 'day_attendance_pct', label: 'Day %', align: 'right', format: (v) => v + '%' },
            { key: 'total_shifts', label: 'Total Shifts', align: 'right' },
            { key: 'leave_days', label: 'Leave', align: 'right' },
            { key: 'absent', label: 'Absent', align: 'right' },
            { key: 'attendance_pct', label: 'Shift %', align: 'right', format: (v) => v + '%' },
          ],
          rows: data.rows,
          totals: [
            { text: 'TOTAL', align: 'right', colSpan: 3 },
            { text: `${totalDaysWorked} / ${workingDays * data.rows.length}`, align: 'right' },
            { text: '', align: 'right' },
            { text: String(totalShifts), align: 'right' },
            { text: String(totalLeave), align: 'right' },
            { text: String(totalAbsent), align: 'right' },
            { text: overallPct + '%', align: 'right' },
          ],
        };
      }}
    />
  );
}
