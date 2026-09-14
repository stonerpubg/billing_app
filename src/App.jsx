import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Quotations from './pages/Quotations.jsx';
import QuotationEditor from './pages/QuotationEditor.jsx';
import QuotationView from './pages/QuotationView.jsx';
import Customers from './pages/Customers.jsx';
import Products from './pages/Products.jsx';
import Settings from './pages/Settings.jsx';
import PdfDesigner from './pages/PdfDesigner.jsx';
import Invoices from './pages/Invoices.jsx';
import InvoiceEditor from './pages/InvoiceEditor.jsx';
import InvoiceView from './pages/InvoiceView.jsx';
import Expenses from './pages/Expenses.jsx';
import Income from './pages/Income.jsx';
import Vendors from './pages/Vendors.jsx';
import ReportsIndex from './pages/reports/index.jsx';
import CashflowReport from './pages/reports/CashflowReport.jsx';
import SalesReport from './pages/reports/SalesReport.jsx';
import ProfitLossReport from './pages/reports/ProfitLossReport.jsx';
import ReceivablesReport from './pages/reports/ReceivablesReport.jsx';
import GstReport from './pages/reports/GstReport.jsx';
import AttendanceReport from './pages/reports/AttendanceReport.jsx';
import PayrollRegisterReport from './pages/reports/PayrollRegisterReport.jsx';
import AdvancesOutstandingReport from './pages/reports/AdvancesOutstandingReport.jsx';
import CustomerReport from './pages/reports/CustomerReport.jsx';
import VendorReport from './pages/reports/VendorReport.jsx';
import CreditReport from './pages/reports/CreditReport.jsx';
import Employees from './pages/Employees.jsx';
import EmployeeDetail from './pages/EmployeeDetail.jsx';
import Attendance from './pages/Attendance.jsx';
import Leaves from './pages/Leaves.jsx';
import Payroll from './pages/Payroll.jsx';
import Users from './pages/Users.jsx';
import { hasPageAccess } from './utils/pagePermissions.js';

function RequirePageAccess({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!hasPageAccess(user, location.pathname)) {
    return (
      <div className="p-8 text-center text-slate-500">
        <div className="text-lg font-semibold text-red-600 mb-2">Access denied</div>
        <div className="text-sm">You don't have permission to view this page. Ask an admin to grant access.</div>
      </div>
    );
  }
  return children;
}

function RequireAuth({ children }) {
  const { isAuthenticated, isReady } = useAuth();
  if (!isReady) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        Checking session…
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

// Prevent <input type="number"> value changes when the mouse wheel scrolls over a focused one.
// The default browser behavior mutates the value on wheel, which mangles data mid-scroll.
function useDisableWheelOnNumberInputs() {
  useEffect(() => {
    const handler = (e) => {
      const el = e.target;
      if (
        el &&
        el.tagName === 'INPUT' &&
        el.type === 'number' &&
        document.activeElement === el
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);
}

export default function App() {
  useDisableWheelOnNumberInputs();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<RequirePageAccess><Dashboard /></RequirePageAccess>} />
                <Route path="/quotations" element={<RequirePageAccess><Quotations /></RequirePageAccess>} />
                <Route path="/quotations/new" element={<RequirePageAccess><QuotationEditor /></RequirePageAccess>} />
                <Route path="/quotations/:id/edit" element={<RequirePageAccess><QuotationEditor /></RequirePageAccess>} />
                <Route path="/quotations/:id" element={<RequirePageAccess><QuotationView /></RequirePageAccess>} />
                <Route path="/invoices" element={<RequirePageAccess><Invoices /></RequirePageAccess>} />
                <Route path="/invoices/new" element={<RequirePageAccess><InvoiceEditor /></RequirePageAccess>} />
                <Route path="/invoices/:id/edit" element={<RequirePageAccess><InvoiceEditor /></RequirePageAccess>} />
                <Route path="/invoices/:id" element={<RequirePageAccess><InvoiceView /></RequirePageAccess>} />
                <Route path="/expenses" element={<RequirePageAccess><Expenses /></RequirePageAccess>} />
                <Route path="/income" element={<RequirePageAccess><Income /></RequirePageAccess>} />
                <Route path="/customers" element={<RequirePageAccess><Customers /></RequirePageAccess>} />
                <Route path="/reports" element={<RequirePageAccess><ReportsIndex /></RequirePageAccess>} />
                <Route path="/reports/cashflow" element={<CashflowReport />} />
                <Route path="/reports/sales" element={<SalesReport />} />
                <Route path="/reports/profit-loss" element={<ProfitLossReport />} />
                <Route path="/reports/receivables" element={<ReceivablesReport />} />
                <Route path="/reports/gst" element={<GstReport />} />
                <Route path="/reports/attendance" element={<AttendanceReport />} />
                <Route path="/reports/payroll-register" element={<RequireAdmin><PayrollRegisterReport /></RequireAdmin>} />
                <Route path="/reports/advances-outstanding" element={<RequireAdmin><AdvancesOutstandingReport /></RequireAdmin>} />
                <Route path="/reports/customers" element={<CustomerReport />} />
                <Route path="/reports/vendors" element={<RequireAdmin><VendorReport /></RequireAdmin>} />
                <Route path="/reports/credit" element={<RequireAdmin><CreditReport /></RequireAdmin>} />
                <Route path="/hr/employees" element={<RequirePageAccess><Employees /></RequirePageAccess>} />
                <Route path="/hr/employees/:id" element={<RequirePageAccess><EmployeeDetail /></RequirePageAccess>} />
                <Route path="/hr/attendance" element={<RequirePageAccess><Attendance /></RequirePageAccess>} />
                <Route path="/hr/leaves" element={<RequirePageAccess><Leaves /></RequirePageAccess>} />
                <Route path="/hr/payroll" element={<RequirePageAccess><Payroll /></RequirePageAccess>} />
                <Route
                  path="/admin/vendors"
                  element={<RequireAdmin><Vendors /></RequireAdmin>}
                />
                <Route
                  path="/admin/products"
                  element={
                    <RequireAdmin>
                      <Products />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/settings"
                  element={
                    <RequireAdmin>
                      <Settings />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/pdf-designer"
                  element={
                    <RequireAdmin>
                      <PdfDesigner />
                    </RequireAdmin>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <RequireAdmin>
                      <Users />
                    </RequireAdmin>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
