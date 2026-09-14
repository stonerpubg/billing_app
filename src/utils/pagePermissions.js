// Central list of pages that a non-admin user can be granted access to.
// The `key` is stored in each user's `allowed_pages` JSON array.
// The `path` matches the route so navigation guards and sidebar can filter.
//
// Admin-only pages (Products, Vendors, PDF Designer, Settings, Users) are NOT
// in this list — they're always gated by role === 'admin'.

export const PAGE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'quotations', label: 'Quotations', path: '/quotations' },
  { key: 'invoices', label: 'Invoices', path: '/invoices' },
  { key: 'income', label: 'Income', path: '/income' },
  { key: 'expenses', label: 'Expenses', path: '/expenses' },
  { key: 'customers', label: 'Customers', path: '/customers' },
  { key: 'reports', label: 'Reports', path: '/reports' },
  { key: 'hr.employees', label: 'HR — Employees', path: '/hr/employees' },
  { key: 'hr.attendance', label: 'HR — Attendance', path: '/hr/attendance' },
  { key: 'hr.leaves', label: 'HR — Leaves', path: '/hr/leaves' },
  { key: 'hr.payroll', label: 'HR — Payroll', path: '/hr/payroll' },
];

// Prefix-match a route to a permission key. Handles nested routes like
// /quotations/123 → matches 'quotations'. Returns null if the path is
// admin-only (not in this list).
export function permissionKeyForPath(path) {
  const p = String(path || '/').split('?')[0];
  // Exact-first for '/', so '/quotations' doesn't match dashboard
  for (const it of PAGE_PERMISSIONS) {
    if (it.path === '/') continue;
    if (p === it.path || p.startsWith(it.path + '/')) return it.key;
  }
  if (p === '/') return 'dashboard';
  return null;
}

export function hasPageAccess(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const key = permissionKeyForPath(path);
  if (key == null) return false; // admin-only page or unknown
  return Array.isArray(user.allowed_pages) && user.allowed_pages.includes(key);
}
