const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const SqliteStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');

const db = require('../electron/database');
const { buildQuotationPdf, buildInvoicePdf, buildReportPdf } = require('../electron/pdf-generator');

// ---------- Config ----------
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  (IS_PROD
    ? (() => {
        console.error('FATAL: SESSION_SECRET env var must be set in production');
        process.exit(1);
      })()
    : 'dev-only-insecure-session-secret-change-me');

fs.mkdirSync(DATA_DIR, { recursive: true });
db.init(DATA_DIR);

// ---------- Session store (SQLite-backed so restarts don't nuke sessions) ----------
const sessionDb = new Database(path.join(DATA_DIR, 'sessions.sqlite'));

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // required for secure cookies behind a reverse proxy

app.use(helmet({
  contentSecurityPolicy: false, // Vite/React inline assets; enable later with proper CSP
}));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(
  session({
    store: new SqliteStore({ client: sessionDb, expired: { clear: true, intervalMs: 900000 } }),
    name: 'mrl.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PROD, // requires HTTPS in prod
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ---------- Auth middleware ----------
const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not signed in' });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not signed in' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
};

// ---------- Rate limit: login endpoint ----------
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, try again in a minute' },
});

// ---------- Async wrapper ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Auth routes ----------
app.post('/api/auth/login', loginLimiter, wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const result = db.login(String(username).trim(), String(password));
  if (!result.ok) return res.status(401).json({ error: result.error || 'Invalid credentials' });
  req.session.user = result.user;
  res.json(result);
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('mrl.sid');
    res.json({ ok: true });
  });
}));

app.get('/api/auth/whoami', wrap(async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Not signed in' });
  // Always return the freshest allowed_pages / role for this user so an admin
  // change is picked up on the next request without needing a fresh login.
  const fresh = db.getUser(req.session.user.id);
  const user = fresh
    ? { ...req.session.user, role: fresh.role, allowed_pages: fresh.allowed_pages }
    : req.session.user;
  res.json({ user });
}));

app.post('/api/auth/change-password', requireAuth, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });
  if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const result = db.changePassword(req.session.user.username, oldPassword, newPassword);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
}));

// ---------- Admin: user management ----------
app.get('/api/admin/users', requireAdmin, wrap((req, res) => res.json(db.listUsers())));
app.post('/api/admin/users', requireAdmin, wrap((req, res) => {
  const r = db.createUser(req.body || {});
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.user);
}));
app.patch('/api/admin/users/:id', requireAdmin, wrap((req, res) => {
  const r = db.updateUser({ id: Number(req.params.id), ...(req.body || {}) });
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r.user);
}));
app.post('/api/admin/users/:id/reset-password', requireAdmin, wrap((req, res) => {
  const r = db.adminResetPassword(Number(req.params.id), req.body?.newPassword);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
}));
app.delete('/api/admin/users/:id', requireAdmin, wrap((req, res) => {
  const r = db.deleteUser(Number(req.params.id), req.session.user.id);
  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json(r);
}));

// ---------- Settings ----------
app.get('/api/settings', requireAuth, wrap((req, res) => res.json(db.getSettings())));
app.patch('/api/settings', requireAdmin, wrap((req, res) => res.json(db.updateSettings(req.body || {}))));

// ---------- Products ----------
app.get('/api/products', requireAuth, wrap((req, res) => res.json(db.listProducts())));
app.post('/api/products', requireAdmin, wrap((req, res) => res.json(db.createProduct(req.body || {}))));
app.patch('/api/products/:id', requireAdmin, wrap((req, res) =>
  res.json(db.updateProduct({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/products/:id', requireAdmin, wrap((req, res) =>
  res.json(db.deleteProduct(Number(req.params.id)))
));

// ---------- Customers ----------
app.get('/api/customers', requireAuth, wrap((req, res) => res.json(db.listCustomers())));
app.post('/api/customers', requireAuth, wrap((req, res) => res.json(db.createCustomer(req.body || {}))));
app.patch('/api/customers/:id', requireAuth, wrap((req, res) =>
  res.json(db.updateCustomer({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/customers/:id', requireAuth, wrap((req, res) =>
  res.json(db.deleteCustomer(Number(req.params.id)))
));

// ---------- Quotations ----------
app.get('/api/quotations', requireAuth, wrap((req, res) => res.json(db.listQuotations())));
app.get('/api/quotations/next-number', requireAuth, wrap((req, res) => res.json(db.peekNextQuoteNumber())));
app.get('/api/quotations/latest-or-demo', requireAuth, wrap((req, res) => res.json(db.getLatestOrDemoQuotation())));
app.get('/api/quotations/:id', requireAuth, wrap((req, res) => {
  const q = db.getQuotation(Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Not found' });
  res.json(q);
}));
app.post('/api/quotations', requireAuth, wrap((req, res) => res.json(db.createQuotation(req.body || {}))));
app.patch('/api/quotations/:id', requireAuth, wrap((req, res) =>
  res.json(db.updateQuotation({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/quotations/:id', requireAuth, wrap((req, res) =>
  res.json(db.deleteQuotation(Number(req.params.id)))
));
app.patch('/api/quotations/:id/status', requireAuth, wrap((req, res) =>
  res.json(db.updateQuotationStatus(Number(req.params.id), req.body?.status))
));

// ---------- Dashboard ----------
app.get('/api/dashboard/stats', requireAuth, wrap((req, res) => res.json(db.dashboardStats())));
app.get('/api/dashboard/money-for-range', requireAuth, wrap((req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;
  res.json(db.dashboardMoneyForRange(from, to));
}));

// ---------- PDF ----------
function safeFilename(str) {
  return String(str || 'quotation').replace(/[\\/:*?"<>|]+/g, '-');
}

app.get('/api/pdf/preview/:id', requireAuth, wrap(async (req, res) => {
  const q = db.getQuotation(Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Not found' });
  const buffer = await buildQuotationPdf(q, db.getSettings());
  res.json({ quoteNumber: q.quote_number, base64: buffer.toString('base64') });
}));

app.get('/api/pdf/export/:id', requireAuth, wrap(async (req, res) => {
  const q = db.getQuotation(Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Not found' });
  const buffer = await buildQuotationPdf(q, db.getSettings());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Quotation-${safeFilename(q.quote_number)}.pdf"`
  );
  res.send(buffer);
}));

app.post('/api/pdf/designer-preview', requireAdmin, wrap(async (req, res) => {
  const q = db.getLatestOrDemoQuotation();
  const settings = { ...db.getSettings(), ...(req.body || {}) };
  const buffer = await buildQuotationPdf(q, settings);
  res.json({ quoteNumber: q.quote_number, base64: buffer.toString('base64') });
}));

// ---------- Invoices + Payments ----------
app.get('/api/invoices', requireAuth, wrap((req, res) => res.json(db.listInvoices())));
app.get('/api/invoices/next-number', requireAuth, wrap((req, res) => res.json(db.peekNextInvoiceNumber())));
app.get('/api/invoices/receivables', requireAuth, wrap((req, res) => res.json(db.receivablesReport())));
app.get('/api/invoices/:id', requireAuth, wrap((req, res) => {
  const inv = db.getInvoice(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
}));
app.post('/api/invoices', requireAuth, wrap((req, res) => res.json(db.createInvoice(req.body || {}))));
app.patch('/api/invoices/:id', requireAuth, wrap((req, res) =>
  res.json(db.updateInvoice({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/invoices/:id', requireAuth, wrap((req, res) =>
  res.json(db.deleteInvoice(Number(req.params.id)))
));
app.post('/api/invoices/convert-from-quotation', requireAuth, wrap((req, res) => {
  const { quotationId, extras } = req.body || {};
  res.json(db.convertQuotationToInvoice(Number(quotationId), extras || {}));
}));

app.post('/api/payments', requireAuth, wrap((req, res) => res.json(db.addPayment(req.body || {}))));
app.delete('/api/payments/:id', requireAuth, wrap((req, res) =>
  res.json(db.deletePayment(Number(req.params.id)))
));

app.get('/api/pdf/preview-invoice/:id', requireAuth, wrap(async (req, res) => {
  const inv = db.getInvoice(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const buffer = await buildInvoicePdf(inv, db.getSettings());
  res.json({ quoteNumber: inv.invoice_number, base64: buffer.toString('base64') });
}));
app.get('/api/pdf/export-invoice/:id', requireAuth, wrap(async (req, res) => {
  const inv = db.getInvoice(Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Not found' });
  const buffer = await buildInvoicePdf(inv, db.getSettings());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Invoice-${safeFilename(inv.invoice_number)}.pdf"`
  );
  res.send(buffer);
}));

// ---------- Vendors + Expenses ----------
app.get('/api/vendors', requireAuth, wrap((req, res) => res.json(db.listVendors())));
app.post('/api/vendors', requireAuth, wrap((req, res) => res.json(db.createVendor(req.body || {}))));
app.patch('/api/vendors/:id', requireAuth, wrap((req, res) =>
  res.json(db.updateVendor({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/vendors/:id', requireAuth, wrap((req, res) =>
  res.json(db.deleteVendor(Number(req.params.id)))
));

// ---------- Incomes (free-form receipts) ----------
app.get('/api/incomes', requireAuth, wrap((req, res) => res.json(db.listIncomes(req.query || {}))));
app.get('/api/incomes/stats', requireAuth, wrap((req, res) => res.json(db.incomeStats(req.query || {}))));
app.get('/api/incomes/:id', requireAuth, wrap((req, res) => res.json(db.getIncome(Number(req.params.id)))));
app.post('/api/incomes', requireAuth, wrap((req, res) => res.json(db.createIncome(req.body || {}))));
app.put('/api/incomes/:id', requireAuth, wrap((req, res) => res.json(db.updateIncome({ ...req.body, id: Number(req.params.id) }))));
app.post('/api/incomes/:id/record-payment', requireAuth, wrap((req, res) => res.json(db.recordIncomePayment(Number(req.params.id), req.body?.amount))));
app.delete('/api/incomes/:id', requireAuth, wrap((req, res) => res.json(db.deleteIncome(Number(req.params.id)))));

app.get('/api/expenses', requireAuth, wrap((req, res) => res.json(db.listExpenses(req.query || {}))));
app.get('/api/expenses/categories', requireAuth, wrap((req, res) => res.json(db.expenseCategories())));
app.get('/api/expenses/stats', requireAuth, wrap((req, res) => res.json(db.expenseStats(req.query || {}))));
app.post('/api/expenses/:id/record-payment', requireAuth, wrap((req, res) => {
  res.json(db.recordExpensePayment(Number(req.params.id), Number(req.body?.amount) || 0));
}));
app.get('/api/expenses/:id', requireAuth, wrap((req, res) => {
  const e = db.getExpense(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json(e);
}));
app.post('/api/expenses', requireAuth, wrap((req, res) => res.json(db.createExpense(req.body || {}))));
app.patch('/api/expenses/:id', requireAuth, wrap((req, res) =>
  res.json(db.updateExpense({ ...(req.body || {}), id: Number(req.params.id) }))
));
app.delete('/api/expenses/:id', requireAuth, wrap((req, res) =>
  res.json(db.deleteExpense(Number(req.params.id)))
));

// ---------- Reports ----------
app.get('/api/reports/monthly-trend', requireAuth, wrap((req, res) => res.json(db.monthlyTrend(Number(req.query.months) || 12))));
app.get('/api/reports/dashboard-trend', requireAuth, wrap((req, res) =>
  res.json(db.dashboardTrend(req.query.granularity, Number(req.query.count)))
));
app.get('/api/reports/dashboard-trend-for-range', requireAuth, wrap((req, res) =>
  res.json(db.dashboardTrendForRange(req.query.from || null, req.query.to || null))
));
app.get('/api/reports/profit-loss', requireAuth, wrap((req, res) => res.json(db.profitLossReport(req.query || {}))));
app.get('/api/reports/cashflow', requireAuth, wrap((req, res) => res.json(db.cashflowReport(req.query || {}))));
app.get('/api/reports/sales', requireAuth, wrap((req, res) => res.json(db.salesReport(req.query || {}))));
app.get('/api/reports/gst', requireAuth, wrap((req, res) => res.json(db.gstReport(req.query || {}))));
app.get('/api/reports/attendance', requireAuth, wrap((req, res) => res.json(db.attendanceSummary(req.query || {}))));
app.get('/api/reports/payroll-register', requireAuth, wrap((req, res) => res.json(db.payrollRegister(req.query || {}))));
app.get('/api/reports/advances-outstanding', requireAuth, wrap((req, res) => res.json(db.advancesOutstanding())));
app.get('/api/reports/customers', requireAuth, wrap((req, res) => res.json(db.customerReport())));
app.get('/api/reports/vendors', requireAuth, wrap((req, res) => res.json(db.vendorReport(req.query || {}))));
app.get('/api/reports/credit', requireAuth, wrap((req, res) => res.json(db.creditReport(req.query || {}))));

app.post('/api/reports/pdf', requireAuth, wrap(async (req, res) => {
  const buffer = await buildReportPdf(req.body || {}, db.getSettings());
  res.json({ base64: buffer.toString('base64'), title: req.body?.title || 'Report' });
}));
app.get('/api/reports/pipeline', requireAuth, wrap((req, res) => res.json(db.pipelineStats())));
app.get('/api/reports/pending-quotations', requireAuth, wrap((req, res) =>
  res.json(db.listPendingQuotations(Number(req.query.limit) || 20))
));

// ---------- Quotation status semantic actions ----------
app.post('/api/quotations/:id/mark-billed', requireAuth, wrap((req, res) => res.json(db.markQuotationBilled(Number(req.params.id)))));
app.post('/api/quotations/:id/mark-lost', requireAuth, wrap((req, res) => res.json(db.markQuotationLost(Number(req.params.id)))));
app.post('/api/quotations/:id/mark-pending', requireAuth, wrap((req, res) => res.json(db.markQuotationPending(Number(req.params.id)))));

// ---------- Quotation direct payments ----------
app.post('/api/quote-payments', requireAuth, wrap((req, res) => res.json(db.addQuotePayment(req.body || {}))));
app.delete('/api/quote-payments/:id', requireAuth, wrap((req, res) => res.json(db.deleteQuotePayment(Number(req.params.id)))));

// ---------- Employee advances ----------
app.get('/api/advances', requireAuth, wrap((req, res) => res.json(db.listAdvances(req.query || {}))));
app.post('/api/advances', requireAdmin, wrap((req, res) => res.json(db.createAdvance(req.body || {}))));
app.patch('/api/advances/:id', requireAdmin, wrap((req, res) => res.json(db.updateAdvance({ ...req.body, id: Number(req.params.id) }))));
app.delete('/api/advances/:id', requireAdmin, wrap((req, res) => res.json(db.deleteAdvance(Number(req.params.id)))));
app.get('/api/advances/summary/:employee_id', requireAuth, wrap((req, res) => res.json(db.employeeAdvanceSummary(Number(req.params.employee_id)))));

// ---------- Admin data actions ----------
app.post('/api/admin/seed-sample-data', requireAdmin, wrap((req, res) => res.json(db.seedSampleData())));
app.post('/api/admin/wipe-all-data', requireAdmin, wrap((req, res) => res.json(db.wipeAllData())));

// ---------- HR: Shifts + Employees ----------
app.get('/api/shifts', requireAuth, wrap((req, res) => res.json(db.listShifts())));
app.post('/api/shifts', requireAdmin, wrap((req, res) => res.json(db.createShift(req.body || {}))));
app.patch('/api/shifts/:id', requireAdmin, wrap((req, res) => res.json(db.updateShift({ ...(req.body || {}), id: Number(req.params.id) }))));
app.delete('/api/shifts/:id', requireAdmin, wrap((req, res) => res.json(db.deleteShift(Number(req.params.id)))));

app.get('/api/employees', requireAuth, wrap((req, res) => res.json(db.listEmployees())));
app.get('/api/employees/:id', requireAuth, wrap((req, res) => {
  const e = db.getEmployee(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json(e);
}));
app.post('/api/employees', requireAdmin, wrap((req, res) => res.json(db.createEmployee(req.body || {}))));
app.patch('/api/employees/:id', requireAdmin, wrap((req, res) => res.json(db.updateEmployee({ ...(req.body || {}), id: Number(req.params.id) }))));
app.delete('/api/employees/:id', requireAdmin, wrap((req, res) => res.json(db.deleteEmployee(Number(req.params.id)))));

// ---------- HR: Attendance + Leaves ----------
app.get('/api/attendance', requireAuth, wrap((req, res) => res.json(db.listAttendance(req.query || {}))));
app.post('/api/attendance', requireAuth, wrap((req, res) => res.json(db.upsertAttendance(req.body || {}))));
app.delete('/api/attendance/:id', requireAuth, wrap((req, res) => res.json(db.deleteAttendance(Number(req.params.id)))));
app.get('/api/attendance/matrix', requireAuth, wrap((req, res) => res.json(db.attendanceMatrix(req.query.period))));

app.get('/api/leaves', requireAuth, wrap((req, res) => res.json(db.listLeaves(req.query || {}))));
app.post('/api/leaves', requireAuth, wrap((req, res) => res.json(db.createLeave(req.body || {}))));
app.delete('/api/leaves/:id', requireAuth, wrap((req, res) => res.json(db.deleteLeave(Number(req.params.id)))));

// ---------- Payroll ----------
app.get('/api/payroll/runs', requireAdmin, wrap((req, res) => res.json(db.listPayrollRuns())));
app.get('/api/payroll/entries/for-employee/:id', requireAdmin, wrap((req, res) => res.json(db.listPayrollEntriesForEmployee(Number(req.params.id)))));
app.post('/api/payroll/run-for-employee', requireAdmin, wrap((req, res) => {
  const { employee_id, period_start, period_end, notes } = req.body || {};
  res.json(db.runPayrollForEmployee(Number(employee_id), period_start, period_end, notes));
}));
app.get('/api/payroll/runs/:id', requireAdmin, wrap((req, res) => {
  const r = db.getPayrollRun(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
}));
app.get('/api/payroll/preview', requireAdmin, wrap((req, res) => {
  const { employee_id, period, period_start, period_end } = req.query;
  if (period_start && period_end) return res.json(db.computePayroll(Number(employee_id), period_start, period_end));
  res.json(db.computePayroll(Number(employee_id), period));
}));
app.post('/api/payroll/runs', requireAdmin, wrap((req, res) => {
  const { period, period_start, period_end, notes } = req.body || {};
  if (period_start && period_end) return res.json(db.runPayroll(period_start, period_end, notes));
  res.json(db.runPayroll(period, notes));
}));
app.post('/api/payroll/entries/:id/mark-paid', requireAdmin, wrap((req, res) => {
  res.json(db.markPayrollEntryPaid(Number(req.params.id), req.body?.paid_date));
}));
app.post('/api/payroll/entries/:id/pay', requireAdmin, wrap((req, res) => {
  res.json(db.payPayrollEntry(Number(req.params.id), req.body?.amount, req.body?.paid_date));
}));
app.post('/api/payroll/entries/:id/set-advance', requireAdmin, wrap((req, res) => {
  res.json(db.setPayrollAdvanceDeduction(Number(req.params.id), req.body?.amount));
}));
app.get('/api/advances/deductions', requireAuth, wrap((req, res) => {
  res.json(db.listAdvanceDeductions(req.query || {}));
}));
app.delete('/api/payroll/runs/:id', requireAdmin, wrap((req, res) => res.json(db.deletePayrollRun(Number(req.params.id)))));
app.post('/api/payroll/auto-run', requireAdmin, wrap((req, res) => res.json(db.runWeeklyPayrollIfDue())));
app.post('/api/payroll/runs/:id/recalculate', requireAdmin, wrap((req, res) => res.json(db.recalculatePayrollRun(Number(req.params.id)))));

// ---------- Uploads (logo, watermark) ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const kind = req.params.kind;
      if (kind === 'receipt') {
        const dir = path.join(db.getAssetsDir(), 'receipts');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } else {
        cb(null, db.getAssetsDir());
      }
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const kind = req.params.kind;
      if (kind === 'receipt') cb(null, `receipt-${Date.now()}${ext}`);
      else cb(null, `${kind === 'watermark' ? 'watermark' : 'logo'}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/image\/(png|jpe?g)|application\/pdf/.test(file.mimetype))
      return cb(new Error('Only PNG/JPG/PDF files'));
    cb(null, true);
  },
});

app.post('/api/upload/:kind', requireAuth, upload.single('file'), wrap((req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const kind = req.params.kind;
  if (kind === 'logo' || kind === 'watermark') {
    // Only admin can change branding assets
    if (req.session.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const key = kind === 'watermark' ? 'watermark_path' : 'logo_path';
    db.updateSettings({ [key]: req.file.path });
  }
  res.json({ path: req.file.path });
}));

// ---------- Asset serving (replaces mrl-asset:// in web mode) ----------
app.get('/api/asset/:b64', requireAuth, wrap((req, res) => {
  let filePath;
  try {
    filePath = Buffer.from(req.params.b64, 'base64').toString('utf8');
  } catch (_e) {
    return res.status(400).json({ error: 'Bad path' });
  }
  const assetsDir = path.resolve(db.getAssetsDir());
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(assetsDir)) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(resolved);
}));

// ---------- Static frontend (built by Vite into dist/) ----------
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — everything not under /api that isn't a real file serves index.html
  // (Express 5's path-to-regexp no longer accepts a bare '*' route, so use middleware.)
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ---------- Errors ----------
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MRL GROUP OF COMPANIES server listening on http://0.0.0.0:${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  if (!IS_PROD) console.log('NODE_ENV != production — cookies are NOT secure (dev mode)');
  // Auto-run weekly payroll on startup (idempotent — only creates if missing).
  try {
    const r = db.runWeeklyPayrollIfDue();
    if (r.created) console.log(`[auto-payroll] generated ${r.period}`);
  } catch (e) { console.warn('[auto-payroll] failed:', e.message); }
});
