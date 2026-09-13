const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const db = require('./database');
const { buildQuotationPdf, buildInvoicePdf, buildReportPdf } = require('./pdf-generator');

// Register the mrl-asset:// scheme BEFORE app is ready so it can serve local files
// (needed because http://localhost renderer can't load file:// images in dev)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mrl-asset',
    privileges: { secure: true, standard: true, bypassCSP: true, supportFetchAPI: true },
  },
]);

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f1f5f9',
    title: 'MRL GROUP OF COMPANIES',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// First-launch seed: if the user's AppData DB doesn't exist yet AND the installer
// bundled a seed file at resources/seed/mrl.sqlite, copy the seed in so the app
// opens with pre-populated data (employees, attendance, payroll, income, etc.)
// instead of empty tables. Safe to re-run: only copies when target is missing.
function seedDbIfMissing(userDataDir) {
  try {
    const targetDir = path.join(userDataDir, 'data');
    const targetDb = path.join(targetDir, 'mrl.sqlite');
    if (fs.existsSync(targetDb)) return; // user already has their own DB — never overwrite

    // In production the seed lives under process.resourcesPath/resources/seed/mrl.sqlite
    // In dev (electron .) it's under <projectRoot>/resources/seed/mrl.sqlite
    const candidates = [
      path.join(process.resourcesPath || '', 'resources', 'seed', 'mrl.sqlite'),
      path.join(__dirname, '..', 'resources', 'seed', 'mrl.sqlite'),
    ];
    const seed = candidates.find((p) => p && fs.existsSync(p));
    if (!seed) return;

    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(seed, targetDb);
    console.log(`[seed] copied bundled DB from ${seed} → ${targetDb}`);
  } catch (e) {
    console.warn('[seed] failed:', e.message);
  }
}

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData');
  seedDbIfMissing(userDataDir);
  db.init(userDataDir);

  // Serve user-uploaded assets (logo, watermark) via custom protocol
  protocol.handle('mrl-asset', async (request) => {
    try {
      const url = new URL(request.url);
      // pathname is /<base64-encoded-filepath>
      const b64 = url.pathname.replace(/^\//, '');
      const filePath = Buffer.from(b64, 'base64').toString('utf8');
      if (!fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      return new Response(`Bad request: ${e.message}`, { status: 400 });
    }
  });

  createWindow();

  // Auto-run weekly payroll on startup (only if today's or last week's Saturday
  // run is missing). Runs silently — no error surfaced to user.
  try {
    const r = db.runWeeklyPayrollIfDue();
    if (r.created) console.log(`[auto-payroll] generated ${r.period}`);
  } catch (e) { console.warn('[auto-payroll] failed:', e.message); }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// -------- IPC: Auth --------
ipcMain.handle('auth:login', (_e, { username, password }) => db.login(username, password));
ipcMain.handle('auth:changePassword', (_e, { username, oldPassword, newPassword }) =>
  db.changePassword(username, oldPassword, newPassword)
);

// -------- IPC: Settings --------
ipcMain.handle('settings:get', () => db.getSettings());
ipcMain.handle('settings:update', (_e, patch) => db.updateSettings(patch));

// -------- IPC: Products --------
ipcMain.handle('products:list', () => db.listProducts());
ipcMain.handle('products:create', (_e, p) => db.createProduct(p));
ipcMain.handle('products:update', (_e, p) => db.updateProduct(p));
ipcMain.handle('products:delete', (_e, id) => db.deleteProduct(id));

// -------- IPC: Customers --------
ipcMain.handle('customers:list', () => db.listCustomers());
ipcMain.handle('customers:create', (_e, c) => db.createCustomer(c));
ipcMain.handle('customers:update', (_e, c) => db.updateCustomer(c));
ipcMain.handle('customers:delete', (_e, id) => db.deleteCustomer(id));

// -------- IPC: Quotations --------
ipcMain.handle('quotations:list', () => db.listQuotations());
ipcMain.handle('quotations:get', (_e, id) => db.getQuotation(id));
ipcMain.handle('quotations:nextNumber', () => db.peekNextQuoteNumber());
ipcMain.handle('quotations:create', (_e, q) => db.createQuotation(q));
ipcMain.handle('quotations:update', (_e, q) => db.updateQuotation(q));
ipcMain.handle('quotations:delete', (_e, id) => db.deleteQuotation(id));
ipcMain.handle('quotations:updateStatus', (_e, { id, status }) => db.updateQuotationStatus(id, status));

// -------- IPC: Dashboard --------
ipcMain.handle('dashboard:stats', () => db.dashboardStats());
ipcMain.handle('dashboard:moneyForRange', (_e, { from, to } = {}) => db.dashboardMoneyForRange(from, to));

// -------- IPC: Latest-or-demo quotation for designer mock --------
ipcMain.handle('quotations:latestOrDemo', () => db.getLatestOrDemoQuotation());

// -------- IPC: PDF --------
function safeFilename(str) {
  return String(str || 'quotation').replace(/[\\/:*?"<>|]+/g, '-');
}

ipcMain.handle('pdf:export', async (_e, quotationId) => {
  const quotation = db.getQuotation(quotationId);
  if (!quotation) throw new Error('Quotation not found');
  const settings = db.getSettings();
  const buffer = await buildQuotationPdf(quotation, settings);

  const defaultName = `Quotation-${safeFilename(quotation.quote_number)}.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Quotation PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };

  fs.writeFileSync(filePath, buffer);
  shell.showItemInFolder(filePath);
  return { canceled: false, filePath };
});

ipcMain.handle('pdf:preview', async (_e, quotationId) => {
  const quotation = db.getQuotation(quotationId);
  if (!quotation) throw new Error('Quotation not found');
  const settings = db.getSettings();
  const buffer = await buildQuotationPdf(quotation, settings);
  return {
    quoteNumber: quotation.quote_number,
    base64: buffer.toString('base64'),
  };
});

ipcMain.handle('pdf:designerPreview', async (_e, patch) => {
  const quotation = db.getLatestOrDemoQuotation();
  const settings = { ...db.getSettings(), ...(patch || {}) };
  const buffer = await buildQuotationPdf(quotation, settings);
  return {
    quoteNumber: quotation.quote_number,
    base64: buffer.toString('base64'),
  };
});

// -------- IPC: File dialog for logo / watermark --------
async function pickImage(kind) {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: kind === 'logo' ? 'Select company logo' : 'Select watermark image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (canceled || filePaths.length === 0) return null;
  const src = filePaths[0];
  const ext = path.extname(src);
  const destDir = path.join(app.getPath('userData'), 'assets');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${kind}${ext}`);
  fs.copyFileSync(src, dest);
  return dest;
}

ipcMain.handle('dialog:pickLogo', () => pickImage('logo'));
ipcMain.handle('dialog:pickWatermark', () => pickImage('watermark'));

// -------- Receipt picker (returns absolute path saved into userData/assets) --------
ipcMain.handle('dialog:pickReceipt', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select receipt image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'pdf'] }],
  });
  if (canceled || filePaths.length === 0) return null;
  const src = filePaths[0];
  const ext = path.extname(src);
  const destDir = path.join(app.getPath('userData'), 'assets', 'receipts');
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `receipt-${Date.now()}${ext}`);
  fs.copyFileSync(src, dest);
  return dest;
});

// -------- IPC: Invoices + Payments --------
ipcMain.handle('invoices:list', () => db.listInvoices());
ipcMain.handle('invoices:get', (_e, id) => db.getInvoice(id));
ipcMain.handle('invoices:nextNumber', () => db.peekNextInvoiceNumber());
ipcMain.handle('invoices:create', (_e, inv) => db.createInvoice(inv));
ipcMain.handle('invoices:update', (_e, inv) => db.updateInvoice(inv));
ipcMain.handle('invoices:delete', (_e, id) => db.deleteInvoice(id));
ipcMain.handle('invoices:convertFromQuotation', (_e, { quotationId, extras }) =>
  db.convertQuotationToInvoice(quotationId, extras)
);
ipcMain.handle('invoices:receivables', () => db.receivablesReport());
ipcMain.handle('payments:add', (_e, p) => db.addPayment(p));
ipcMain.handle('payments:delete', (_e, id) => db.deletePayment(id));

ipcMain.handle('pdf:previewInvoice', async (_e, invoiceId) => {
  const inv = db.getInvoice(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const buffer = await buildInvoicePdf(inv, db.getSettings());
  return { quoteNumber: inv.invoice_number, base64: buffer.toString('base64') };
});
ipcMain.handle('pdf:exportInvoice', async (_e, invoiceId) => {
  const inv = db.getInvoice(invoiceId);
  if (!inv) throw new Error('Invoice not found');
  const buffer = await buildInvoicePdf(inv, db.getSettings());
  const defaultName = `Invoice-${safeFilename(inv.invoice_number)}.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Invoice PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  fs.writeFileSync(filePath, buffer);
  shell.showItemInFolder(filePath);
  return { canceled: false, filePath };
});

// -------- IPC: Vendors + Expenses --------
ipcMain.handle('vendors:list', () => db.listVendors());
ipcMain.handle('vendors:create', (_e, v) => db.createVendor(v));
ipcMain.handle('vendors:update', (_e, v) => db.updateVendor(v));
ipcMain.handle('vendors:delete', (_e, id) => db.deleteVendor(id));

ipcMain.handle('expenses:list', (_e, filters) => db.listExpenses(filters || {}));
ipcMain.handle('expenses:get', (_e, id) => db.getExpense(id));
ipcMain.handle('expenses:create', (_e, exp) => db.createExpense(exp));
ipcMain.handle('expenses:update', (_e, exp) => db.updateExpense(exp));
ipcMain.handle('expenses:delete', (_e, id) => db.deleteExpense(id));
ipcMain.handle('expenses:categories', () => db.expenseCategories());
ipcMain.handle('expenses:stats', (_e, filters) => db.expenseStats(filters || {}));
ipcMain.handle('expenses:recordPayment', (_e, { id, amount }) => db.recordExpensePayment(id, amount));

// -------- IPC: Reports --------
ipcMain.handle('reports:monthlyTrend', (_e, months) => db.monthlyTrend(Number(months) || 12));
ipcMain.handle('reports:dashboardTrend', (_e, { granularity, count } = {}) => db.dashboardTrend(granularity, count));
ipcMain.handle('reports:dashboardTrendForRange', (_e, { from, to } = {}) => db.dashboardTrendForRange(from, to));
ipcMain.handle('reports:profitLoss', (_e, filters) => db.profitLossReport(filters || {}));
ipcMain.handle('reports:cashflow', (_e, filters) => db.cashflowReport(filters || {}));
ipcMain.handle('reports:sales', (_e, filters) => db.salesReport(filters || {}));
ipcMain.handle('reports:gst', (_e, filters) => db.gstReport(filters || {}));
ipcMain.handle('reports:attendance', (_e, filters) => db.attendanceSummary(filters || {}));
ipcMain.handle('reports:payrollRegister', (_e, filters) => db.payrollRegister(filters || {}));
ipcMain.handle('reports:advancesOutstanding', () => db.advancesOutstanding());
ipcMain.handle('reports:customers', () => db.customerReport());
ipcMain.handle('reports:vendors', (_e, filters) => db.vendorReport(filters || {}));
ipcMain.handle('reports:credit', (_e, filters) => db.creditReport(filters || {}));

// Generic PDF export for reports
ipcMain.handle('reports:pdf', async (_e, payload) => {
  const buffer = await buildReportPdf(payload || {}, db.getSettings());
  return { base64: buffer.toString('base64'), title: payload?.title || 'Report' };
});
ipcMain.handle('reports:pipeline', () => db.pipelineStats());
ipcMain.handle('reports:pendingQuotations', (_e, limit) => db.listPendingQuotations(Number(limit) || 20));

// -------- IPC: Quotation status semantic actions --------
ipcMain.handle('quotations:markBilled', (_e, id) => db.markQuotationBilled(id));
ipcMain.handle('quotations:markLost', (_e, id) => db.markQuotationLost(id));
ipcMain.handle('quotations:markPending', (_e, id) => db.markQuotationPending(id));

// -------- IPC: Quotation payments (direct, no invoice) --------
ipcMain.handle('quotePayments:add', (_e, p) => db.addQuotePayment(p));
ipcMain.handle('quotePayments:delete', (_e, id) => db.deleteQuotePayment(id));
ipcMain.handle('quotePayments:list', (_e, quotationId) => db.listQuotePayments(quotationId));

// -------- IPC: Employee advances --------
ipcMain.handle('advances:list', (_e, filters) => db.listAdvances(filters || {}));
// -------- IPC: Incomes --------
ipcMain.handle('incomes:list', (_e, filters) => db.listIncomes(filters || {}));
ipcMain.handle('incomes:get', (_e, id) => db.getIncome(id));
ipcMain.handle('incomes:create', (_e, i) => db.createIncome(i));
ipcMain.handle('incomes:update', (_e, i) => db.updateIncome(i));
ipcMain.handle('incomes:recordPayment', (_e, { id, amount }) => db.recordIncomePayment(id, amount));
ipcMain.handle('incomes:delete', (_e, id) => db.deleteIncome(id));
ipcMain.handle('incomes:stats', (_e, filters) => db.incomeStats(filters || {}));

ipcMain.handle('advances:create', (_e, a) => db.createAdvance(a));
ipcMain.handle('advances:update', (_e, a) => db.updateAdvance(a));
ipcMain.handle('advances:delete', (_e, id) => db.deleteAdvance(id));
ipcMain.handle('advances:summary', (_e, empId) => db.employeeAdvanceSummary(empId));

// -------- IPC: Admin data actions --------
ipcMain.handle('admin:seedSampleData', () => db.seedSampleData());
ipcMain.handle('admin:wipeAllData', () => db.wipeAllData());

// -------- IPC: HR --------
ipcMain.handle('shifts:list', () => db.listShifts());
ipcMain.handle('shifts:create', (_e, s) => db.createShift(s));
ipcMain.handle('shifts:update', (_e, s) => db.updateShift(s));
ipcMain.handle('shifts:delete', (_e, id) => db.deleteShift(id));

ipcMain.handle('employees:list', () => db.listEmployees());
ipcMain.handle('employees:get', (_e, id) => db.getEmployee(id));
ipcMain.handle('employees:create', (_e, emp) => db.createEmployee(emp));
ipcMain.handle('employees:update', (_e, emp) => db.updateEmployee(emp));
ipcMain.handle('employees:delete', (_e, id) => db.deleteEmployee(id));

ipcMain.handle('attendance:list', (_e, filters) => db.listAttendance(filters || {}));
ipcMain.handle('attendance:upsert', (_e, a) => db.upsertAttendance(a));
ipcMain.handle('attendance:delete', (_e, id) => db.deleteAttendance(id));
ipcMain.handle('attendance:matrix', (_e, period) => db.attendanceMatrix(period));

ipcMain.handle('leaves:list', (_e, filters) => db.listLeaves(filters || {}));
ipcMain.handle('leaves:create', (_e, l) => db.createLeave(l));
ipcMain.handle('leaves:delete', (_e, id) => db.deleteLeave(id));

// -------- IPC: Payroll --------
ipcMain.handle('payroll:list', () => db.listPayrollRuns());
ipcMain.handle('payroll:get', (_e, id) => db.getPayrollRun(id));
ipcMain.handle('payroll:entriesForEmployee', (_e, employeeId) => db.listPayrollEntriesForEmployee(employeeId));
ipcMain.handle('payroll:runForEmployee', (_e, { employee_id, period_start, period_end, notes }) =>
  db.runPayrollForEmployee(employee_id, period_start, period_end, notes)
);
ipcMain.handle('payroll:preview', (_e, { employee_id, period, period_start, period_end }) => {
  if (period_start && period_end) return db.computePayroll(employee_id, period_start, period_end);
  return db.computePayroll(employee_id, period);
});
ipcMain.handle('payroll:run', (_e, { period, period_start, period_end, notes }) => {
  if (period_start && period_end) return db.runPayroll(period_start, period_end, notes);
  return db.runPayroll(period, notes);
});
ipcMain.handle('payroll:markPaid', (_e, { entry_id, paid_date }) => db.markPayrollEntryPaid(entry_id, paid_date));
ipcMain.handle('payroll:pay', (_e, { entry_id, amount, paid_date }) => db.payPayrollEntry(entry_id, amount, paid_date));
ipcMain.handle('payroll:setAdvanceDeduction', (_e, { entry_id, amount }) => db.setPayrollAdvanceDeduction(entry_id, amount));
ipcMain.handle('advances:deductions', (_e, filters) => db.listAdvanceDeductions(filters || {}));
ipcMain.handle('payroll:delete', (_e, id) => db.deletePayrollRun(id));
ipcMain.handle('payroll:autoRunIfDue', () => db.runWeeklyPayrollIfDue());
ipcMain.handle('payroll:recalculate', (_e, id) => db.recalculatePayrollRun(id));
