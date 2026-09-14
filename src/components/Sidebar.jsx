import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPageAccess } from '../utils/pagePermissions.js';

const linkClass = ({ isActive }) =>
  'flex items-center gap-3 px-3.5 py-2 rounded-md text-sm font-medium transition ' +
  (isActive
    ? 'bg-brand-600 text-white shadow-sm'
    : 'text-slate-300 hover:bg-slate-700/60 hover:text-white');

const childLinkClass = ({ isActive }) =>
  'flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-md text-xs font-medium transition ' +
  (isActive
    ? 'bg-brand-600 text-white shadow-sm'
    : 'text-slate-400 hover:bg-slate-700/40 hover:text-white');

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const Chevron = ({ open }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    className={'w-3.5 h-3.5 ml-auto transition-transform ' + (open ? 'rotate-90' : '')}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

function Section({ title, icon, children, defaultOpen = false, activePrefix }) {
  const location = useLocation();
  const isPathActive = activePrefix && location.pathname.startsWith(activePrefix);
  const [open, setOpen] = useState(defaultOpen || isPathActive);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          'w-full flex items-center gap-3 px-3.5 py-2 rounded-md text-sm font-medium transition ' +
          (isPathActive ? 'text-white bg-slate-800/60' : 'text-slate-300 hover:bg-slate-700/40 hover:text-white')
        }
      >
        {icon && <Icon d={icon} />}
        <span>{title}</span>
        <Chevron open={open} />
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const can = (path) => hasPageAccess(user, path);

  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-white flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-800 shrink-0">
        <div className="text-lg font-bold tracking-tight">MRL GROUP OF COMPANIES</div>
        <div className="text-[10px] text-slate-400 mt-0.5">Fabrication • Plumbing • Electrical</div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5 min-h-0">
        {/* Main workflow */}
        {can('/') && (
          <NavLink to="/" end className={linkClass}>
            <Icon d="M3 12l9-9 9 9M5 10v10h14V10" />
            Dashboard
          </NavLink>
        )}
        {can('/quotations') && (
          <NavLink to="/quotations" className={linkClass}>
            <Icon d="M9 12h6M9 16h6M9 8h6M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
            Quotations
          </NavLink>
        )}
        {can('/invoices') && (
          <NavLink to="/invoices" className={linkClass}>
            <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            Invoices
          </NavLink>
        )}
        {can('/income') && (
          <NavLink to="/income" className={linkClass}>
            <Icon d="M12 6v12m-8-6h16" />
            Income
          </NavLink>
        )}
        {can('/expenses') && (
          <NavLink to="/expenses" className={linkClass}>
            <Icon d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m9-4a9 9 0 11-18 0 9 9 0 0118 0z" />
            Expenses
          </NavLink>
        )}
        {can('/customers') && (
          <NavLink to="/customers" className={linkClass}>
            <Icon d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m4-3a4 4 0 100-8 4 4 0 000 8z" />
            Customers
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin/vendors" className={linkClass}>
            <Icon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7m8 4L4 7m0 0v10l8 4" />
            Vendors
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin/products" className={linkClass}>
            <Icon d="M5 8h14M5 8a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v1a2 2 0 01-2 2M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M10 12h4" />
            Products
          </NavLink>
        )}
        {can('/reports') && (
          <NavLink to="/reports" className={linkClass}>
            <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            Reports
          </NavLink>
        )}

        {/* HR (collapsible) — only show if the user can see at least one HR page */}
        {(can('/hr/employees') || can('/hr/attendance') || can('/hr/leaves') || can('/hr/payroll')) && (
          <Section
            title="HR"
            icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            activePrefix="/hr"
          >
            {can('/hr/employees') && <NavLink to="/hr/employees" className={childLinkClass}>Employees</NavLink>}
            {can('/hr/attendance') && <NavLink to="/hr/attendance" className={childLinkClass}>Attendance</NavLink>}
            {can('/hr/leaves') && <NavLink to="/hr/leaves" className={childLinkClass}>Leaves</NavLink>}
            {can('/hr/payroll') && <NavLink to="/hr/payroll" className={childLinkClass}>Payroll</NavLink>}
          </Section>
        )}

        {/* Admin (collapsible, only for admins) */}
        {isAdmin && (
          <Section
            title="Admin"
            icon="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.55V21a2 2 0 11-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1.03H3a2 2 0 110-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001.03-1.55V3a2 2 0 114 0v.09c0 .66.39 1.26 1.03 1.55.63.28 1.37.13 1.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06c-.47.5-.62 1.24-.34 1.87.29.64.89 1.03 1.55 1.03H21a2 2 0 110 4h-.09c-.66 0-1.26.39-1.55 1.03z"
            activePrefix="/admin"
          >
            <NavLink to="/admin/users" className={childLinkClass}>Users</NavLink>
            <NavLink to="/admin/pdf-designer" className={childLinkClass}>PDF Designer</NavLink>
            <NavLink to="/admin/settings" className={childLinkClass}>Settings</NavLink>
          </Section>
        )}
      </nav>

      <div className="p-3 border-t border-slate-800 shrink-0">
        <div className="px-3 py-1.5 mb-1">
          <div className="text-sm font-semibold text-white">{user?.username}</div>
          <div className="text-[10px] text-slate-400 capitalize">{user?.role}</div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-slate-700/60 hover:text-white transition"
        >
          <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
