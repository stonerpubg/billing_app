const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
// SWAPPED: better-sqlite3 replaced with sync-wrapped libsql client (see electron/db.js).
// This gives us: local SQLite for dev, embedded replica synced with Turso for prod.
// All existing prepare().get()/.all()/.run() and db.transaction() calls work unchanged.
const dbDriver = require('./db');

let db;
let userDataDir = null;

function dbPath() {
  const dir = path.join(userDataDir, 'data');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'mrl.sqlite');
}

function getUserDataDir() {
  return userDataDir;
}

function getAssetsDir() {
  const dir = path.join(userDataDir, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, useSalt, 64).toString('hex');
  return { hash, salt: useSalt };
}

function verifyPassword(password, hash, salt) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

function init(dataDir) {
  // dataDir is required — Electron passes app.getPath('userData'), server passes its data dir
  if (!dataDir) throw new Error('database.init(dataDir): dataDir is required');
  userDataDir = dataDir;
  db = dbDriver.open(dataDir);
  // pragma calls are no-ops on libsql (it manages WAL / foreign_keys internally)
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ---- Lightweight column-add helper for schema migrations on existing DBs ----
  const ensureColumn = (table, column, def) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
  };

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      hsn_code TEXT,
      unit TEXT DEFAULT 'Nos',
      rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 18,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      pincode TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_snapshot TEXT,
      quote_date TEXT NOT NULL,
      valid_until TEXT,
      subject TEXT,
      notes TEXT,
      terms TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      gst_total REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      hsn_code TEXT,
      unit TEXT,
      size TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gstin TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      vendor_id INTEGER,
      vendor_name TEXT,
      description TEXT,
      payment_mode TEXT,
      reference TEXT,
      receipt_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      quotation_id INTEGER,
      customer_id INTEGER,
      customer_snapshot TEXT,
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      subject TEXT,
      notes TEXT,
      terms TEXT,
      gst_mode TEXT NOT NULL DEFAULT 'per_line',
      flat_gst_rate REAL NOT NULL DEFAULT 18,
      subtotal REAL NOT NULL DEFAULT 0,
      gst_total REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      paid_total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      hsn_code TEXT,
      unit TEXT,
      size TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      rate REAL NOT NULL DEFAULT 0,
      gst_rate REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      gst_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      mode TEXT,
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      hours_per_day REAL NOT NULL DEFAULT 8,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      role TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      joining_date TEXT,
      shift_id INTEGER,
      basic_salary REAL NOT NULL DEFAULT 0,
      hra REAL NOT NULL DEFAULT 0,
      allowances REAL NOT NULL DEFAULT 0,
      per_day_rate REAL NOT NULL DEFAULT 0,
      bank_account TEXT,
      bank_ifsc TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      att_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Present',  -- Present | Absent | Half | Leave
      hours REAL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(employee_id, att_date),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      days REAL NOT NULL DEFAULT 1,
      leave_type TEXT NOT NULL DEFAULT 'Casual',
      status TEXT NOT NULL DEFAULT 'Approved',
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,  -- 'YYYY-MM'
      run_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(period)
    );

    CREATE TABLE IF NOT EXISTS payroll_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      days_present REAL NOT NULL DEFAULT 0,
      days_leave REAL NOT NULL DEFAULT 0,
      days_absent REAL NOT NULL DEFAULT 0,
      working_days REAL NOT NULL DEFAULT 0,
      basic REAL NOT NULL DEFAULT 0,
      hra REAL NOT NULL DEFAULT 0,
      allowances REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      advance_deduction REAL NOT NULL DEFAULT 0,
      gross REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      paid INTEGER NOT NULL DEFAULT 0,
      paid_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS advances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      advance_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      mode TEXT,
      reference TEXT,
      notes TEXT,
      adjusted_in_run_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
      FOREIGN KEY (adjusted_in_run_id) REFERENCES payroll_runs(id) ON DELETE SET NULL
    );
  `);
  // Migration for existing payroll_entries missing advance_deduction column
  ensureColumn('payroll_entries', 'advance_deduction', 'REAL NOT NULL DEFAULT 0');
  // Fine-grained page permissions for non-admin users. Stored as a JSON array
  // of page keys (e.g. ["dashboard","quotations"]). Admins ignore this and see
  // everything. Empty / null on a non-admin means "no access to anything".
  ensureColumn('users', 'allowed_pages', "TEXT NOT NULL DEFAULT ''");

  // Vendor payments — every settlement against a vendor's outstanding
  // expenses is its own dated row (mirrors the advance_deductions pattern for
  // employees). A payment is FIFO-applied to that vendor's oldest unpaid
  // expenses, so expenses.paid_amount stays in sync.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      mode TEXT,
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor ON vendor_payments(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_vendor_payments_date ON vendor_payments(payment_date);
  `);
  // Track which vendor payments settled which expenses, so deleting a payment
  // can restore each expense's paid_amount correctly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vendor_payment_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_payment_id INTEGER NOT NULL,
      expense_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_payment_id) REFERENCES vendor_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_vpa_payment ON vendor_payment_allocations(vendor_payment_id);
    CREATE INDEX IF NOT EXISTS idx_vpa_expense ON vendor_payment_allocations(expense_id);
  `);
  ensureColumn('expenses', 'deduct_from_income', 'INTEGER NOT NULL DEFAULT 1');
  // Vendor credit / partial-payment tracking on expenses.
  // paid_amount = how much cash has actually left the bank for this purchase.
  //   paid_amount == amount   → fully paid
  //   paid_amount == 0        → credit (nothing paid yet)
  //   0 < paid < amount       → partial
  // P&L / cashflow uses paid_amount (only cash-out counts). "amount - paid_amount"
  // is what you still owe the vendor.
  ensureColumn('expenses', 'paid_amount', 'REAL NOT NULL DEFAULT 0');
  // Back-fill: pre-existing rows are treated as fully paid.
  try {
    db.prepare('UPDATE expenses SET paid_amount = amount WHERE paid_amount = 0 AND amount > 0').run();
  } catch (_e) { /* idempotent */ }
  // Shift-based attendance + pay
  ensureColumn('attendance', 'shifts_worked', 'REAL NOT NULL DEFAULT 0');
  // JSON array of shift ids the employee actually worked that day. Only used
  // for restoring the picker checkboxes on edit — payroll math still uses shifts_worked count.
  ensureColumn('attendance', 'shift_ids', "TEXT NOT NULL DEFAULT '[]'");
  // One-time back-fill: legacy attendance stored only status (Present/Half) with shifts_worked=0.
  // Payroll now needs shift counts; derive a sensible default (Present=2 shifts, Half=1 shift).
  try {
    db.prepare("UPDATE attendance SET shifts_worked = 2 WHERE status = 'Present' AND shifts_worked = 0").run();
    db.prepare("UPDATE attendance SET shifts_worked = 1 WHERE status = 'Half' AND shifts_worked = 0").run();
  } catch (_e) { /* migrations are idempotent */ }
  ensureColumn('employees', 'pay_mode', "TEXT NOT NULL DEFAULT 'monthly'");
  ensureColumn('employees', 'weekly_salary', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('employees', 'per_shift_rate', 'REAL NOT NULL DEFAULT 0');
  // Payroll runs get a date range (period stays for backward compat with month runs)
  ensureColumn('payroll_runs', 'period_start', 'TEXT');
  ensureColumn('payroll_runs', 'period_end', 'TEXT');
  ensureColumn('payroll_entries', 'shifts_worked', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('payroll_entries', 'pay_mode', "TEXT NOT NULL DEFAULT 'monthly'");
  ensureColumn('payroll_entries', 'per_shift_rate', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('payroll_entries', 'weekly_salary', 'REAL NOT NULL DEFAULT 0');
  // Partial-payment support. Track how much has been paid so far; paid=1 flips only
  // when paid_amount >= net_pay. Existing paid entries are backfilled to paid_amount = net_pay.
  ensureColumn('payroll_entries', 'paid_amount', 'REAL NOT NULL DEFAULT 0');
  try {
    db.prepare('UPDATE payroll_entries SET paid_amount = net_pay WHERE paid = 1 AND paid_amount = 0').run();
  } catch (_e) { /* idempotent */ }
  // Income partial-receipt tracking. `amount` = total the customer owes for this receipt,
  // `received_amount` = actually collected so far. Balance = amount - received_amount.
  // Only received_amount contributes to Dashboard / P&L "Income" totals.
  ensureColumn('incomes', 'received_amount', 'REAL NOT NULL DEFAULT 0');
  try {
    db.prepare('UPDATE incomes SET received_amount = amount WHERE received_amount = 0 AND amount > 0').run();
  } catch (_e) { /* idempotent */ }

  // ---- Migrations for existing DBs (safe if columns already exist) ----
  ensureColumn('quotation_items', 'size', 'TEXT');
  ensureColumn('quotations', 'gst_mode', "TEXT NOT NULL DEFAULT 'per_line'");
  ensureColumn('quotations', 'flat_gst_rate', 'REAL NOT NULL DEFAULT 18');
  ensureColumn('quotations', 'paid_total', 'REAL NOT NULL DEFAULT 0');
  // Per-item weight + pricing mode. price_by='qty' → amount = size × qty × rate (existing behaviour).
  // price_by='weight' → amount = weight × rate (materials sold per kg / per ton). Weight is
  // free-text so users can note '317.6 kg' or plain '317.6'.
  ensureColumn('quotation_items', 'weight', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('quotation_items', 'price_by', "TEXT NOT NULL DEFAULT 'size'");
  ensureColumn('invoice_items', 'weight', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('invoice_items', 'price_by', "TEXT NOT NULL DEFAULT 'size'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS quote_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id INTEGER NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      mode TEXT,
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expense_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      size TEXT,
      weight TEXT,
      unit TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      rate REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    -- Free-form income entries — money received WITHOUT going through a quotation/invoice.
    -- E.g. one-off cash jobs, direct customer payments, bank credits. Contributes to
    -- dashboard "Income" totals alongside payments + quote_payments.
    CREATE TABLE IF NOT EXISTS incomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      income_date TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      amount REAL NOT NULL DEFAULT 0,
      mode TEXT DEFAULT 'Cash',
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- Tracks each partial deduction of an advance against a payroll run.
    -- outstanding_of_advance = advance.amount - SUM(advance_deductions.amount WHERE advance_id = ?)
    -- Deleting a run cascades — those deductions vanish and the outstanding balance auto-restores.
    CREATE TABLE IF NOT EXISTS advance_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      advance_id INTEGER NOT NULL,
      run_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (advance_id) REFERENCES advances(id) ON DELETE CASCADE,
      FOREIGN KEY (run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_advdec_advance ON advance_deductions(advance_id);
    CREATE INDEX IF NOT EXISTS idx_advdec_run ON advance_deductions(run_id);
    CREATE INDEX IF NOT EXISTS idx_advdec_emp_run ON advance_deductions(employee_id, run_id);
  `);

  // One-time backfill: existing advances with adjusted_in_run_id NOT NULL represent
  // fully-deducted rows under the old binary model. Insert an advance_deductions row
  // for each so outstanding queries return 0 for them (matching old behaviour).
  try {
    const legacyAdvances = db.prepare(
      `SELECT a.id, a.employee_id, a.amount, a.adjusted_in_run_id
         FROM advances a
        WHERE a.adjusted_in_run_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM advance_deductions d WHERE d.advance_id = a.id)`
    ).all();
    const backfill = db.prepare(
      `INSERT INTO advance_deductions (advance_id, run_id, employee_id, amount)
         VALUES (?, ?, ?, ?)`
    );
    for (const a of legacyAdvances) backfill.run(a.id, a.adjusted_in_run_id, a.employee_id, a.amount);
  } catch (_e) { /* migrations are idempotent */ }

  seedDefaults();
}

function seedDefaults() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const admin = hashPassword('admin123');
    db.prepare(
      'INSERT INTO users (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)'
    ).run('admin', admin.hash, admin.salt, 'admin');

    const user = hashPassword('user123');
    db.prepare(
      'INSERT INTO users (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)'
    ).run('user', user.hash, user.salt, 'user');
  }

  // Fast path: once the settings block is seeded we can skip 100+ INSERT OR
  // IGNORE round-trips on every boot. On Turso this cuts startup from ~60 s
  // to ~1 s. Threshold is set well below the seeded-default count.
  const settingsCount = db.prepare('SELECT COUNT(*) AS c FROM settings').get().c;
  if (settingsCount > 50) return;

  const seedSetting = (key, value) => {
    db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  };

  seedSetting('company_name', 'MRL Fabrications');
  seedSetting('company_tagline', 'Plumbing • Roofing • Electrical • Fabrication');
  seedSetting('company_address', 'Address line 1, Address line 2');
  seedSetting('company_city', 'City');
  seedSetting('company_state', 'State');
  seedSetting('company_pincode', '000000');
  seedSetting('company_phone', '+91 00000 00000');
  seedSetting('company_email', 'contact@mrlfabrications.com');
  seedSetting('company_gstin', '');
  seedSetting('company_pan', '');
  seedSetting('company_website', '');
  seedSetting('bank_name', '');
  seedSetting('bank_account', '');
  seedSetting('bank_ifsc', '');
  seedSetting('bank_branch', '');
  seedSetting('logo_path', '');
  seedSetting('watermark_path', '');
  seedSetting('quote_prefix', 'MRL/Q/');
  seedSetting('quote_number_padding', '4');
  seedSetting('quote_next_number', '1');
  seedSetting('invoice_prefix', 'MRL/INV/');
  seedSetting('invoice_number_padding', '4');
  seedSetting('invoice_next_number', '1');
  // PDF design tokens
  seedSetting('pdf_brand_color', '#2b48d0');
  seedSetting('pdf_brand_dark_color', '#1a2766');
  seedSetting('pdf_text_color', '#0f172a');
  seedSetting('pdf_muted_color', '#64748b');
  seedSetting('pdf_font_base_size', '9.5');
  seedSetting('pdf_font_heading_size', '16');
  seedSetting('pdf_font_title_size', '12');
  seedSetting('pdf_logo_size', '60');
  seedSetting('pdf_logo_x_offset', '0');
  seedSetting('pdf_logo_y_offset', '0');
  seedSetting('pdf_quote_title', 'QUOTATION');
  seedSetting('pdf_invoice_title', 'TAX INVOICE');
  seedSetting('pdf_show_watermark', 'true');
  seedSetting('pdf_watermark_size', '420');
  seedSetting('pdf_watermark_opacity', '0.14');
  seedSetting('pdf_watermark_x_offset', '0');
  seedSetting('pdf_watermark_y_offset', '0');
  seedSetting('pdf_show_bank', 'true');
  seedSetting('pdf_show_signature', 'true');
  seedSetting('pdf_show_terms', 'true');
  seedSetting('pdf_show_notes', 'true');
  seedSetting('pdf_show_amount_in_words', 'true');
  seedSetting('pdf_show_hsn_column', 'true');
  seedSetting('pdf_show_unit_column', 'true');
  seedSetting('pdf_show_taxable_column', 'true');
  seedSetting('pdf_show_cgst_column', 'true');
  seedSetting('pdf_show_sgst_column', 'true');
  seedSetting('pdf_grand_total_solid_bg', 'true');
  seedSetting('pdf_grand_total_font_size', '11');

  // Per-block font sizes (Word-style: each section has its own size)
  seedSetting('pdf_font_company_lines_size', '9');
  seedSetting('pdf_font_billTo_size', '9.5');
  seedSetting('pdf_font_items_size', '8.5');
  seedSetting('pdf_font_amountInWords_size', '10');
  seedSetting('pdf_font_terms_size', '8.5');
  seedSetting('pdf_font_notes_size', '8.5');
  seedSetting('pdf_font_bank_size', '9');
  seedSetting('pdf_font_signature_size', '9');
  seedSetting('pdf_font_footer_size', '8');

  // Custom user-added text elements — free-form positioned text
  seedSetting('pdf_custom_elements', '[]');

  // Per-field show/hide toggles
  seedSetting('pdf_show_company_name', 'true');
  seedSetting('pdf_show_company_tagline', 'true');
  seedSetting('pdf_show_company_address', 'true');
  seedSetting('pdf_show_company_location', 'true');
  seedSetting('pdf_show_company_contact', 'true');
  seedSetting('pdf_show_quote_no', 'true');
  seedSetting('pdf_show_quote_date', 'true');
  seedSetting('pdf_show_bill_name', 'true');
  seedSetting('pdf_show_bill_attn', 'true');
  seedSetting('pdf_show_bill_address', 'true');
  seedSetting('pdf_show_bill_location', 'true');
  seedSetting('pdf_show_bill_phone', 'true');
  seedSetting('pdf_show_bill_email', 'true');
  seedSetting('pdf_show_bill_gstin', 'true');
  seedSetting('pdf_show_bill_subject', 'true');
  seedSetting('pdf_show_footer_name', 'true');
  seedSetting('pdf_show_footer_gstin', 'true');
  seedSetting('pdf_show_footer_pan', 'true');
  seedSetting('pdf_show_footer_phone', 'true');
  seedSetting('pdf_show_footer_email', 'true');
  seedSetting('pdf_show_footer_page', 'true');

  // Alignment per block (left / center / right)
  seedSetting('pdf_align_header', 'center');
  seedSetting('pdf_align_billTo', 'left');
  seedSetting('pdf_align_terms', 'left');
  seedSetting('pdf_align_notes', 'left');
  seedSetting('pdf_align_signature', 'center');

  // Position offsets per block (X/Y in pt, default 0)
  const posKeys = ['header', 'title', 'billTo', 'items', 'amountInWords', 'terms', 'notes', 'bank', 'signature', 'footer'];
  for (const k of posKeys) {
    seedSetting(`pdf_pos_${k}_x`, '0');
    seedSetting(`pdf_pos_${k}_y`, '0');
  }

  seedSetting('default_terms',
    '1. This quotation is valid for 15 days.\n' +
    '2. 50% advance along with confirmation of order, balance before dispatch/completion.\n' +
    '3. Prices are exclusive of any transportation or unloading charges unless mentioned.\n' +
    '4. Any additional work beyond scope will be charged separately.'
  );
}

// -------- Auth --------
// A password is "default" if it still matches the seed value
const DEFAULT_PASSWORDS = { admin: 'admin123', user: 'user123' };

function login(username, password) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return { ok: false, error: 'Invalid credentials' };
  const ok = verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) return { ok: false, error: 'Invalid credentials' };
  const usingDefault = DEFAULT_PASSWORDS[username] === password;
  let allowedPages = [];
  if (row.allowed_pages) {
    try { allowedPages = JSON.parse(row.allowed_pages); } catch (_e) { allowedPages = []; }
  }
  return {
    ok: true,
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      allowed_pages: allowedPages,
      mustChangePassword: usingDefault,
    },
  };
}

function changePassword(username, oldPassword, newPassword) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return { ok: false, error: 'User not found' };
  const ok = verifyPassword(oldPassword, row.password_hash, row.password_salt);
  if (!ok) return { ok: false, error: 'Current password is incorrect' };
  const next = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(
    next.hash,
    next.salt,
    row.id
  );
  return { ok: true };
}

// -------- User management (admin-only) --------
function _userToJson(row) {
  let allowedPages = [];
  if (row.allowed_pages) {
    try { allowedPages = JSON.parse(row.allowed_pages); } catch (_e) { allowedPages = []; }
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    allowed_pages: allowedPages,
    created_at: row.created_at,
  };
}
function listUsers() {
  return db.prepare('SELECT id, username, role, allowed_pages, created_at FROM users ORDER BY id').all().map(_userToJson);
}
function getUser(id) {
  const row = db.prepare('SELECT id, username, role, allowed_pages, created_at FROM users WHERE id = ?').get(id);
  return row ? _userToJson(row) : null;
}
function _normalizePages(allowed_pages) {
  if (!allowed_pages) return '';
  if (typeof allowed_pages === 'string') {
    try { const arr = JSON.parse(allowed_pages); return JSON.stringify(Array.isArray(arr) ? arr : []); }
    catch (_e) { return ''; }
  }
  return JSON.stringify(Array.isArray(allowed_pages) ? allowed_pages : []);
}
function createUser({ username, password, role, allowed_pages }) {
  const uname = String(username || '').trim();
  if (!uname) return { ok: false, error: 'Username is required' };
  if (!password || String(password).length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
  const nRole = role === 'admin' ? 'admin' : 'user';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
  if (existing) return { ok: false, error: 'Username already exists' };
  const h = hashPassword(String(password));
  const info = db.prepare(
    'INSERT INTO users (username, password_hash, password_salt, role, allowed_pages) VALUES (?, ?, ?, ?, ?)'
  ).run(uname, h.hash, h.salt, nRole, _normalizePages(allowed_pages));
  return { ok: true, user: getUser(info.lastInsertRowid) };
}
function updateUser({ id, role, allowed_pages }) {
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'User not found' };
  const nRole = role === 'admin' ? 'admin' : (role === 'user' ? 'user' : row.role);
  // Prevent demoting the last admin — the app becomes unmanageable otherwise.
  if (row.role === 'admin' && nRole !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
    if (admins <= 1) return { ok: false, error: 'Cannot demote the last admin' };
  }
  db.prepare('UPDATE users SET role = ?, allowed_pages = ? WHERE id = ?').run(nRole, _normalizePages(allowed_pages), id);
  return { ok: true, user: getUser(id) };
}
function adminResetPassword(id, newPassword) {
  if (!newPassword || String(newPassword).length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'User not found' };
  const h = hashPassword(String(newPassword));
  db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').run(h.hash, h.salt, id);
  return { ok: true };
}
function deleteUser(id, currentUserId) {
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'User not found' };
  if (currentUserId && Number(currentUserId) === Number(id)) {
    return { ok: false, error: 'You cannot delete your own account' };
  }
  if (row.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get().c;
    if (admins <= 1) return { ok: false, error: 'Cannot delete the last admin' };
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { ok: true };
}

// -------- Settings --------
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function updateSettings(patch) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [key, value] of entries) stmt.run(key, value == null ? '' : String(value));
  });
  tx(Object.entries(patch));
  return getSettings();
}

// -------- Products --------
function listProducts() {
  return db.prepare('SELECT * FROM products ORDER BY name ASC').all();
}
function createProduct(p) {
  const info = db
    .prepare(
      `INSERT INTO products (name, description, category, hsn_code, unit, rate, gst_rate, is_active)
       VALUES (@name, @description, @category, @hsn_code, @unit, @rate, @gst_rate, @is_active)`
    )
    .run({
      name: p.name,
      description: p.description || '',
      category: p.category || '',
      hsn_code: p.hsn_code || '',
      unit: p.unit || 'Nos',
      rate: Number(p.rate) || 0,
      gst_rate: Number(p.gst_rate) || 0,
      is_active: p.is_active === 0 ? 0 : 1,
    });
  return db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
}
function updateProduct(p) {
  db.prepare(
    `UPDATE products SET name=@name, description=@description, category=@category,
       hsn_code=@hsn_code, unit=@unit, rate=@rate, gst_rate=@gst_rate, is_active=@is_active WHERE id=@id`
  ).run({
    id: p.id,
    name: p.name,
    description: p.description || '',
    category: p.category || '',
    hsn_code: p.hsn_code || '',
    unit: p.unit || 'Nos',
    rate: Number(p.rate) || 0,
    gst_rate: Number(p.gst_rate) || 0,
    is_active: p.is_active === 0 ? 0 : 1,
  });
  return db.prepare('SELECT * FROM products WHERE id = ?').get(p.id);
}
function deleteProduct(id) {
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return { ok: true };
}

// -------- Customers --------
function listCustomers() {
  return db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
}
function createCustomer(c) {
  const info = db
    .prepare(
      `INSERT INTO customers (name, contact_person, phone, email, gstin, address, city, state, pincode)
       VALUES (@name, @contact_person, @phone, @email, @gstin, @address, @city, @state, @pincode)`
    )
    .run({
      name: c.name,
      contact_person: c.contact_person || '',
      phone: c.phone || '',
      email: c.email || '',
      gstin: c.gstin || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      pincode: c.pincode || '',
    });
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
}
function updateCustomer(c) {
  db.prepare(
    `UPDATE customers SET name=@name, contact_person=@contact_person, phone=@phone, email=@email,
     gstin=@gstin, address=@address, city=@city, state=@state, pincode=@pincode WHERE id=@id`
  ).run({
    id: c.id,
    name: c.name,
    contact_person: c.contact_person || '',
    phone: c.phone || '',
    email: c.email || '',
    gstin: c.gstin || '',
    address: c.address || '',
    city: c.city || '',
    state: c.state || '',
    pincode: c.pincode || '',
  });
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id);
}
function deleteCustomer(id) {
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  return { ok: true };
}

// -------- Quotations --------
function formatQuoteNumber(n) {
  const prefix = getSettings().quote_prefix || 'MRL/Q/';
  const pad = Number(getSettings().quote_number_padding || 4);
  return `${prefix}${String(n).padStart(pad, '0')}`;
}

function peekNextQuoteNumber() {
  const settings = getSettings();
  const n = Number(settings.quote_next_number || 1);
  return { number: formatQuoteNumber(n), rawNumber: n };
}

function bumpQuoteNumber() {
  const cur = Number(getSettings().quote_next_number || 1);
  const nextVal = cur + 1;
  db.prepare(
    "UPDATE settings SET value = ? WHERE key = 'quote_next_number'"
  ).run(String(nextVal));
  return cur;
}

// Parse an optional "size" cell:
//   "4x4"                    → 16     (area  = L × B)
//   "4x4x4"                  → 64     (vol   = L × B × H)
//   "17.25x4.5+12.5x4.55"    → 134.5  (multi-face shape: sum of areas)
//   "16"                     → 16     (scalar)
//   blank                    → 1      (no multiplier)
// Separators: x/X/*/× within a group; + between groups (sums them).
function parseSize(size) {
  if (size == null || size === '') return 1;
  const s = String(size).trim().toLowerCase();
  const groups = s.split('+').map((g) => g.trim()).filter(Boolean);
  let sum = 0;
  let anyGroupParsed = false;
  for (const g of groups) {
    const parts = g.split(/\s*[x*×]\s*/).filter(Boolean);
    if (parts.length >= 1 && parts.every((p) => /^\d+(?:\.\d+)?$/.test(p))) {
      sum += parts.reduce((prod, p) => prod * Number(p), 1);
      anyGroupParsed = true;
    }
  }
  if (anyGroupParsed) return sum;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// Extract the leading numeric value from a weight cell so users can write "317.6 kg" or plain "317.6".
function parseWeight(weight) {
  if (weight == null || weight === '') return 0;
  const m = String(weight).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function computeTotals(items, gstMode = 'per_line', flatGstRate = 18) {
  let subtotal = 0;
  let gstTotal = 0;
  const enriched = items.map((it, idx) => {
    const quantity = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    const gstRate = Number(it.gst_rate) || 0;
    const sizeMult = parseSize(it.size);
    const weightNum = parseWeight(it.weight);
    const priceBy = it.price_by === 'weight' ? 'weight' : 'size';
    // price_by='weight' → amount = weight × qty × rate (per-unit weight × pieces × ₹/kg)
    // price_by='size'   → amount = size × qty × rate
    const amount = priceBy === 'weight' && weightNum > 0
      ? +(weightNum * quantity * rate).toFixed(2)
      : +(sizeMult * quantity * rate).toFixed(2);
    // In flat mode the per-line GST amount is zero (the total is computed on subtotal below).
    // We keep the item's own gst_rate stored for display continuity.
    const gstAmount =
      gstMode === 'flat_on_total' ? 0 : +((amount * gstRate) / 100).toFixed(2);
    const total = +(amount + gstAmount).toFixed(2);
    subtotal += amount;
    gstTotal += gstAmount;
    return {
      ...it,
      size: it.size || '',
      weight: it.weight || '',
      price_by: priceBy,
      quantity,
      rate,
      gst_rate: gstRate,
      amount,
      gst_amount: gstAmount,
      total,
      sort_order: idx,
    };
  });

  if (gstMode === 'flat_on_total') {
    gstTotal = +((subtotal * (Number(flatGstRate) || 0)) / 100).toFixed(2);
  }
  const grandTotal = +(subtotal + gstTotal).toFixed(2);

  return {
    items: enriched,
    subtotal: +subtotal.toFixed(2),
    gst_total: +gstTotal.toFixed(2),
    grand_total: grandTotal,
  };
}

function customerSnapshot(customer) {
  if (!customer) return null;
  return JSON.stringify({
    name: customer.name,
    contact_person: customer.contact_person || '',
    phone: customer.phone || '',
    email: customer.email || '',
    gstin: customer.gstin || '',
    address: customer.address || '',
    city: customer.city || '',
    state: customer.state || '',
    pincode: customer.pincode || '',
  });
}

function listQuotations() {
  const rows = db
    .prepare(
      `SELECT q.*, c.name AS customer_name
       FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id
       ORDER BY q.id DESC`
    )
    .all();
  return rows.map((r) => ({
    ...r,
    customer_snapshot: r.customer_snapshot ? JSON.parse(r.customer_snapshot) : null,
  }));
}

function getQuotation(id) {
  const q = db.prepare('SELECT * FROM quotations WHERE id = ?').get(id);
  if (!q) return null;
  const items = db
    .prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id);
  const customer = q.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(q.customer_id)
    : null;
  const payments = db
    .prepare('SELECT * FROM quote_payments WHERE quotation_id = ? ORDER BY payment_date DESC, id DESC')
    .all(id);
  const paid = Number(q.paid_total) || 0;
  const balance = +((Number(q.grand_total) || 0) - paid).toFixed(2);
  return {
    ...q,
    customer,
    customer_snapshot: q.customer_snapshot ? JSON.parse(q.customer_snapshot) : null,
    items,
    payments,
    balance,
  };
}

function recomputeQuotationPayment(quotationId) {
  const paid = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE quotation_id = ?')
    .get(quotationId).s;
  db.prepare("UPDATE quotations SET paid_total = ?, updated_at = datetime('now') WHERE id = ?")
    .run(+paid.toFixed(2), quotationId);
}

function listQuotePayments(quotationId) {
  return db
    .prepare('SELECT * FROM quote_payments WHERE quotation_id = ? ORDER BY payment_date DESC, id DESC')
    .all(quotationId);
}

function addQuotePayment(payment) {
  const info = db
    .prepare(
      `INSERT INTO quote_payments (quotation_id, payment_date, amount, mode, reference, notes)
       VALUES (@quotation_id, @payment_date, @amount, @mode, @reference, @notes)`
    )
    .run({
      quotation_id: payment.quotation_id,
      payment_date: payment.payment_date,
      amount: Number(payment.amount) || 0,
      mode: payment.mode || 'Cash',
      reference: payment.reference || '',
      notes: payment.notes || '',
    });
  recomputeQuotationPayment(payment.quotation_id);
  // Auto-flip status to Billed if it wasn't already (recording payment implies billed)
  const q = db.prepare('SELECT status FROM quotations WHERE id = ?').get(payment.quotation_id);
  if (q && q.status !== 'Billed') updateQuotationStatus(payment.quotation_id, 'Billed');
  return db.prepare('SELECT * FROM quote_payments WHERE id = ?').get(info.lastInsertRowid);
}

function deleteQuotePayment(id) {
  const row = db.prepare('SELECT quotation_id FROM quote_payments WHERE id = ?').get(id);
  db.prepare('DELETE FROM quote_payments WHERE id = ?').run(id);
  if (row) recomputeQuotationPayment(row.quotation_id);
  return { ok: true };
}

function createQuotation(q) {
  const gstMode = q.gst_mode || 'per_line';
  const flatGstRate = Number.isFinite(Number(q.flat_gst_rate)) ? Number(q.flat_gst_rate) : 18;
  const totals = computeTotals(q.items || [], gstMode, flatGstRate);
  const customer = q.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(q.customer_id)
    : null;

  const tx = db.transaction(() => {
    const rawNumber = bumpQuoteNumber();
    const quoteNumber = formatQuoteNumber(rawNumber);
    const info = db
      .prepare(
        `INSERT INTO quotations (quote_number, customer_id, customer_snapshot, quote_date, valid_until,
           subject, notes, terms, gst_mode, flat_gst_rate, subtotal, gst_total, grand_total, status)
         VALUES (@quote_number, @customer_id, @customer_snapshot, @quote_date, @valid_until,
           @subject, @notes, @terms, @gst_mode, @flat_gst_rate, @subtotal, @gst_total, @grand_total, @status)`
      )
      .run({
        quote_number: quoteNumber,
        customer_id: q.customer_id || null,
        customer_snapshot: customerSnapshot(customer),
        quote_date: q.quote_date,
        valid_until: q.valid_until || null,
        subject: q.subject || '',
        notes: q.notes || '',
        terms: q.terms || '',
        gst_mode: gstMode,
        flat_gst_rate: flatGstRate,
        subtotal: totals.subtotal,
        gst_total: totals.gst_total,
        grand_total: totals.grand_total,
        status: q.status || 'Draft',
      });
    const qid = info.lastInsertRowid;
    const insItem = db.prepare(
      `INSERT INTO quotation_items (quotation_id, product_id, name, description, hsn_code, unit, size, weight, price_by,
         quantity, rate, gst_rate, amount, gst_amount, total, sort_order)
       VALUES (@quotation_id, @product_id, @name, @description, @hsn_code, @unit, @size, @weight, @price_by,
         @quantity, @rate, @gst_rate, @amount, @gst_amount, @total, @sort_order)`
    );
    for (const it of totals.items) {
      insItem.run({
        quotation_id: qid,
        product_id: it.product_id || null,
        name: it.name,
        description: it.description || '',
        hsn_code: it.hsn_code || '',
        unit: it.unit || 'Nos',
        size: it.size || '',
        weight: it.weight || '',
        price_by: it.price_by === 'weight' ? 'weight' : 'size',
        quantity: it.quantity,
        rate: it.rate,
        gst_rate: it.gst_rate,
        amount: it.amount,
        gst_amount: it.gst_amount,
        total: it.total,
        sort_order: it.sort_order,
      });
    }
    return qid;
  });

  const id = tx();
  return getQuotation(id);
}

function updateQuotation(q) {
  const gstMode = q.gst_mode || 'per_line';
  const flatGstRate = Number.isFinite(Number(q.flat_gst_rate)) ? Number(q.flat_gst_rate) : 18;
  const totals = computeTotals(q.items || [], gstMode, flatGstRate);
  const customer = q.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(q.customer_id)
    : null;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE quotations SET customer_id=@customer_id, customer_snapshot=@customer_snapshot,
         quote_date=@quote_date, valid_until=@valid_until, subject=@subject, notes=@notes,
         terms=@terms, gst_mode=@gst_mode, flat_gst_rate=@flat_gst_rate,
         subtotal=@subtotal, gst_total=@gst_total, grand_total=@grand_total,
         status=@status, updated_at=datetime('now') WHERE id=@id`
    ).run({
      id: q.id,
      customer_id: q.customer_id || null,
      customer_snapshot: customerSnapshot(customer),
      quote_date: q.quote_date,
      valid_until: q.valid_until || null,
      subject: q.subject || '',
      notes: q.notes || '',
      terms: q.terms || '',
      gst_mode: gstMode,
      flat_gst_rate: flatGstRate,
      subtotal: totals.subtotal,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
      status: q.status || 'Draft',
    });
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(q.id);
    const insItem = db.prepare(
      `INSERT INTO quotation_items (quotation_id, product_id, name, description, hsn_code, unit, size, weight, price_by,
         quantity, rate, gst_rate, amount, gst_amount, total, sort_order)
       VALUES (@quotation_id, @product_id, @name, @description, @hsn_code, @unit, @size, @weight, @price_by,
         @quantity, @rate, @gst_rate, @amount, @gst_amount, @total, @sort_order)`
    );
    for (const it of totals.items) {
      insItem.run({
        quotation_id: q.id,
        product_id: it.product_id || null,
        name: it.name,
        description: it.description || '',
        hsn_code: it.hsn_code || '',
        unit: it.unit || 'Nos',
        size: it.size || '',
        weight: it.weight || '',
        price_by: it.price_by === 'weight' ? 'weight' : 'size',
        quantity: it.quantity,
        rate: it.rate,
        gst_rate: it.gst_rate,
        amount: it.amount,
        gst_amount: it.gst_amount,
        total: it.total,
        sort_order: it.sort_order,
      });
    }
  });
  tx();
  return getQuotation(q.id);
}

function deleteQuotation(id) {
  db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
  return { ok: true };
}

function updateQuotationStatus(id, status) {
  db.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    id
  );
  return getQuotation(id);
}

function getLatestOrDemoQuotation() {
  const latest = db.prepare('SELECT id FROM quotations ORDER BY id DESC LIMIT 1').get();
  if (latest) return getQuotation(latest.id);
  return {
    id: 0,
    quote_number: formatQuoteNumber(1),
    quote_date: new Date().toISOString().slice(0, 10),
    valid_until: null,
    subject: 'Sample project for design preview',
    notes: 'Extra site charges will be billed separately.',
    terms: getSettings().default_terms || '',
    status: 'Draft',
    subtotal: 45000,
    gst_total: 8100,
    grand_total: 53100,
    customer: {
      name: 'Demo Customer Pvt. Ltd.',
      contact_person: 'Mr. Ramesh',
      phone: '+91 98765 43210',
      email: 'demo@example.com',
      gstin: '33ABCDE1234F1Z5',
      address: '12, Sample Street, Industrial Area',
      city: 'Tirupur',
      state: 'Tamil Nadu',
      pincode: '641604',
    },
    customer_snapshot: null,
    items: [
      {
        id: 1, name: 'MS Structural Fabrication', description: 'Cutting, welding & installation on site',
        hsn_code: '7308', unit: 'Kg', quantity: 250, rate: 120,
        amount: 30000, gst_rate: 18, gst_amount: 5400, total: 35400, sort_order: 0,
      },
      {
        id: 2, name: 'UPVC Roofing Sheet', description: '3-layer UPVC, 3mm thick',
        hsn_code: '3925', unit: 'Sqft', quantity: 50, rate: 180,
        amount: 9000, gst_rate: 18, gst_amount: 1620, total: 10620, sort_order: 1,
      },
      {
        id: 3, name: 'Plumbing Installation Service', description: 'GI + CPVC lines, valves & fittings',
        hsn_code: '995461', unit: 'Job', quantity: 1, rate: 6000,
        amount: 6000, gst_rate: 18, gst_amount: 1080, total: 7080, sort_order: 2,
      },
    ],
  };
}

function dashboardStats() {
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS total_quotes,
        COALESCE(SUM(grand_total), 0) AS total_value,
        COALESCE(SUM(CASE WHEN status='Accepted' THEN grand_total ELSE 0 END), 0) AS accepted_value,
        COALESCE(SUM(CASE WHEN status='Sent' THEN grand_total ELSE 0 END), 0) AS pending_value
       FROM quotations`
    )
    .get();
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS c FROM quotations GROUP BY status')
    .all();
  const recent = db
    .prepare(
      `SELECT q.id, q.quote_number, q.quote_date, q.grand_total, q.status, c.name AS customer_name
       FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id
       ORDER BY q.id DESC LIMIT 5`
    )
    .all();
  const productsCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  const customersCount = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  return { totals, byStatus, recent, productsCount, customersCount };
}

// ================================================================
// INVOICES  +  PAYMENTS
// ================================================================

function formatInvoiceNumber(n) {
  const s = getSettings();
  const prefix = s.invoice_prefix || 'MRL/INV/';
  const pad = Number(s.invoice_number_padding || 4);
  return `${prefix}${String(n).padStart(pad, '0')}`;
}
function peekNextInvoiceNumber() {
  const n = Number(getSettings().invoice_next_number || 1);
  return { number: formatInvoiceNumber(n), rawNumber: n };
}
function bumpInvoiceNumber() {
  const cur = Number(getSettings().invoice_next_number || 1);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'invoice_next_number'").run(String(cur + 1));
  return cur;
}

// Derive status from paid_total vs grand_total (never Draft once anything's paid)
function deriveInvoiceStatus(inv) {
  const paid = Number(inv.paid_total) || 0;
  const total = Number(inv.grand_total) || 0;
  if (paid <= 0) return inv.status && inv.status !== 'Paid' && inv.status !== 'Partial' ? inv.status : 'Sent';
  if (paid + 0.001 >= total) return 'Paid';
  return 'Partial';
}

function listInvoices() {
  return db
    .prepare(
      `SELECT i.*, c.name AS customer_name,
              (i.grand_total - i.paid_total) AS balance
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        ORDER BY i.id DESC`
    )
    .all();
}

function listPayments(invoiceId) {
  return db
    .prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC')
    .all(invoiceId);
}

function getInvoice(id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) return null;
  const items = db
    .prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id);
  const customer = inv.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id)
    : null;
  const payments = listPayments(id);
  return {
    ...inv,
    customer,
    customer_snapshot: inv.customer_snapshot ? JSON.parse(inv.customer_snapshot) : null,
    items,
    payments,
    balance: +((Number(inv.grand_total) || 0) - (Number(inv.paid_total) || 0)).toFixed(2),
  };
}

function recomputeInvoicePayment(invoiceId) {
  const paid = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ?')
    .get(invoiceId).s;
  const inv = db.prepare('SELECT grand_total, status FROM invoices WHERE id = ?').get(invoiceId);
  const status = deriveInvoiceStatus({ paid_total: paid, grand_total: inv.grand_total, status: inv.status });
  db.prepare(
    "UPDATE invoices SET paid_total = ?, status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(+paid.toFixed(2), status, invoiceId);
}

function createInvoice(inv) {
  const gstMode = inv.gst_mode || 'per_line';
  const flatGstRate = Number(inv.flat_gst_rate) || 18;
  const totals = computeTotals(inv.items || [], gstMode, flatGstRate);
  const customer = inv.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id)
    : null;

  const tx = db.transaction(() => {
    const rawNumber = bumpInvoiceNumber();
    const invoiceNumber = formatInvoiceNumber(rawNumber);
    const info = db
      .prepare(
        `INSERT INTO invoices (invoice_number, quotation_id, customer_id, customer_snapshot,
           invoice_date, due_date, subject, notes, terms, gst_mode, flat_gst_rate,
           subtotal, gst_total, grand_total, paid_total, status)
         VALUES (@invoice_number, @quotation_id, @customer_id, @customer_snapshot,
           @invoice_date, @due_date, @subject, @notes, @terms, @gst_mode, @flat_gst_rate,
           @subtotal, @gst_total, @grand_total, 0, @status)`
      )
      .run({
        invoice_number: invoiceNumber,
        quotation_id: inv.quotation_id || null,
        customer_id: inv.customer_id || null,
        customer_snapshot: customerSnapshot(customer),
        invoice_date: inv.invoice_date,
        due_date: inv.due_date || null,
        subject: inv.subject || '',
        notes: inv.notes || '',
        terms: inv.terms || '',
        gst_mode: gstMode,
        flat_gst_rate: flatGstRate,
        subtotal: totals.subtotal,
        gst_total: totals.gst_total,
        grand_total: totals.grand_total,
        status: inv.status || 'Sent',
      });
    const invId = info.lastInsertRowid;
    const insItem = db.prepare(
      `INSERT INTO invoice_items (invoice_id, product_id, name, description, hsn_code, unit, size, weight, price_by,
         quantity, rate, gst_rate, amount, gst_amount, total, sort_order)
       VALUES (@invoice_id, @product_id, @name, @description, @hsn_code, @unit, @size, @weight, @price_by,
         @quantity, @rate, @gst_rate, @amount, @gst_amount, @total, @sort_order)`
    );
    for (const it of totals.items) {
      insItem.run({
        invoice_id: invId,
        product_id: it.product_id || null,
        name: it.name,
        description: it.description || '',
        hsn_code: it.hsn_code || '',
        unit: it.unit || 'Nos',
        size: it.size || '',
        weight: it.weight || '',
        price_by: it.price_by === 'weight' ? 'weight' : 'size',
        quantity: it.quantity,
        rate: it.rate,
        gst_rate: it.gst_rate,
        amount: it.amount,
        gst_amount: it.gst_amount,
        total: it.total,
        sort_order: it.sort_order,
      });
    }
    return invId;
  });
  return getInvoice(tx());
}

function updateInvoice(inv) {
  const gstMode = inv.gst_mode || 'per_line';
  const flatGstRate = Number(inv.flat_gst_rate) || 18;
  const totals = computeTotals(inv.items || [], gstMode, flatGstRate);
  const customer = inv.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ?').get(inv.customer_id)
    : null;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE invoices SET customer_id=@customer_id, customer_snapshot=@customer_snapshot,
         invoice_date=@invoice_date, due_date=@due_date, subject=@subject, notes=@notes,
         terms=@terms, gst_mode=@gst_mode, flat_gst_rate=@flat_gst_rate,
         subtotal=@subtotal, gst_total=@gst_total, grand_total=@grand_total,
         updated_at=datetime('now') WHERE id=@id`
    ).run({
      id: inv.id,
      customer_id: inv.customer_id || null,
      customer_snapshot: customerSnapshot(customer),
      invoice_date: inv.invoice_date,
      due_date: inv.due_date || null,
      subject: inv.subject || '',
      notes: inv.notes || '',
      terms: inv.terms || '',
      gst_mode: gstMode,
      flat_gst_rate: flatGstRate,
      subtotal: totals.subtotal,
      gst_total: totals.gst_total,
      grand_total: totals.grand_total,
    });
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(inv.id);
    const insItem = db.prepare(
      `INSERT INTO invoice_items (invoice_id, product_id, name, description, hsn_code, unit, size, weight, price_by,
         quantity, rate, gst_rate, amount, gst_amount, total, sort_order)
       VALUES (@invoice_id, @product_id, @name, @description, @hsn_code, @unit, @size, @weight, @price_by,
         @quantity, @rate, @gst_rate, @amount, @gst_amount, @total, @sort_order)`
    );
    for (const it of totals.items) {
      insItem.run({
        invoice_id: inv.id,
        product_id: it.product_id || null,
        name: it.name,
        description: it.description || '',
        hsn_code: it.hsn_code || '',
        unit: it.unit || 'Nos',
        size: it.size || '',
        weight: it.weight || '',
        price_by: it.price_by === 'weight' ? 'weight' : 'size',
        quantity: it.quantity,
        rate: it.rate,
        gst_rate: it.gst_rate,
        amount: it.amount,
        gst_amount: it.gst_amount,
        total: it.total,
        sort_order: it.sort_order,
      });
    }
  });
  tx();
  recomputeInvoicePayment(inv.id);
  return getInvoice(inv.id);
}

function deleteInvoice(id) {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  return { ok: true };
}

function addPayment(payment) {
  const info = db
    .prepare(
      `INSERT INTO payments (invoice_id, payment_date, amount, mode, reference, notes)
       VALUES (@invoice_id, @payment_date, @amount, @mode, @reference, @notes)`
    )
    .run({
      invoice_id: payment.invoice_id,
      payment_date: payment.payment_date,
      amount: Number(payment.amount) || 0,
      mode: payment.mode || 'Cash',
      reference: payment.reference || '',
      notes: payment.notes || '',
    });
  recomputeInvoicePayment(payment.invoice_id);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid);
}

function deletePayment(id) {
  const row = db.prepare('SELECT invoice_id FROM payments WHERE id = ?').get(id);
  db.prepare('DELETE FROM payments WHERE id = ?').run(id);
  if (row) recomputeInvoicePayment(row.invoice_id);
  return { ok: true };
}

// Semantic status helpers for quotation pipeline
function markQuotationBilled(id) { return updateQuotationStatus(id, 'Billed'); }
function markQuotationLost(id) { return updateQuotationStatus(id, 'Lost'); }
function markQuotationPending(id) { return updateQuotationStatus(id, 'Pending'); }

function convertQuotationToInvoice(quotationId, extras = {}) {
  const q = getQuotation(quotationId);
  if (!q) throw new Error('Quotation not found');
  const inv = {
    quotation_id: quotationId,
    customer_id: q.customer_id,
    invoice_date: extras.invoice_date || new Date().toISOString().slice(0, 10),
    due_date: extras.due_date || null,
    subject: q.subject,
    notes: q.notes,
    terms: q.terms,
    gst_mode: q.gst_mode || 'per_line',
    flat_gst_rate: q.flat_gst_rate || 18,
    items: q.items.map((it) => ({
      product_id: it.product_id,
      name: it.name,
      description: it.description,
      hsn_code: it.hsn_code,
      unit: it.unit,
      size: it.size || '',
      quantity: it.quantity,
      rate: it.rate,
      gst_rate: it.gst_rate,
    })),
    status: 'Sent',
  };
  const created = createInvoice(inv);
  // Auto-mark the source quotation as Billed (won the deal)
  updateQuotationStatus(quotationId, 'Billed');
  return created;
}

function receivablesReport() {
  // Include both open invoices AND billed quotations with unpaid balance
  const invoiceRows = db
    .prepare(
      `SELECT i.id, i.invoice_number AS number, i.customer_id, c.name AS customer_name,
              i.invoice_date AS doc_date, i.due_date, i.grand_total, i.paid_total,
              (i.grand_total - i.paid_total) AS balance, i.status, 'invoice' AS kind
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
        WHERE (i.grand_total - i.paid_total) > 0
        ORDER BY i.invoice_date ASC`
    )
    .all();
  const quoteRows = db
    .prepare(
      `SELECT q.id, q.quote_number AS number, q.customer_id, c.name AS customer_name,
              q.quote_date AS doc_date, NULL AS due_date, q.grand_total, q.paid_total,
              (q.grand_total - q.paid_total) AS balance, q.status, 'quotation' AS kind
         FROM quotations q
         LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.status = 'Billed'
          AND (q.grand_total - q.paid_total) > 0
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = q.id)
        ORDER BY q.quote_date ASC`
    )
    .all();
  // Also pull free-form income entries where the customer hasn't paid in full yet.
  // These are receivables just like an unpaid invoice — the money is owed to us.
  const incomeRows = db
    .prepare(
      `SELECT inc.id,
              'INC-' || inc.id AS number,
              inc.customer_id,
              COALESCE(c.name, inc.customer_name, '(no customer)') AS customer_name,
              inc.income_date AS doc_date,
              NULL AS due_date,
              inc.amount AS grand_total,
              inc.received_amount AS paid_total,
              (inc.amount - inc.received_amount) AS balance,
              'Pending' AS status,
              'income' AS kind
         FROM incomes inc
         LEFT JOIN customers c ON c.id = inc.customer_id
        WHERE (inc.amount - inc.received_amount) > 0
        ORDER BY inc.income_date ASC`
    )
    .all();
  const rows = [...invoiceRows, ...quoteRows, ...incomeRows]
    // Add invoice_number alias for backward compat with any callers using `invoice_number`
    .map((r) => ({ ...r, invoice_number: r.number, invoice_date: r.doc_date }));
  const today = new Date();
  const bucket = { b0_30: 0, b31_60: 0, b60_plus: 0 };
  const byCustomer = new Map();
  let totalOutstanding = 0;
  for (const r of rows) {
    totalOutstanding += r.balance;
    const anchor = r.due_date || r.invoice_date;
    const ageDays = Math.floor((today - new Date(anchor)) / (1000 * 60 * 60 * 24));
    if (ageDays <= 30) bucket.b0_30 += r.balance;
    else if (ageDays <= 60) bucket.b31_60 += r.balance;
    else bucket.b60_plus += r.balance;
    const key = r.customer_id || 0;
    const prev = byCustomer.get(key) || { customer_id: r.customer_id, customer_name: r.customer_name, balance: 0, invoices: 0 };
    prev.balance += r.balance;
    prev.invoices += 1;
    byCustomer.set(key, prev);
  }
  return {
    total_outstanding: +totalOutstanding.toFixed(2),
    aging: {
      b0_30: +bucket.b0_30.toFixed(2),
      b31_60: +bucket.b31_60.toFixed(2),
      b60_plus: +bucket.b60_plus.toFixed(2),
    },
    invoices: rows,
    by_customer: Array.from(byCustomer.values()).sort((a, b) => b.balance - a.balance),
  };
}

// ================================================================
// VENDORS
// ================================================================

function listVendors() {
  // Left-join expense aggregates + settled totals so the vendors page can show
  // who has expenses, how much has been paid, and the running outstanding
  // — without a follow-up query per vendor.
  return db.prepare(
    `SELECT v.*,
            COALESCE(es.expense_count, 0) AS expense_count,
            COALESCE(es.total_billed, 0)  AS total_billed,
            COALESCE(es.total_paid, 0)    AS total_paid,
            COALESCE(es.outstanding, 0)   AS outstanding
       FROM vendors v
  LEFT JOIN (
              SELECT vendor_id,
                     COUNT(*) AS expense_count,
                     COALESCE(SUM(amount), 0) AS total_billed,
                     COALESCE(SUM(paid_amount), 0) AS total_paid,
                     COALESCE(SUM(amount - paid_amount), 0) AS outstanding
                FROM expenses
               WHERE vendor_id IS NOT NULL
               GROUP BY vendor_id
            ) es ON es.vendor_id = v.id
      ORDER BY v.name COLLATE NOCASE`
  ).all().map((r) => ({
    ...r,
    // Keep the previous field for backward compatibility with any existing UI.
    total_spent: r.total_billed,
  }));
}
function getVendor(id) {
  return db.prepare('SELECT * FROM vendors WHERE id = ?').get(id);
}
function createVendor(v) {
  const info = db
    .prepare('INSERT INTO vendors (name, phone, email, gstin, notes) VALUES (@name, @phone, @email, @gstin, @notes)')
    .run({ name: v.name, phone: v.phone || '', email: v.email || '', gstin: v.gstin || '', notes: v.notes || '' });
  return getVendor(info.lastInsertRowid);
}
function updateVendor(v) {
  db.prepare('UPDATE vendors SET name=@name, phone=@phone, email=@email, gstin=@gstin, notes=@notes WHERE id=@id').run({
    id: v.id, name: v.name, phone: v.phone || '', email: v.email || '', gstin: v.gstin || '', notes: v.notes || '',
  });
  return getVendor(v.id);
}
function deleteVendor(id) {
  db.prepare('DELETE FROM vendors WHERE id = ?').run(id);
  return { ok: true };
}

// -------- Vendor payments --------
// listVendorPayments — dated payment history for a vendor, newest first
function listVendorPayments(vendorId) {
  return db.prepare(
    `SELECT vp.*,
            (SELECT COALESCE(SUM(a.amount), 0) FROM vendor_payment_allocations a WHERE a.vendor_payment_id = vp.id) AS applied_amount
       FROM vendor_payments vp
      WHERE vp.vendor_id = ?
      ORDER BY vp.payment_date DESC, vp.id DESC`
  ).all(vendorId);
}

// vendorSummary — total billed/paid/outstanding + payment + expense history
function vendorSummary(vendorId) {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId);
  if (!vendor) return null;
  const totals = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS billed,
            COALESCE(SUM(paid_amount), 0) AS paid,
            COALESCE(SUM(amount - paid_amount), 0) AS outstanding,
            COUNT(*) AS expense_count
       FROM expenses
      WHERE vendor_id = ?`
  ).get(vendorId);
  const expenses = db.prepare(
    `SELECT id, expense_date, category, amount, paid_amount,
            (amount - paid_amount) AS balance, description, reference
       FROM expenses
      WHERE vendor_id = ?
      ORDER BY expense_date DESC, id DESC`
  ).all(vendorId);
  const payments = listVendorPayments(vendorId);
  return {
    vendor,
    total_billed: +Number(totals.billed || 0).toFixed(2),
    total_paid: +Number(totals.paid || 0).toFixed(2),
    outstanding: +Number(totals.outstanding || 0).toFixed(2),
    expense_count: totals.expense_count,
    expenses,
    payments,
  };
}

// createVendorPayment — records a dated payment against a vendor and FIFO-
// applies it across their oldest unpaid expenses (updating paid_amount).
// Extra amount above the total outstanding is stored on the payment row as an
// "advance" (applied is capped at total outstanding); the UI can flag that.
function createVendorPayment({ vendor_id, payment_date, amount, mode, reference, notes }) {
  const vid = Number(vendor_id);
  if (!vid) return { ok: false, error: 'vendor_id is required' };
  if (!payment_date) return { ok: false, error: 'payment_date is required' };
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'amount must be greater than zero' };
  const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vid);
  if (!vendor) return { ok: false, error: 'Vendor not found' };

  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO vendor_payments (vendor_id, payment_date, amount, mode, reference, notes)
         VALUES (@vendor_id, @payment_date, @amount, @mode, @reference, @notes)`
    ).run({
      vendor_id: vid,
      payment_date,
      amount: +amt.toFixed(2),
      mode: mode || 'Cash',
      reference: reference || '',
      notes: notes || '',
    });
    const paymentId = info.lastInsertRowid;
    // FIFO across outstanding expenses for this vendor
    const outstanding = db.prepare(
      `SELECT id, amount, paid_amount
         FROM expenses
        WHERE vendor_id = ? AND (amount - paid_amount) > 0.001
        ORDER BY expense_date ASC, id ASC`
    ).all(vid);
    let remaining = amt;
    for (const e of outstanding) {
      if (remaining <= 0.001) break;
      const balance = e.amount - e.paid_amount;
      const take = Math.min(balance, remaining);
      if (take > 0.001) {
        db.prepare('UPDATE expenses SET paid_amount = paid_amount + ? WHERE id = ?').run(+take.toFixed(2), e.id);
        db.prepare(
          'INSERT INTO vendor_payment_allocations (vendor_payment_id, expense_id, amount) VALUES (?, ?, ?)'
        ).run(paymentId, e.id, +take.toFixed(2));
        remaining -= take;
      }
    }
    return { paymentId, applied: +(amt - remaining).toFixed(2), unapplied: +remaining.toFixed(2) };
  });
  const result = tx();
  return {
    ok: true,
    payment: db.prepare('SELECT * FROM vendor_payments WHERE id = ?').get(result.paymentId),
    applied: result.applied,
    unapplied: result.unapplied,
  };
}

// deleteVendorPayment — reverses the FIFO allocations then drops the row.
function deleteVendorPayment(paymentId) {
  const pid = Number(paymentId);
  const row = db.prepare('SELECT id FROM vendor_payments WHERE id = ?').get(pid);
  if (!row) return { ok: false, error: 'Payment not found' };
  const tx = db.transaction(() => {
    const allocs = db.prepare('SELECT expense_id, amount FROM vendor_payment_allocations WHERE vendor_payment_id = ?').all(pid);
    for (const a of allocs) {
      db.prepare('UPDATE expenses SET paid_amount = MAX(0, paid_amount - ?) WHERE id = ?').run(a.amount, a.expense_id);
    }
    // Cascade deletes the allocation rows via FK on delete cascade.
    db.prepare('DELETE FROM vendor_payments WHERE id = ?').run(pid);
  });
  tx();
  return { ok: true };
}

// ================================================================
// INCOMES — free-form receipts not tied to quotations/invoices
// ================================================================
function listIncomes(filters = {}) {
  const where = [];
  const params = {};
  if (filters.from) { where.push('income_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('income_date <= @to'); params.to = filters.to; }
  if (filters.customer_id) { where.push('customer_id = @customer_id'); params.customer_id = filters.customer_id; }
  const sql =
    `SELECT i.*, c.name AS customer_lookup_name,
            (i.amount - i.received_amount) AS balance
       FROM incomes i
       LEFT JOIN customers c ON c.id = i.customer_id`
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY income_date DESC, id DESC';
  return db.prepare(sql).all(params);
}
function getIncome(id) {
  return db.prepare('SELECT *, (amount - received_amount) AS balance FROM incomes WHERE id = ?').get(id);
}
// Clamp received to [0, amount]. Blank/null received defaults to full amount (backwards compat).
function _normalizeReceived(received, amount) {
  if (received === undefined || received === null || received === '') return amount;
  const r = Number(received);
  if (!Number.isFinite(r) || r < 0) return 0;
  if (r > amount) return amount;
  return +r.toFixed(2);
}
function createIncome(i) {
  const amount = Number(i.amount) || 0;
  const received = _normalizeReceived(i.received_amount, amount);
  const info = db.prepare(
    `INSERT INTO incomes (income_date, customer_id, customer_name, amount, received_amount, mode, reference, notes)
       VALUES (@income_date, @customer_id, @customer_name, @amount, @received_amount, @mode, @reference, @notes)`
  ).run({
    income_date: i.income_date,
    customer_id: i.customer_id || null,
    customer_name: i.customer_name || (i.customer_id ? (db.prepare('SELECT name FROM customers WHERE id = ?').get(i.customer_id)?.name || '') : ''),
    amount,
    received_amount: received,
    mode: i.mode || 'Cash',
    reference: i.reference || '',
    notes: i.notes || '',
  });
  return getIncome(info.lastInsertRowid);
}
function updateIncome(i) {
  const amount = Number(i.amount) || 0;
  const received = _normalizeReceived(i.received_amount, amount);
  db.prepare(
    `UPDATE incomes SET income_date=@income_date, customer_id=@customer_id, customer_name=@customer_name,
       amount=@amount, received_amount=@received_amount, mode=@mode, reference=@reference, notes=@notes WHERE id=@id`
  ).run({
    id: i.id,
    income_date: i.income_date,
    customer_id: i.customer_id || null,
    customer_name: i.customer_name || (i.customer_id ? (db.prepare('SELECT name FROM customers WHERE id = ?').get(i.customer_id)?.name || '') : ''),
    amount,
    received_amount: received,
    mode: i.mode || 'Cash',
    reference: i.reference || '',
    notes: i.notes || '',
  });
  return getIncome(i.id);
}
// Quick "+ Pay" action: increment received_amount by `add` on an existing row.
function recordIncomePayment(incomeId, add) {
  const row = getIncome(incomeId);
  if (!row) throw new Error('Income not found');
  const delta = Number(add) || 0;
  if (delta <= 0) throw new Error('Amount must be > 0');
  const newReceived = Math.min(Number(row.amount) || 0, (Number(row.received_amount) || 0) + delta);
  db.prepare('UPDATE incomes SET received_amount = ? WHERE id = ?').run(+newReceived.toFixed(2), incomeId);
  return getIncome(incomeId);
}
function deleteIncome(id) {
  db.prepare('DELETE FROM incomes WHERE id = ?').run(id);
  return { ok: true };
}
function incomeStats(filters = {}) {
  const where = [];
  const params = {};
  if (filters.from) { where.push('income_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('income_date <= @to'); params.to = filters.to; }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM incomes${clause}`).get(params).s;
  const received = db.prepare(`SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes${clause}`).get(params).s;
  const outstanding = +(total - received).toFixed(2);
  const count = db.prepare(`SELECT COUNT(*) AS c FROM incomes${clause}`).get(params).c;
  return { total: +total.toFixed(2), received: +received.toFixed(2), outstanding, count };
}

// ================================================================
// EXPENSES
// ================================================================

const EXPENSE_CATEGORIES = ['Labour', 'Material', 'Transport', 'Utilities', 'Refreshments', 'Rent', 'Personal', 'Misc'];

function listExpenses(filters = {}) {
  const where = [];
  const params = {};
  if (filters.from) { where.push('expense_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('expense_date <= @to'); params.to = filters.to; }
  if (filters.category) { where.push('category = @category'); params.category = filters.category; }
  const sql =
    'SELECT * FROM expenses' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY expense_date DESC, id DESC';
  return db.prepare(sql).all(params);
}
function getExpense(id) {
  const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
  if (!e) return null;
  const items = db
    .prepare('SELECT * FROM expense_items WHERE expense_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id);
  return { ...e, items };
}
function saveExpenseItems(expenseId, items) {
  db.prepare('DELETE FROM expense_items WHERE expense_id = ?').run(expenseId);
  if (!Array.isArray(items) || items.length === 0) return;
  const ins = db.prepare(
    `INSERT INTO expense_items (expense_id, name, size, weight, unit, quantity, rate, amount, sort_order)
     VALUES (@expense_id, @name, @size, @weight, @unit, @quantity, @rate, @amount, @sort_order)`
  );
  items.forEach((it, i) => {
    const qty = Number(it.quantity) || 0;
    const rate = Number(it.rate) || 0;
    const amount = Number(it.amount) || +(qty * rate).toFixed(2);
    ins.run({
      expense_id: expenseId,
      name: it.name || '',
      size: it.size || '',
      weight: it.weight || '',
      unit: it.unit || '',
      quantity: qty,
      rate,
      amount,
      sort_order: i,
    });
  });
}
// Normalize paid_amount: default to full amount ("Paid" is the common case).
// Clamp between 0 and amount. Client sends either a number or nothing.
function _normalizePaidAmount(paid, amount) {
  if (paid === undefined || paid === null || paid === '') return amount; // default = fully paid
  const p = Number(paid);
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p > amount) return amount;
  return +p.toFixed(2);
}

function createExpense(e) {
  const tx = db.transaction(() => {
    let amount = Number(e.amount) || 0;
    if ((!amount || amount === 0) && Array.isArray(e.items) && e.items.length > 0) {
      amount = e.items.reduce((s, it) => s + (Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.rate) || 0)), 0);
    }
    const deduct = e.deduct_from_income === false || e.deduct_from_income === 0 ? 0 : 1;
    const paidAmount = _normalizePaidAmount(e.paid_amount, amount);
    const info = db
      .prepare(
        `INSERT INTO expenses (expense_date, category, amount, paid_amount, vendor_id, vendor_name,
           description, payment_mode, reference, receipt_path, deduct_from_income)
         VALUES (@expense_date, @category, @amount, @paid_amount, @vendor_id, @vendor_name,
           @description, @payment_mode, @reference, @receipt_path, @deduct_from_income)`
      )
      .run({
        expense_date: e.expense_date,
        category: e.category || 'Misc',
        amount,
        paid_amount: paidAmount,
        vendor_id: e.vendor_id || null,
        vendor_name: e.vendor_name || (e.vendor_id ? (getVendor(e.vendor_id)?.name || '') : ''),
        description: e.description || '',
        payment_mode: e.payment_mode || 'Cash',
        reference: e.reference || '',
        receipt_path: e.receipt_path || '',
        deduct_from_income: deduct,
      });
    const id = info.lastInsertRowid;
    saveExpenseItems(id, e.items);
    return id;
  });
  return getExpense(tx());
}
function updateExpense(e) {
  const tx = db.transaction(() => {
    let amount = Number(e.amount) || 0;
    if ((!amount || amount === 0) && Array.isArray(e.items) && e.items.length > 0) {
      amount = e.items.reduce((s, it) => s + (Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.rate) || 0)), 0);
    }
    const deduct = e.deduct_from_income === false || e.deduct_from_income === 0 ? 0 : 1;
    const paidAmount = _normalizePaidAmount(e.paid_amount, amount);
    db.prepare(
      `UPDATE expenses SET expense_date=@expense_date, category=@category, amount=@amount, paid_amount=@paid_amount,
         vendor_id=@vendor_id, vendor_name=@vendor_name, description=@description,
         payment_mode=@payment_mode, reference=@reference, receipt_path=@receipt_path,
         deduct_from_income=@deduct_from_income
         WHERE id=@id`
    ).run({
      id: e.id,
      expense_date: e.expense_date,
      category: e.category || 'Misc',
      amount,
      paid_amount: paidAmount,
      vendor_id: e.vendor_id || null,
      vendor_name: e.vendor_name || (e.vendor_id ? (getVendor(e.vendor_id)?.name || '') : ''),
      description: e.description || '',
      payment_mode: e.payment_mode || 'Cash',
      reference: e.reference || '',
      receipt_path: e.receipt_path || '',
      deduct_from_income: deduct,
    });
    saveExpenseItems(e.id, e.items);
  });
  tx();
  return getExpense(e.id);
}

// Quick action: record additional payment against an expense. Increments paid_amount.
function recordExpensePayment(expenseId, amount) {
  const e = getExpense(expenseId);
  if (!e) throw new Error('Expense not found');
  const add = Number(amount) || 0;
  if (add <= 0) throw new Error('Payment amount must be > 0');
  const newPaid = Math.min(e.amount, (e.paid_amount || 0) + add);
  db.prepare('UPDATE expenses SET paid_amount = ? WHERE id = ?').run(newPaid, expenseId);
  return getExpense(expenseId);
}
function deleteExpense(id) {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  return { ok: true };
}

function expenseCategories() {
  return EXPENSE_CATEGORIES;
}

function expenseStats(filters = {}) {
  const where = [];
  const params = {};
  if (filters.from) { where.push('expense_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('expense_date <= @to'); params.to = filters.to; }
  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses${clause}`).get(params).s;
  const totalDeducted = db.prepare(
    `SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses${clause}${clause ? ' AND' : ' WHERE'} deduct_from_income = 1`
  ).get(params).s;
  const totalExtra = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses${clause}${clause ? ' AND' : ' WHERE'} deduct_from_income = 0`
  ).get(params).s;
  const byCategory = db
    .prepare(`SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses${clause} GROUP BY category ORDER BY total DESC`)
    .all(params);
  return {
    total: +total.toFixed(2),
    total_deducted: +totalDeducted.toFixed(2),
    total_extra: +totalExtra.toFixed(2),
    byCategory,
  };
}

// ================================================================
// Reports (P&L, receivables aging, expense summary, monthly trend)
// ================================================================

function monthlyTrend(monthsBack = 12) {
  // Returns array [{ month, label, income, expense, net, billed, invoiced, growth_pct }] for the last N months
  const out = [];
  const now = new Date();
  // Use local YYYY-MM (avoid timezone shift issues with toISOString)
  const localYm = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const localDay = (d) => localYm(d) + '-' + String(d.getDate()).padStart(2, '0');
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const startKey = localDay(start);
    const endKey = localDay(end);
    const income = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ? AND payment_date < ?').get(startKey, endKey).s +
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ? AND payment_date < ?').get(startKey, endKey).s +
      db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ? AND income_date < ?').get(startKey, endKey).s
    );
    const expense = db
      .prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1 AND expense_date >= ? AND expense_date < ?')
      .get(startKey, endKey).s;
    const salary = db
      .prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL AND paid_date >= ? AND paid_date < ?')
      .get(startKey, endKey).s;
    // Billed value = quotations marked 'Billed' in this month, and invoices created this month
    const billed = db
      .prepare("SELECT COALESCE(SUM(grand_total), 0) AS s FROM quotations WHERE status = 'Billed' AND quote_date >= ? AND quote_date < ?")
      .get(startKey, endKey).s;
    const invoiced = db
      .prepare('SELECT COALESCE(SUM(grand_total), 0) AS s FROM invoices WHERE invoice_date >= ? AND invoice_date < ?')
      .get(startKey, endKey).s;
    const net = +(income - expense - salary).toFixed(2);
    out.push({
      month: localYm(start),
      label: start.toLocaleString('en-IN', { month: 'short' }) + ' ' + String(start.getFullYear()).slice(2),
      income: +income.toFixed(2),
      expense: +expense.toFixed(2),
      salary: +salary.toFixed(2),
      billed: +billed.toFixed(2),
      invoiced: +invoiced.toFixed(2),
      net,
      growth_pct: 0,
    });
  }
  // Fill growth_pct = ((this.net - prev.net) / |prev.net|) * 100
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].net;
    const cur = out[i].net;
    if (prev !== 0) out[i].growth_pct = +(((cur - prev) / Math.abs(prev)) * 100).toFixed(1);
    else if (cur !== 0) out[i].growth_pct = cur > 0 ? 100 : -100;
  }
  return out;
}

// Generic trend series for the dashboard charts. Granularity: 'week' | 'month' | 'year'.
// Returns the same shape as monthlyTrend so the chart components need no changes.
function dashboardTrend(granularity = 'month', count) {
  const now = new Date();
  const localDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const buckets = [];
  const n = Number(count) || (granularity === 'year' ? 5 : 12);

  if (granularity === 'week') {
    // n most recent weeks, Mon-Sun each (label = "d MMM")
    const monday = (d) => { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() - ((dow + 6) % 7)); x.setHours(0,0,0,0); return x; };
    const thisMon = monday(now);
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(thisMon); start.setDate(thisMon.getDate() - i * 7);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      buckets.push({
        key: localDay(start),
        label: start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        startKey: localDay(start),
        endKey: localDay(end),
      });
    }
  } else if (granularity === 'year') {
    for (let i = n - 1; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({
        key: String(y),
        label: String(y),
        startKey: `${y}-01-01`,
        endKey: `${y + 1}-01-01`,
      });
    }
  } else {
    // month (default)
    for (let i = n - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        key: start.getFullYear() + '-' + String(start.getMonth() + 1).padStart(2, '0'),
        label: start.toLocaleString('en-IN', { month: 'short' }) + ' ' + String(start.getFullYear()).slice(2),
        startKey: localDay(start),
        endKey: localDay(end),
      });
    }
  }

  const out = buckets.map((b) => {
    const income = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ? AND payment_date < ?').get(b.startKey, b.endKey).s +
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ? AND payment_date < ?').get(b.startKey, b.endKey).s +
      db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ? AND income_date < ?').get(b.startKey, b.endKey).s
    );
    const expense = db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1 AND expense_date >= ? AND expense_date < ?').get(b.startKey, b.endKey).s;
    const salary = db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL AND paid_date >= ? AND paid_date < ?').get(b.startKey, b.endKey).s;
    const billed = db.prepare("SELECT COALESCE(SUM(grand_total), 0) AS s FROM quotations WHERE status = 'Billed' AND quote_date >= ? AND quote_date < ?").get(b.startKey, b.endKey).s;
    const invoiced = db.prepare('SELECT COALESCE(SUM(grand_total), 0) AS s FROM invoices WHERE invoice_date >= ? AND invoice_date < ?').get(b.startKey, b.endKey).s;
    const net = +(income - expense - salary).toFixed(2);
    return {
      month: b.key, // keep the "month" key name so existing charts work unchanged
      label: b.label,
      income: +income.toFixed(2),
      expense: +expense.toFixed(2),
      salary: +salary.toFixed(2),
      billed: +billed.toFixed(2),
      invoiced: +invoiced.toFixed(2),
      net,
      growth_pct: 0,
    };
  });
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].net;
    const cur = out[i].net;
    if (prev !== 0) out[i].growth_pct = +(((cur - prev) / Math.abs(prev)) * 100).toFixed(1);
    else if (cur !== 0) out[i].growth_pct = cur > 0 ? 100 : -100;
  }
  return out;
}

// Trend within an arbitrary [from, to] window. Bucket size is auto-picked from
// range length: <=14 days = daily, <=100 days = weekly (Sun-start), else monthly.
// Returns the same row shape as dashboardTrend() so the same charts render it.
function dashboardTrendForRange(from, to) {
  if (!from || !to) return [];
  const localDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const days = Math.round((end - start) / 86400000) + 1;
  const buckets = [];

  if (days <= 14) {
    // Daily buckets
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const next = new Date(d); next.setDate(d.getDate() + 1);
      buckets.push({
        key: localDay(d),
        label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        startKey: localDay(d),
        endKey: localDay(next),
      });
    }
  } else if (days <= 100) {
    // Weekly buckets, Sunday-start (matches Attendance / Payroll convention)
    const sunOf = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); x.setHours(0,0,0,0); return x; };
    let cursor = sunOf(start);
    while (cursor <= end) {
      const next = new Date(cursor); next.setDate(cursor.getDate() + 7);
      buckets.push({
        key: localDay(cursor),
        label: 'Wk ' + cursor.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        startKey: localDay(cursor),
        endKey: localDay(next),
      });
      cursor = next;
    }
  } else {
    // Monthly buckets
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      buckets.push({
        key: cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0'),
        label: cursor.toLocaleString('en-IN', { month: 'short' }) + ' ' + String(cursor.getFullYear()).slice(2),
        startKey: localDay(cursor),
        endKey: localDay(next),
      });
      cursor = next;
    }
  }

  const out = buckets.map((b) => {
    const income = (
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ? AND payment_date < ?').get(b.startKey, b.endKey).s +
      db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ? AND payment_date < ?').get(b.startKey, b.endKey).s +
      db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ? AND income_date < ?').get(b.startKey, b.endKey).s
    );
    const expense = db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1 AND expense_date >= ? AND expense_date < ?').get(b.startKey, b.endKey).s;
    const salary = db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL AND paid_date >= ? AND paid_date < ?').get(b.startKey, b.endKey).s;
    const billed = db.prepare("SELECT COALESCE(SUM(grand_total), 0) AS s FROM quotations WHERE status = 'Billed' AND quote_date >= ? AND quote_date < ?").get(b.startKey, b.endKey).s;
    const invoiced = db.prepare('SELECT COALESCE(SUM(grand_total), 0) AS s FROM invoices WHERE invoice_date >= ? AND invoice_date < ?').get(b.startKey, b.endKey).s;
    const net = +(income - expense - salary).toFixed(2);
    return {
      month: b.key,
      label: b.label,
      income: +income.toFixed(2),
      expense: +expense.toFixed(2),
      salary: +salary.toFixed(2),
      billed: +billed.toFixed(2),
      invoiced: +invoiced.toFixed(2),
      net,
      growth_pct: 0,
    };
  });
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1].net;
    const cur = out[i].net;
    if (prev !== 0) out[i].growth_pct = +(((cur - prev) / Math.abs(prev)) * 100).toFixed(1);
    else if (cur !== 0) out[i].growth_pct = cur > 0 ? 100 : -100;
  }
  return out;
}

// Sales pipeline snapshot — how quotations are converting
function pipelineStats() {
  const rows = db
    .prepare('SELECT status, COUNT(*) AS count, COALESCE(SUM(grand_total), 0) AS value, COALESCE(SUM(paid_total), 0) AS paid FROM quotations GROUP BY status')
    .all();
  const map = {};
  for (const r of rows) map[r.status] = { count: r.count, value: r.value, paid: r.paid };
  const billed = map['Billed'] || { count: 0, value: 0, paid: 0 };
  const lost = map['Lost'] || { count: 0, value: 0, paid: 0 };
  const pendingStatuses = ['Draft', 'Sent', 'Pending'];
  let pendingCount = 0, pendingValue = 0;
  for (const s of pendingStatuses) {
    if (map[s]) {
      pendingCount += map[s].count;
      pendingValue += map[s].value;
    }
  }
  const received = +billed.paid.toFixed(2);
  const balance = +(billed.value - billed.paid).toFixed(2);
  const decided = billed.count + lost.count;
  const conversion_rate = decided > 0 ? +((billed.count / decided) * 100).toFixed(1) : 0;
  return {
    billed_count: billed.count,
    billed_value: +billed.value.toFixed(2),
    billed_received: received,
    billed_balance: balance,
    lost_count: lost.count,
    lost_value: +lost.value.toFixed(2),
    pending_count: pendingCount,
    pending_value: +pendingValue.toFixed(2),
    conversion_rate,
  };
}

// Pending quotations for follow-up (oldest first, so the ones needing attention surface up)
function listPendingQuotations(limit = 20) {
  return db
    .prepare(
      `SELECT q.id, q.quote_number, q.quote_date, q.subject, q.grand_total, q.status,
              c.name AS customer_name, c.phone AS customer_phone,
              julianday('now') - julianday(q.quote_date) AS age_days
         FROM quotations q
         LEFT JOIN customers c ON c.id = q.customer_id
        WHERE q.status IN ('Draft', 'Sent', 'Pending')
        ORDER BY q.quote_date ASC
        LIMIT ?`
    )
    .all(limit)
    .map((r) => ({ ...r, age_days: Math.floor(r.age_days) }));
}

// Bank-statement style report: every money-in and money-out event in a period.
// Sources: invoice payments (credit), quote payments (credit), expenses (debit),
//          employee advances (debit), salary payments (debit, only marked-paid entries).
function cashflowReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  const rows = [];

  db.prepare(
    `SELECT p.payment_date AS date, p.amount, p.mode, p.reference,
            i.invoice_number AS ref_number, c.name AS party
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE p.payment_date >= ? AND p.payment_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'IN',
    source: 'Invoice payment',
    party: r.party || '—',
    description: r.ref_number,
    mode: r.mode || '',
    reference: r.reference || '',
    credit: +r.amount.toFixed(2),
    debit: 0,
  }));

  db.prepare(
    `SELECT p.payment_date AS date, p.amount, p.mode, p.reference,
            q.quote_number AS ref_number, c.name AS party
       FROM quote_payments p
       JOIN quotations q ON q.id = p.quotation_id
       LEFT JOIN customers c ON c.id = q.customer_id
      WHERE p.payment_date >= ? AND p.payment_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'IN',
    source: 'Quotation payment',
    party: r.party || '—',
    description: r.ref_number,
    mode: r.mode || '',
    reference: r.reference || '',
    credit: +r.amount.toFixed(2),
    debit: 0,
  }));

  // Free-form incomes (no invoice / no quote) — count `received_amount`, not the
  // headline `amount`, since that's the actual cashflow.
  db.prepare(
    `SELECT inc.income_date AS date, inc.received_amount AS amount, inc.mode, inc.reference,
            inc.notes, COALESCE(c.name, inc.customer_name, '—') AS party
       FROM incomes inc
       LEFT JOIN customers c ON c.id = inc.customer_id
      WHERE inc.received_amount > 0
        AND inc.income_date >= ? AND inc.income_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'IN',
    source: 'Income',
    party: r.party,
    description: r.notes || '',
    mode: r.mode || '',
    reference: r.reference || '',
    credit: +r.amount.toFixed(2),
    debit: 0,
  }));

  // Expenses on their own date now represent only the initial pay-at-purchase
  // amount (paid_amount at the moment the expense was booked). Later
  // settlements are their own dated rows via vendor_payments below, so the
  // cashflow shows money moving on the day it actually moved.
  db.prepare(
    `SELECT expense_date AS date, paid_amount AS amount, category, vendor_name,
            description, payment_mode, reference
       FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?
        AND paid_amount > 0`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'OUT',
    source: 'Expense — ' + (r.category || 'Misc'),
    party: r.vendor_name || '—',
    description: r.description || '',
    mode: r.payment_mode || '',
    reference: r.reference || '',
    credit: 0,
    debit: +r.amount.toFixed(2),
  }));

  // Vendor settlements — subsequent payments against outstanding expenses,
  // recorded on the actual payment date (not the original purchase date).
  db.prepare(
    `SELECT vp.payment_date AS date, vp.amount, vp.mode, vp.reference, vp.notes,
            v.name AS vendor_name
       FROM vendor_payments vp
       JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.payment_date >= ? AND vp.payment_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'OUT',
    source: 'Vendor payment',
    party: r.vendor_name || '—',
    description: r.notes || 'Vendor settlement',
    mode: r.mode || '',
    reference: r.reference || '',
    credit: 0,
    debit: +r.amount.toFixed(2),
  }));

  db.prepare(
    `SELECT a.advance_date AS date, a.amount, a.mode, a.reference, a.notes, e.name AS employee_name
       FROM advances a JOIN employees e ON e.id = a.employee_id
      WHERE a.advance_date >= ? AND a.advance_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'OUT',
    source: 'Employee advance',
    party: r.employee_name,
    description: r.notes || 'Advance',
    mode: r.mode || '',
    reference: r.reference || '',
    credit: 0,
    debit: +r.amount.toFixed(2),
  }));

  db.prepare(
    `SELECT pe.paid_date AS date, pe.net_pay AS amount, pe.period, e.name AS employee_name
       FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id
      WHERE pe.paid = 1 AND pe.paid_date IS NOT NULL AND pe.paid_date >= ? AND pe.paid_date <= ?`
  ).all(from, to).forEach((r) => rows.push({
    date: r.date,
    kind: 'OUT',
    source: 'Salary',
    party: r.employee_name,
    description: 'Payroll ' + r.period,
    mode: 'Bank',
    reference: '',
    credit: 0,
    debit: +r.amount.toFixed(2),
  }));

  // Sort by date, then by kind (IN before OUT on same day for readability)
  rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'IN' ? -1 : 1));

  // Running balance (opening balance = 0 unless we add setting later)
  let bal = 0;
  const withBalance = rows.map((r) => {
    bal += r.credit - r.debit;
    return { ...r, balance: +bal.toFixed(2) };
  });

  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);

  return {
    period: { from, to },
    total_credit: +totalCredit.toFixed(2),
    total_debit: +totalDebit.toFixed(2),
    net: +(totalCredit - totalDebit).toFixed(2),
    transactions: withBalance,
  };
}

// Sales report — invoices + billed quotations in a period, chronological
function salesReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  const invoiceRows = db.prepare(
    `SELECT i.invoice_number AS number, i.invoice_date AS date, c.name AS customer_name,
            i.subject, i.grand_total, i.paid_total, (i.grand_total - i.paid_total) AS balance,
            i.status, 'invoice' AS kind
       FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?`
  ).all(from, to);
  const quoteRows = db.prepare(
    `SELECT q.quote_number AS number, q.quote_date AS date, c.name AS customer_name,
            q.subject, q.grand_total, q.paid_total, (q.grand_total - q.paid_total) AS balance,
            q.status, 'quotation' AS kind
       FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id
      WHERE q.status = 'Billed' AND q.quote_date >= ? AND q.quote_date <= ?
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = q.id)`
  ).all(from, to);
  // Free-form incomes count as sales too — they represent revenue booked without
  // going through an invoice/quotation (cash jobs, direct bank credits, etc.).
  const incomeRows = db.prepare(
    `SELECT 'INC-' || inc.id AS number, inc.income_date AS date,
            COALESCE(c.name, inc.customer_name, '(no customer)') AS customer_name,
            COALESCE(inc.notes, 'Income') AS subject,
            inc.amount AS grand_total, inc.received_amount AS paid_total,
            (inc.amount - inc.received_amount) AS balance,
            CASE WHEN inc.received_amount >= inc.amount THEN 'Paid'
                 WHEN inc.received_amount > 0 THEN 'Partial'
                 ELSE 'Pending' END AS status,
            'income' AS kind
       FROM incomes inc
       LEFT JOIN customers c ON c.id = inc.customer_id
      WHERE inc.income_date >= ? AND inc.income_date <= ?`
  ).all(from, to);
  const rows = [...invoiceRows, ...quoteRows, ...incomeRows].sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((s, r) => s + r.grand_total, 0);
  const received = rows.reduce((s, r) => s + r.paid_total, 0);
  const outstanding = rows.reduce((s, r) => s + r.balance, 0);
  return {
    period: { from, to },
    total_billed: +total.toFixed(2),
    total_received: +received.toFixed(2),
    total_outstanding: +outstanding.toFixed(2),
    rows,
  };
}

// GST report — output GST (from sales) grouped by rate, input GST (from expenses — none tracked yet).
// Uses invoices + billed quotations for output GST; expenses currently have no per-item GST so input GST = 0.
function gstReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';

  // Aggregate per GST rate — from invoice_items and quotation_items where parent is Billed
  const invRows = db.prepare(
    `SELECT ii.gst_rate AS rate, COALESCE(SUM(ii.amount), 0) AS taxable, COALESCE(SUM(ii.gst_amount), 0) AS tax
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.invoice_date >= ? AND i.invoice_date <= ?
      GROUP BY ii.gst_rate`
  ).all(from, to);
  const qRows = db.prepare(
    `SELECT qi.gst_rate AS rate, COALESCE(SUM(qi.amount), 0) AS taxable, COALESCE(SUM(qi.gst_amount), 0) AS tax
       FROM quotation_items qi
       JOIN quotations q ON q.id = qi.quotation_id
      WHERE q.status = 'Billed' AND q.quote_date >= ? AND q.quote_date <= ?
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = q.id)
      GROUP BY qi.gst_rate`
  ).all(from, to);

  const merged = {};
  for (const r of [...invRows, ...qRows]) {
    if (!merged[r.rate]) merged[r.rate] = { rate: r.rate, taxable: 0, tax: 0 };
    merged[r.rate].taxable += r.taxable;
    merged[r.rate].tax += r.tax;
  }
  const rows = Object.values(merged)
    .filter((r) => r.tax > 0 || r.taxable > 0)
    .sort((a, b) => Number(a.rate) - Number(b.rate))
    .map((r) => ({
      rate: r.rate,
      taxable: +r.taxable.toFixed(2),
      cgst: +(r.tax / 2).toFixed(2),
      sgst: +(r.tax / 2).toFixed(2),
      tax_total: +r.tax.toFixed(2),
    }));

  return {
    period: { from, to },
    total_taxable: +rows.reduce((s, r) => s + r.taxable, 0).toFixed(2),
    total_cgst: +rows.reduce((s, r) => s + r.cgst, 0).toFixed(2),
    total_sgst: +rows.reduce((s, r) => s + r.sgst, 0).toFixed(2),
    total_tax: +rows.reduce((s, r) => s + r.tax_total, 0).toFixed(2),
    rows,
  };
}

// Employee attendance summary — days per status per employee for a period
function attendanceSummary(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  const rows = db.prepare(
    `SELECT e.id, e.name, e.code, e.role, e.pay_mode,
            COALESCE(SUM(a.shifts_worked), 0) AS total_shifts,
            SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status = 'Half' THEN 1 ELSE 0 END) AS half,
            SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END) AS leave_days,
            COUNT(a.id) AS days_marked
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.att_date >= ? AND a.att_date <= ?
      WHERE e.is_active = 1
      GROUP BY e.id
      ORDER BY e.name`
  ).all(from, to);
  // Working days = number of calendar days in period (excluding Sundays as non-working by default).
  const workingDays = (() => {
    const s = new Date(from);
    const eDate = new Date(to);
    let n = 0;
    for (let d = new Date(s); d <= eDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) n++; // exclude Sunday
    }
    return n;
  })();
  // Total calendar days in range (used for yearly-bonus proration alongside working_days).
  const totalDays = (() => {
    const s = new Date(from);
    const eDate = new Date(to);
    return Math.floor((eDate - s) / (1000 * 60 * 60 * 24)) + 1;
  })();
  return {
    period: { from, to },
    working_days: workingDays,
    total_days: totalDays,
    rows: rows.map((r) => {
      const shifts = Number(r.total_shifts) || 0;
      const present = r.present || 0;
      const half = r.half || 0;
      const daysWorked = present + half; // any day with at least one shift = "worked" day
      // Expected shifts = 2 shifts per working day (a typical full day = 2 half-shifts)
      const expectedShifts = workingDays * 2;
      const attendancePct = expectedShifts > 0 ? +(100 * shifts / expectedShifts).toFixed(1) : 0;
      // Days-present ratio out of working days — for yearly bonus proration
      const dayAttendancePct = workingDays > 0 ? +(100 * daysWorked / workingDays).toFixed(1) : 0;
      return {
        ...r,
        total_shifts: shifts,
        present, half,
        absent: r.absent || 0,
        leave_days: r.leave_days || 0,
        days_worked: daysWorked,
        attendance_pct: attendancePct,
        day_attendance_pct: dayAttendancePct,
      };
    }),
  };
}

// Payroll register — all entries across all runs in a period, per employee
function payrollRegister(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  // Filter by the payroll PERIOD (what the money is for), not the generation date.
  // Uses period_end when present (new date-range runs); falls back to r.period + '-28'
  // for legacy monthly runs stored as 'YYYY-MM'.
  const rows = db.prepare(
    `SELECT pe.*, e.name AS employee_name, e.code AS employee_code, r.period, r.run_date,
            r.period_start, r.period_end
       FROM payroll_entries pe
       JOIN payroll_runs r ON r.id = pe.run_id
       JOIN employees e ON e.id = pe.employee_id
      WHERE COALESCE(r.period_end, r.period || '-28') >= ?
        AND COALESCE(r.period_start, r.period || '-01') <= ?
      ORDER BY COALESCE(r.period_end, r.period || '-28') DESC, e.name`
  ).all(from, to);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalAdvance = rows.reduce((s, r) => s + (r.advance_deduction || 0), 0);
  const totalNet = rows.reduce((s, r) => s + r.net_pay, 0);
  const totalPaid = rows.filter((r) => r.paid).reduce((s, r) => s + r.net_pay, 0);
  return {
    period: { from, to },
    total_gross: +totalGross.toFixed(2),
    total_advance_deducted: +totalAdvance.toFixed(2),
    total_net: +totalNet.toFixed(2),
    total_paid: +totalPaid.toFixed(2),
    total_pending: +(totalNet - totalPaid).toFixed(2),
    rows,
  };
}

// Outstanding advances — employees who still owe from past advances
// Customer directory report — with each customer's totals
function customerReport() {
  return db.prepare(
    `SELECT c.id, c.name, c.contact_person, c.phone, c.email, c.gstin,
            c.city, c.state, c.pincode,
            COALESCE((SELECT COUNT(*) FROM quotations WHERE customer_id = c.id), 0) AS quotation_count,
            COALESCE((SELECT SUM(grand_total) FROM quotations WHERE customer_id = c.id), 0) AS quotation_value,
            COALESCE((SELECT COUNT(*) FROM invoices WHERE customer_id = c.id), 0) AS invoice_count,
            COALESCE((SELECT SUM(grand_total) FROM invoices WHERE customer_id = c.id), 0) AS invoice_value,
            COALESCE((SELECT SUM(paid_total) FROM invoices WHERE customer_id = c.id), 0)
              + COALESCE((SELECT SUM(paid_total) FROM quotations WHERE status='Billed' AND customer_id = c.id), 0)
              AS total_paid,
            (COALESCE((SELECT SUM(grand_total - paid_total) FROM invoices WHERE customer_id = c.id), 0)
              + COALESCE((SELECT SUM(grand_total - paid_total) FROM quotations WHERE status='Billed' AND customer_id = c.id
                          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = quotations.id)), 0))
              AS outstanding
       FROM customers c
      ORDER BY c.name COLLATE NOCASE`
  ).all();
}

// Credit management report — expenses NOT yet fully paid, grouped for follow-up.
// Returns two views: by vendor (aggregate outstanding) and line items (with
// category + description) so the user can see WHAT is on credit and WHOM they owe.
function creditReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  const items = db.prepare(
    `SELECT e.id, e.expense_date, e.amount, e.paid_amount,
            (e.amount - e.paid_amount) AS balance,
            e.category, e.description, e.vendor_id,
            COALESCE(e.vendor_name, v.name) AS vendor_name,
            CASE
              WHEN e.paid_amount >= e.amount THEN 'Paid'
              WHEN e.paid_amount = 0 THEN 'Credit'
              ELSE 'Partial'
            END AS payment_status
       FROM expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
      WHERE e.amount > e.paid_amount
        AND e.expense_date >= ? AND e.expense_date <= ?
      ORDER BY e.expense_date DESC, vendor_name`
  ).all(from, to);

  // Group by vendor for the aggregate view
  const byVendor = new Map();
  for (const it of items) {
    const key = it.vendor_id || `name:${it.vendor_name || '(no vendor)'}`;
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        vendor_id: it.vendor_id,
        vendor_name: it.vendor_name || '(no vendor)',
        item_count: 0,
        total_billed: 0,
        total_paid: 0,
        total_outstanding: 0,
        oldest_credit_date: it.expense_date,
      });
    }
    const g = byVendor.get(key);
    g.item_count += 1;
    g.total_billed += it.amount;
    g.total_paid += it.paid_amount;
    g.total_outstanding += it.balance;
    if (it.expense_date < g.oldest_credit_date) g.oldest_credit_date = it.expense_date;
  }
  const vendors = Array.from(byVendor.values())
    .map((g) => ({
      ...g,
      total_billed: +g.total_billed.toFixed(2),
      total_paid: +g.total_paid.toFixed(2),
      total_outstanding: +g.total_outstanding.toFixed(2),
    }))
    .sort((a, b) => b.total_outstanding - a.total_outstanding);

  const totalBilled = items.reduce((s, i) => s + i.amount, 0);
  const totalPaid = items.reduce((s, i) => s + i.paid_amount, 0);
  return {
    period: { from, to },
    total_billed: +totalBilled.toFixed(2),
    total_paid: +totalPaid.toFixed(2),
    total_outstanding: +(totalBilled - totalPaid).toFixed(2),
    vendors,
    items,
  };
}

// Vendor directory report — with each vendor's totals
function vendorReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  return db.prepare(
    `SELECT v.id, v.name, v.phone, v.email, v.gstin,
            COALESCE((SELECT COUNT(*) FROM expenses WHERE vendor_id = v.id AND expense_date >= ? AND expense_date <= ?), 0) AS expense_count,
            COALESCE((SELECT SUM(amount) FROM expenses WHERE vendor_id = v.id AND expense_date >= ? AND expense_date <= ?), 0) AS total_spent
       FROM vendors v
      ORDER BY total_spent DESC, v.name COLLATE NOCASE`
  ).all(from, to, from, to);
}

function advancesOutstanding() {
  // Outstanding per advance = amount - SUM(advance_deductions.amount). Rolls up to per-employee.
  const rows = db.prepare(
    `SELECT e.id, e.name, e.code,
            COALESCE(SUM(a.amount - COALESCE(dsum.deducted, 0)), 0) AS outstanding,
            SUM(CASE WHEN (a.amount - COALESCE(dsum.deducted, 0)) > 0.001 THEN 1 ELSE 0 END) AS advance_count,
            MIN(CASE WHEN (a.amount - COALESCE(dsum.deducted, 0)) > 0.001 THEN a.advance_date END) AS oldest_date
       FROM employees e
       JOIN advances a ON a.employee_id = e.id
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) dsum
              ON dsum.advance_id = a.id
      GROUP BY e.id
      HAVING outstanding > 0
      ORDER BY outstanding DESC`
  ).all();
  return {
    total_outstanding: +rows.reduce((s, r) => s + r.outstanding, 0).toFixed(2),
    rows,
  };
}

function profitLossReport(filters = {}) {
  const from = filters.from || '1900-01-01';
  const to = filters.to || '2999-12-31';
  const income = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ? AND payment_date <= ?').get(from, to).s +
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ? AND payment_date <= ?').get(from, to).s +
    db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ? AND income_date <= ?').get(from, to).s
  );
  const invoiced = db
    .prepare('SELECT COALESCE(SUM(grand_total), 0) AS s FROM invoices WHERE invoice_date >= ? AND invoice_date <= ?')
    .get(from, to).s;
  // Outstanding = unpaid invoices + billed quotations with no invoice, in the period
  const invOutstanding = db
    .prepare('SELECT COALESCE(SUM(grand_total - paid_total), 0) AS s FROM invoices WHERE invoice_date >= ? AND invoice_date <= ?')
    .get(from, to).s;
  const quoteOutstanding = db
    .prepare(
      `SELECT COALESCE(SUM(grand_total - paid_total), 0) AS s FROM quotations
       WHERE status = 'Billed' AND quote_date >= ? AND quote_date <= ?
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = quotations.id)`
    )
    .get(from, to).s;
  // Free-form incomes with partial receipts are also outstanding — they're
  // money the customer still owes for a job that isn't invoice-linked.
  const incomeOutstanding = db
    .prepare('SELECT COALESCE(SUM(amount - received_amount), 0) AS s FROM incomes WHERE income_date >= ? AND income_date <= ? AND amount > received_amount')
    .get(from, to).s;
  const outstanding = invOutstanding + quoteOutstanding + incomeOutstanding;
  // Also include billed quotations in "invoiced" totals
  const billedQuotes = db
    .prepare(
      `SELECT COALESCE(SUM(grand_total), 0) AS s FROM quotations
       WHERE status = 'Billed' AND quote_date >= ? AND quote_date <= ?
         AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quotation_id = quotations.id)`
    )
    .get(from, to).s;
  // Only "deduct_from_income = 1" expenses reduce P&L; "extra" expenses are tracked separately
  const expense = db
    .prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1 AND expense_date >= ? AND expense_date <= ?')
    .get(from, to).s;
  const extraExpense = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE deduct_from_income = 0 AND expense_date >= ? AND expense_date <= ?')
    .get(from, to).s;
  const byExpenseCat = db
    .prepare(
      `SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE expense_date >= ? AND expense_date <= ? GROUP BY category ORDER BY total DESC`
    )
    .all(from, to);
  // Salary paid out in the period reduces P&L just like operating expenses do.
  const salary = db
    .prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL AND paid_date >= ? AND paid_date <= ?')
    .get(from, to).s;
  // Fold salary into the category breakdown so charts/tables show it.
  const byCategory = salary > 0
    ? [...byExpenseCat, { category: 'Salary', total: +salary.toFixed(2) }].sort((a, b) => b.total - a.total)
    : byExpenseCat;
  return {
    period: { from, to },
    income: +income.toFixed(2),
    invoiced: +(invoiced + billedQuotes).toFixed(2),
    outstanding: +outstanding.toFixed(2),
    expense: +expense.toFixed(2),
    extra_expense: +extraExpense.toFixed(2),
    salary: +salary.toFixed(2),
    net: +(income - expense - salary).toFixed(2),
    byExpenseCategory: byCategory,
  };
}

// ================================================================
// Enhanced dashboardStats — income + expense + receivables
// ================================================================

// Money-summary numbers (income / expense / extra / net) for a specified date range.
// Blank/null `from` or `to` means unbounded on that side (all-time). Matches
// dashboardStatsPlus() semantics: income = payments + quote_payments,
// expense = deducted-only paid_amount, extra = non-deducted amount, net = income - expense.
function dashboardMoneyForRange(from, to) {
  const clauseFrom = from ? ' AND payment_date >= @from' : '';
  const clauseTo = to ? ' AND payment_date <= @to' : '';
  const expFrom = from ? ' AND expense_date >= @from' : '';
  const expTo = to ? ' AND expense_date <= @to' : '';
  const payFrom = from ? ' AND paid_date >= @from' : '';
  const payTo = to ? ' AND paid_date <= @to' : '';
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;

  // Income = invoice payments + quote payments + free-form incomes (no invoice/quotation)
  const incomeDateFrom = from ? ' AND income_date >= @from' : '';
  const incomeDateTo = to ? ' AND income_date <= @to' : '';
  const income = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE 1=1${clauseFrom}${clauseTo}`).get(params).s +
    db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE 1=1${clauseFrom}${clauseTo}`).get(params).s +
    db.prepare(`SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE 1=1${incomeDateFrom}${incomeDateTo}`).get(params).s
  );
  const expense = db.prepare(
    `SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1${expFrom}${expTo}`
  ).get(params).s;
  const extra = db.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE deduct_from_income = 0${expFrom}${expTo}`
  ).get(params).s;
  // Salary paid out — only counts entries with paid_date set (real cashflow).
  const salary = db.prepare(
    `SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL${payFrom}${payTo}`
  ).get(params).s;
  return {
    income: +income.toFixed(2),
    expense: +expense.toFixed(2),
    extra_expense: +extra.toFixed(2),
    salary: +salary.toFixed(2),
    net: +(income - expense - salary).toFixed(2),
  };
}

function dashboardStatsPlus() {
  const base = dashboardStats();
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthKey = monthStart.toISOString().slice(0, 10);
  const yearStart = new Date(monthStart.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const paidThisMonth = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ?').get(monthKey).s +
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ?').get(monthKey).s +
    db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ?').get(monthKey).s
  );
  const paidThisYear = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE payment_date >= ?').get(yearStart).s +
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments WHERE payment_date >= ?').get(yearStart).s +
    db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes WHERE income_date >= ?').get(yearStart).s
  );
  const paidAllTime = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM payments').get().s +
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM quote_payments').get().s +
    db.prepare('SELECT COALESCE(SUM(received_amount), 0) AS s FROM incomes').get().s
  );
  const expDed = (fromDate) =>
    (fromDate
      ? db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1 AND expense_date >= ?').get(fromDate).s
      : db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM expenses WHERE deduct_from_income = 1').get().s);
  const expExtra = (fromDate) =>
    (fromDate
      ? db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE deduct_from_income = 0 AND expense_date >= ?').get(fromDate).s
      : db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE deduct_from_income = 0').get().s);
  // Salary paid — counts entries with a paid_date set. Filter is on paid_date
  // (actual cashflow), not the payroll period, mirroring how expenses use expense_date.
  const salaryPaid = (fromDate) =>
    (fromDate
      ? db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL AND paid_date >= ?').get(fromDate).s
      : db.prepare('SELECT COALESCE(SUM(paid_amount), 0) AS s FROM payroll_entries WHERE paid_date IS NOT NULL').get().s);

  const expenseThisMonth = expDed(monthKey);
  const expenseThisYear = expDed(yearStart);
  const expenseAllTime = expDed(null);
  const extraThisMonth = expExtra(monthKey);
  const extraThisYear = expExtra(yearStart);
  const extraAllTime = expExtra(null);
  const salaryThisMonth = salaryPaid(monthKey);
  const salaryThisYear = salaryPaid(yearStart);
  const salaryAllTime = salaryPaid(null);

  // Top 5 extra-expense items (with category + vendor + date) so the dashboard
  // surfaces WHAT is classified as extra, not just the total.
  const extraItems = db.prepare(
    `SELECT e.id, e.expense_date, e.amount, e.description, e.category,
            v.name AS vendor_name
       FROM expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
      WHERE e.deduct_from_income = 0
      ORDER BY e.expense_date DESC
      LIMIT 8`
  ).all();

  // Vendor payables snapshot for the dashboard (aggregate of unpaid/partial expenses)
  const payablesRow = db.prepare(
    'SELECT COALESCE(SUM(amount - paid_amount), 0) AS s, COUNT(*) AS c FROM expenses WHERE amount > paid_amount'
  ).get();
  const topPayables = db.prepare(
    `SELECT COALESCE(e.vendor_name, v.name) AS vendor_name,
            SUM(e.amount - e.paid_amount) AS balance,
            COUNT(*) AS items
       FROM expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
      WHERE e.amount > e.paid_amount
      GROUP BY COALESCE(e.vendor_id, e.vendor_name)
      ORDER BY balance DESC
      LIMIT 5`
  ).all();

  const recv = receivablesReport();
  const invoiceCount = db.prepare('SELECT COUNT(*) AS c FROM invoices').get().c;
  const employeeCount = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE is_active = 1').get().c;
  // Employee advances still owed to the company — same math as the
  // Advances Outstanding report so the numbers match everywhere.
  const advOut = advancesOutstanding();
  return {
    ...base,
    income: {
      this_month: +paidThisMonth.toFixed(2),
      this_year: +paidThisYear.toFixed(2),
      all_time: +paidAllTime.toFixed(2),
    },
    expense: {
      this_month: +expenseThisMonth.toFixed(2),
      this_year: +expenseThisYear.toFixed(2),
      all_time: +expenseAllTime.toFixed(2),
    },
    extra_expense: {
      this_month: +extraThisMonth.toFixed(2),
      this_year: +extraThisYear.toFixed(2),
      all_time: +extraAllTime.toFixed(2),
      recent_items: extraItems,
    },
    salary: {
      this_month: +salaryThisMonth.toFixed(2),
      this_year: +salaryThisYear.toFixed(2),
      all_time: +salaryAllTime.toFixed(2),
    },
    net: {
      this_month: +(paidThisMonth - expenseThisMonth - salaryThisMonth).toFixed(2),
      this_year: +(paidThisYear - expenseThisYear - salaryThisYear).toFixed(2),
      all_time: +(paidAllTime - expenseAllTime - salaryAllTime).toFixed(2),
    },
    receivables: {
      total_outstanding: recv.total_outstanding,
      aging: recv.aging,
      top_customers: recv.by_customer.slice(0, 5),
    },
    payables: {
      total_owed: +payablesRow.s.toFixed(2),
      item_count: payablesRow.c,
      top_vendors: topPayables.map((r) => ({
        vendor_name: r.vendor_name || '(no vendor)',
        balance: +r.balance.toFixed(2),
        items: r.items,
      })),
    },
    invoiceCount,
    employeeCount,
    advances_outstanding: {
      total: +Number(advOut.total_outstanding || 0).toFixed(2),
      employee_count: (advOut.rows || []).length,
      top_employees: (advOut.rows || []).slice(0, 5),
    },
    trend: monthlyTrend(12),
    expenseByCategory: expenseStats().byCategory,
    pipeline: pipelineStats(),
    followUps: listPendingQuotations(5),
  };
}

// ================================================================
// HR — SHIFTS + EMPLOYEES + ATTENDANCE + LEAVES
// ================================================================

function listShifts() { return db.prepare('SELECT * FROM shifts ORDER BY id').all(); }
function createShift(s) {
  const info = db.prepare(
    'INSERT INTO shifts (name, start_time, end_time, hours_per_day) VALUES (@name, @start_time, @end_time, @hours_per_day)'
  ).run({ name: s.name, start_time: s.start_time || '', end_time: s.end_time || '', hours_per_day: Number(s.hours_per_day) || 8 });
  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(info.lastInsertRowid);
}
function updateShift(s) {
  db.prepare('UPDATE shifts SET name=@name, start_time=@start_time, end_time=@end_time, hours_per_day=@hours_per_day WHERE id=@id').run({
    id: s.id, name: s.name, start_time: s.start_time || '', end_time: s.end_time || '', hours_per_day: Number(s.hours_per_day) || 8,
  });
  return db.prepare('SELECT * FROM shifts WHERE id = ?').get(s.id);
}
function deleteShift(id) { db.prepare('DELETE FROM shifts WHERE id = ?').run(id); return { ok: true }; }

function listEmployees() {
  return db.prepare(
    `SELECT e.*, s.name AS shift_name
     FROM employees e LEFT JOIN shifts s ON s.id = e.shift_id
     ORDER BY e.is_active DESC, e.name COLLATE NOCASE`
  ).all();
}
function getEmployee(id) {
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}
function _empPayload(e) {
  return {
    name: e.name,
    code: e.code || '',
    role: e.role || '',
    phone: e.phone || '',
    email: e.email || '',
    address: e.address || '',
    joining_date: e.joining_date || null,
    shift_id: e.shift_id || null,
    pay_mode: ['monthly', 'weekly', 'per_shift'].includes(e.pay_mode) ? e.pay_mode : 'monthly',
    basic_salary: Number(e.basic_salary) || 0,
    hra: Number(e.hra) || 0,
    allowances: Number(e.allowances) || 0,
    per_day_rate: Number(e.per_day_rate) || 0,
    weekly_salary: Number(e.weekly_salary) || 0,
    per_shift_rate: Number(e.per_shift_rate) || 0,
    bank_account: e.bank_account || '',
    bank_ifsc: e.bank_ifsc || '',
    is_active: e.is_active === false || e.is_active === 0 ? 0 : 1,
    notes: e.notes || '',
  };
}
function createEmployee(e) {
  const info = db.prepare(
    `INSERT INTO employees (name, code, role, phone, email, address, joining_date, shift_id, pay_mode,
       basic_salary, hra, allowances, per_day_rate, weekly_salary, per_shift_rate,
       bank_account, bank_ifsc, is_active, notes)
     VALUES (@name, @code, @role, @phone, @email, @address, @joining_date, @shift_id, @pay_mode,
       @basic_salary, @hra, @allowances, @per_day_rate, @weekly_salary, @per_shift_rate,
       @bank_account, @bank_ifsc, @is_active, @notes)`
  ).run(_empPayload(e));
  return getEmployee(info.lastInsertRowid);
}
function updateEmployee(e) {
  db.prepare(
    `UPDATE employees SET name=@name, code=@code, role=@role, phone=@phone, email=@email, address=@address,
       joining_date=@joining_date, shift_id=@shift_id, pay_mode=@pay_mode,
       basic_salary=@basic_salary, hra=@hra, allowances=@allowances, per_day_rate=@per_day_rate,
       weekly_salary=@weekly_salary, per_shift_rate=@per_shift_rate,
       bank_account=@bank_account, bank_ifsc=@bank_ifsc, is_active=@is_active, notes=@notes WHERE id=@id`
  ).run({ ..._empPayload(e), id: e.id });
  return getEmployee(e.id);
}
function deleteEmployee(id) { db.prepare('DELETE FROM employees WHERE id = ?').run(id); return { ok: true }; }

function listAttendance(filters = {}) {
  const where = [];
  const params = {};
  if (filters.employee_id) { where.push('employee_id = @employee_id'); params.employee_id = filters.employee_id; }
  if (filters.from) { where.push('att_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('att_date <= @to'); params.to = filters.to; }
  const sql = 'SELECT a.*, e.name AS employee_name FROM attendance a JOIN employees e ON e.id = a.employee_id'
    + (where.length ? ' WHERE ' + where.map((w) => w.replace('employee_id', 'a.employee_id').replace('att_date', 'a.att_date')).join(' AND ') : '')
    + ' ORDER BY a.att_date DESC, e.name';
  return db.prepare(sql).all(params);
}
function upsertAttendance(a) {
  const shifts = Number(a.shifts_worked);
  const shiftsWorked = Number.isFinite(shifts) ? shifts : 0;
  let status = a.status;
  if (!status) {
    if (shiftsWorked >= 1) status = 'Present';
    else if (shiftsWorked > 0) status = 'Half';
    else status = 'Absent';
  }
  // Normalize shift_ids to a JSON string of numbers
  let shiftIdsJson = '[]';
  if (Array.isArray(a.shift_ids)) {
    shiftIdsJson = JSON.stringify(a.shift_ids.map(Number).filter((x) => Number.isFinite(x)));
  } else if (typeof a.shift_ids === 'string') {
    shiftIdsJson = a.shift_ids;
  }
  db.prepare(
    `INSERT INTO attendance (employee_id, att_date, status, shifts_worked, shift_ids, hours, notes)
     VALUES (@employee_id, @att_date, @status, @shifts_worked, @shift_ids, @hours, @notes)
     ON CONFLICT(employee_id, att_date) DO UPDATE SET
       status=excluded.status, shifts_worked=excluded.shifts_worked,
       shift_ids=excluded.shift_ids, hours=excluded.hours, notes=excluded.notes`
  ).run({
    employee_id: a.employee_id,
    att_date: a.att_date,
    status,
    shifts_worked: shiftsWorked,
    shift_ids: shiftIdsJson,
    hours: a.hours != null ? Number(a.hours) : null,
    notes: a.notes || '',
  });
  return db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND att_date = ?').get(a.employee_id, a.att_date);
}
function deleteAttendance(id) { db.prepare('DELETE FROM attendance WHERE id = ?').run(id); return { ok: true }; }

function attendanceMatrix(period /* 'YYYY-MM' or 'YYYY-MM-DD..YYYY-MM-DD' */) {
  // Range form: 'YYYY-MM-DD..YYYY-MM-DD' — used by the weekly Attendance view.
  if (period && period.includes('..')) {
    const [start, end] = period.split('..');
    const emps = db.prepare('SELECT id, name, code FROM employees WHERE is_active = 1 ORDER BY name').all();
    const rows = db.prepare('SELECT * FROM attendance WHERE att_date >= ? AND att_date <= ?').all(start, end);
    // For range mode, key by full date (YYYY-MM-DD) rather than day-of-month.
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.employee_id)) map.set(r.employee_id, {});
      map.get(r.employee_id)[r.att_date] = r;
    }
    // Enumerate dates in range
    const dates = [];
    const s = new Date(start), e = new Date(end);
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    return {
      period, mode: 'range', start, end, dates,
      employees: emps.map((e) => ({ ...e, byDate: map.get(e.id) || {} })),
    };
  }
  // Monthly form (default, kept for back compat)
  const [y, m] = period.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const start = period + '-01';
  const end = period + '-' + String(days).padStart(2, '0');
  const emps = db.prepare('SELECT id, name, code FROM employees WHERE is_active = 1 ORDER BY name').all();
  const rows = db.prepare('SELECT * FROM attendance WHERE att_date >= ? AND att_date <= ?').all(start, end);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.employee_id)) map.set(r.employee_id, {});
    map.get(r.employee_id)[r.att_date.slice(-2)] = r;
  }
  return { period, mode: 'month', days, employees: emps.map((e) => ({ ...e, byDay: map.get(e.id) || {} })) };
}

function listLeaves(filters = {}) {
  const where = [];
  const params = {};
  if (filters.employee_id) { where.push('employee_id = @employee_id'); params.employee_id = filters.employee_id; }
  if (filters.from) { where.push('from_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('to_date <= @to'); params.to = filters.to; }
  const sql = 'SELECT l.*, e.name AS employee_name FROM leaves l JOIN employees e ON e.id = l.employee_id'
    + (where.length ? ' WHERE ' + where.map(w => w.replace('employee_id', 'l.employee_id').replace('from_date', 'l.from_date').replace('to_date', 'l.to_date')).join(' AND ') : '')
    + ' ORDER BY l.from_date DESC';
  return db.prepare(sql).all(params);
}
function createLeave(l) {
  const info = db.prepare(
    `INSERT INTO leaves (employee_id, from_date, to_date, days, leave_type, status, reason)
     VALUES (@employee_id, @from_date, @to_date, @days, @leave_type, @status, @reason)`
  ).run({
    employee_id: l.employee_id, from_date: l.from_date, to_date: l.to_date,
    days: Number(l.days) || 1,
    leave_type: l.leave_type || 'Casual',
    status: l.status || 'Approved',
    reason: l.reason || '',
  });
  return db.prepare('SELECT * FROM leaves WHERE id = ?').get(info.lastInsertRowid);
}
function deleteLeave(id) { db.prepare('DELETE FROM leaves WHERE id = ?').run(id); return { ok: true }; }

// ================================================================
// PAYROLL
// ================================================================

function daysInMonth(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Days inclusive between two YYYY-MM-DD strings
function daysBetweenIncl(startDate, endDate) {
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

// Universal payroll compute. Signature:
//   computePayroll(employeeId, periodStart, periodEnd)     — date range (preferred)
//   computePayroll(employeeId, 'YYYY-MM')                  — backward compat, monthly
function computePayroll(employeeId, arg2, arg3) {
  const emp = getEmployee(employeeId);
  if (!emp) return null;
  let start, end;
  if (arg3) {
    start = arg2;
    end = arg3;
  } else {
    // period 'YYYY-MM'
    start = arg2 + '-01';
    end = arg2 + '-' + String(daysInMonth(arg2)).padStart(2, '0');
  }
  const workingDays = daysBetweenIncl(start, end);
  const att = db
    .prepare('SELECT status, shifts_worked FROM attendance WHERE employee_id = ? AND att_date >= ? AND att_date <= ?')
    .all(employeeId, start, end);

  const dayCount = { Present: 0, Half: 0, Absent: 0, Leave: 0 };
  let totalShifts = 0;
  for (const r of att) {
    dayCount[r.status] = (dayCount[r.status] || 0) + 1;
    totalShifts += Number(r.shifts_worked) || 0;
  }
  const daysPresent = dayCount.Present + 0.5 * dayCount.Half;
  const daysLeave = dayCount.Leave;
  const daysAbsent = dayCount.Absent;
  const paidDays = daysPresent + daysLeave;

  const payMode = emp.pay_mode || 'monthly';
  const basic = Number(emp.basic_salary) || 0;
  const hra = Number(emp.hra) || 0;
  const allowances = Number(emp.allowances) || 0;
  const weeklySalary = Number(emp.weekly_salary) || 0;
  const perShiftRate = Number(emp.per_shift_rate) || 0;

  let finalGross = 0;
  if (payMode === 'per_shift') {
    finalGross = +(totalShifts * perShiftRate).toFixed(2);
  } else if (payMode === 'weekly') {
    // Prorate weekly salary by paid days in the period
    finalGross = +(weeklySalary * (paidDays / 7)).toFixed(2);
  } else {
    // monthly — prorate the monthly salary using a per-day rate (monthly / 30).
    // The previous formula prorated over the period length (basic × paidDays/workingDays),
    // which paid a monthly employee 5/7ths of full monthly salary for a 5-day week — way too much.
    const monthly = basic + hra + allowances;
    const perDay = monthly / 30;
    finalGross = +(perDay * paidDays).toFixed(2);
    // If per_day_rate is explicitly set, prefer that (labour-style day-rate override)
    const explicitPerDay = Number(emp.per_day_rate) || 0;
    if (explicitPerDay > 0) finalGross = +(explicitPerDay * daysPresent).toFixed(2);
  }

  // Advance deduction default = total outstanding balance of advances made on/before period end.
  // Outstanding per advance = amount - SUM(advance_deductions.amount). User can override
  // this default per-entry via setPayrollAdvanceDeduction.
  const advanceRow = db.prepare(
    `SELECT COALESCE(SUM(a.amount - COALESCE(dsum.deducted, 0)), 0) AS s
       FROM advances a
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) dsum
              ON dsum.advance_id = a.id
      WHERE a.employee_id = ? AND a.advance_date <= ?`
  ).get(employeeId, end);
  const advanceDeduction = +advanceRow.s.toFixed(2);

  const deductions = 0;
  const netPay = +(finalGross - deductions - advanceDeduction).toFixed(2);

  return {
    employee_id: employeeId,
    period_start: start,
    period_end: end,
    period: start.slice(0, 7),
    days_present: daysPresent,
    days_leave: daysLeave,
    days_absent: daysAbsent,
    working_days: workingDays,
    shifts_worked: +totalShifts.toFixed(2),
    pay_mode: payMode,
    per_shift_rate: perShiftRate,
    weekly_salary: payMode === 'weekly' ? weeklySalary : 0,
    basic: payMode === 'monthly' ? basic : 0,
    hra: payMode === 'monthly' ? hra : 0,
    allowances: payMode === 'monthly' ? allowances : 0,
    deductions,
    advance_deduction: advanceDeduction,
    gross: finalGross,
    net_pay: netPay,
  };
}

function listPayrollRuns() {
  return db.prepare(
    `SELECT r.*,
        (SELECT COUNT(*) FROM payroll_entries WHERE run_id = r.id) AS entry_count,
        (SELECT COALESCE(SUM(net_pay), 0) FROM payroll_entries WHERE run_id = r.id) AS total_net
      FROM payroll_runs r ORDER BY r.period DESC`
  ).all();
}

// Every payroll entry a specific employee has been part of, across all runs.
// Used by the Employee Detail page to show a complete pay history in one place.
function listPayrollEntriesForEmployee(employeeId) {
  return db.prepare(
    `SELECT pe.*,
            r.period AS run_period, r.period_start AS run_start, r.period_end AS run_end,
            r.run_date AS run_generated_date
       FROM payroll_entries pe
       JOIN payroll_runs r ON r.id = pe.run_id
      WHERE pe.employee_id = ?
      ORDER BY COALESCE(r.period_end, r.period) DESC, pe.id DESC`
  ).all(employeeId);
}

function getPayrollRun(id) {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(id);
  if (!run) return null;
  const entries = db.prepare(
    `SELECT pe.*, e.name AS employee_name, e.code AS employee_code, e.role AS employee_role
     FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id
     WHERE pe.run_id = ? ORDER BY e.name`
  ).all(id);
  return { ...run, entries };
}

// runPayroll(periodStart, periodEnd, notes) — new date-range API
// runPayroll('YYYY-MM', notes)              — backward compat monthly
function runPayroll(startOrPeriod, endOrNotes, maybeNotes) {
  let periodStart, periodEnd, notes, periodKey;
  if (endOrNotes && /^\d{4}-\d{2}-\d{2}$/.test(endOrNotes)) {
    periodStart = startOrPeriod;
    periodEnd = endOrNotes;
    notes = maybeNotes || '';
    periodKey = `${periodStart}_to_${periodEnd}`;
  } else if (/^\d{4}-\d{2}$/.test(startOrPeriod)) {
    // Legacy monthly
    periodStart = startOrPeriod + '-01';
    periodEnd = startOrPeriod + '-' + String(daysInMonth(startOrPeriod)).padStart(2, '0');
    notes = endOrNotes || '';
    periodKey = startOrPeriod;
  } else {
    throw new Error('runPayroll: bad arguments');
  }

  const existing = db.prepare('SELECT id FROM payroll_runs WHERE period = ?').get(periodKey);
  if (existing) throw new Error(`Payroll for ${periodKey} already exists (id=${existing.id}). Delete it first.`);
  const emps = db.prepare('SELECT id FROM employees WHERE is_active = 1').all();

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO payroll_runs (period, period_start, period_end, run_date, notes) VALUES (?, ?, ?, ?, ?)')
      .run(periodKey, periodStart, periodEnd, new Date().toISOString().slice(0, 10), notes);
    const runId = info.lastInsertRowid;
    const ins = db.prepare(
      `INSERT INTO payroll_entries (run_id, employee_id, period, days_present, days_leave, days_absent,
         working_days, shifts_worked, pay_mode, per_shift_rate, weekly_salary,
         basic, hra, allowances, deductions, advance_deduction, gross, net_pay, paid)
       VALUES (@run_id, @employee_id, @period, @days_present, @days_leave, @days_absent,
         @working_days, @shifts_worked, @pay_mode, @per_shift_rate, @weekly_salary,
         @basic, @hra, @allowances, @deductions, @advance_deduction, @gross, @net_pay, 0)`
    );
    for (const e of emps) {
      const p = computePayroll(e.id, periodStart, periodEnd);
      if (p) {
        ins.run({ ...p, period: periodKey, run_id: runId });
        if (p.advance_deduction > 0) {
          applyAdvanceDeduction(runId, e.id, p.advance_deduction, periodEnd);
        }
      }
    }
    return runId;
  });
  return getPayrollRun(tx());
}

// Generate a payroll entry for JUST one employee (for a chosen period).
//   • If no run exists for the period → creates a new run with just this employee's entry.
//   • If a run exists but the employee isn't in it → appends this employee's entry to the run.
//   • If the employee is already in the run → throws (delete their entry first via Payroll page).
// Used by the Employee Detail page's "Generate payroll" button so you can pay a single
// person without waiting for the weekly full-team run.
function runPayrollForEmployee(employeeId, periodStart, periodEnd, notes = '') {
  if (!periodStart || !periodEnd) throw new Error('periodStart and periodEnd required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  const emp = db.prepare('SELECT id, name, is_active FROM employees WHERE id = ?').get(employeeId);
  if (!emp) throw new Error('Employee not found');

  const periodKey = `${periodStart}_to_${periodEnd}`;

  const tx = db.transaction(() => {
    // Get-or-create the run for this period
    let run = db.prepare('SELECT * FROM payroll_runs WHERE period = ?').get(periodKey);
    let runId;
    if (run) {
      runId = run.id;
      // Refuse if this employee is already in the run — prevents double-entries
      const existingEntry = db
        .prepare('SELECT id FROM payroll_entries WHERE run_id = ? AND employee_id = ?')
        .get(runId, employeeId);
      if (existingEntry) {
        throw new Error(
          `${emp.name} already has a payroll entry for ${periodStart} → ${periodEnd}. ` +
          'Open it from the Payroll page (or delete the run) if you need to recompute.'
        );
      }
    } else {
      const info = db.prepare(
        'INSERT INTO payroll_runs (period, period_start, period_end, run_date, notes) VALUES (?, ?, ?, ?, ?)'
      ).run(periodKey, periodStart, periodEnd, new Date().toISOString().slice(0, 10), notes || `Single-employee run for ${emp.name}`);
      runId = info.lastInsertRowid;
    }

    // Compute this employee's entry
    const p = computePayroll(employeeId, periodStart, periodEnd);
    if (!p) throw new Error('Failed to compute payroll for this employee');

    db.prepare(
      `INSERT INTO payroll_entries (run_id, employee_id, period, days_present, days_leave, days_absent,
         working_days, shifts_worked, pay_mode, per_shift_rate, weekly_salary,
         basic, hra, allowances, deductions, advance_deduction, gross, net_pay, paid)
       VALUES (@run_id, @employee_id, @period, @days_present, @days_leave, @days_absent,
         @working_days, @shifts_worked, @pay_mode, @per_shift_rate, @weekly_salary,
         @basic, @hra, @allowances, @deductions, @advance_deduction, @gross, @net_pay, 0)`
    ).run({ ...p, period: periodKey, run_id: runId });

    if (p.advance_deduction > 0) {
      applyAdvanceDeduction(runId, employeeId, p.advance_deduction, periodEnd);
    }
    return { runId, entry: p };
  });

  const result = tx();
  // Return the freshly-inserted entry joined with run info (matches listPayrollEntriesForEmployee shape)
  return db.prepare(
    `SELECT pe.*, r.period AS run_period, r.period_start AS run_start, r.period_end AS run_end,
            r.run_date AS run_generated_date
       FROM payroll_entries pe
       JOIN payroll_runs r ON r.id = pe.run_id
      WHERE pe.run_id = ? AND pe.employee_id = ?`
  ).get(result.runId, employeeId);
}

// List the deduction trail for an advance (which runs recovered how much, in order).
// Used by the Employees Advances view to show the recovery history per row.
function listAdvanceDeductions(filters = {}) {
  const where = [];
  const params = {};
  if (filters.advance_id) { where.push('d.advance_id = @advance_id'); params.advance_id = filters.advance_id; }
  if (filters.employee_id) { where.push('d.employee_id = @employee_id'); params.employee_id = filters.employee_id; }
  if (filters.run_id) { where.push('d.run_id = @run_id'); params.run_id = filters.run_id; }
  const sql =
    `SELECT d.*, r.period AS run_period, r.period_start AS run_start, r.period_end AS run_end
       FROM advance_deductions d
       LEFT JOIN payroll_runs r ON r.id = d.run_id`
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY d.created_at ASC, d.id ASC';
  return db.prepare(sql).all(params);
}

// Apply a total `deductionAmount` for `employeeId` in `runId`, FIFO across their outstanding
// advances (oldest first). Rebuilds any previously-recorded advance_deductions for this
// (run, employee) so it's safe to call repeatedly with a new total. Also refreshes each
// touched advance's `adjusted_in_run_id` — set when fully recovered, else nullable.
function applyAdvanceDeduction(runId, employeeId, deductionAmount, endDate) {
  // 1. Wipe any prior deductions from THIS run for THIS employee
  db.prepare('DELETE FROM advance_deductions WHERE run_id = ? AND employee_id = ?').run(runId, employeeId);
  // Reset adjusted_in_run_id for advances that WERE tied to this run (they might not
  // deserve the tag anymore after our reallocation).
  db.prepare('UPDATE advances SET adjusted_in_run_id = NULL WHERE employee_id = ? AND adjusted_in_run_id = ?').run(employeeId, runId);

  let remaining = Math.max(0, Number(deductionAmount) || 0);
  if (remaining <= 0) return { applied: 0 };

  // 2. Pull all outstanding advances for this employee (FIFO by date, id tiebreaker)
  const outstanding = db.prepare(
    `SELECT a.id, a.amount, COALESCE(dsum.deducted, 0) AS deducted
       FROM advances a
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) dsum
              ON dsum.advance_id = a.id
      WHERE a.employee_id = ? AND a.advance_date <= ?
        AND (a.amount - COALESCE(dsum.deducted, 0)) > 0.001
      ORDER BY a.advance_date ASC, a.id ASC`
  ).all(employeeId, endDate);

  const insDeduction = db.prepare(
    'INSERT INTO advance_deductions (advance_id, run_id, employee_id, amount) VALUES (?, ?, ?, ?)'
  );
  const markFullyDeducted = db.prepare(
    'UPDATE advances SET adjusted_in_run_id = ? WHERE id = ?'
  );

  let applied = 0;
  for (const a of outstanding) {
    if (remaining <= 0) break;
    const balance = a.amount - a.deducted;
    const take = Math.min(balance, remaining);
    if (take > 0.001) {
      insDeduction.run(a.id, runId, employeeId, +take.toFixed(2));
      remaining -= take;
      applied += take;
      // If this advance is now fully deducted, tag it with this run (informational)
      if (Math.abs((a.deducted + take) - a.amount) < 0.01) {
        markFullyDeducted.run(runId, a.id);
      }
    }
  }
  return { applied: +applied.toFixed(2), unapplied: +remaining.toFixed(2) };
}

// User overrides advance_deduction on a payroll entry (e.g. "recover only ₹1000 this
// run, carry the remaining ₹6000 to next weeks"). Recomputes net_pay and re-applies
// the deductions FIFO. Blocked if the entry is already paid.
function setPayrollAdvanceDeduction(entryId, newAmount) {
  const entry = db.prepare(
    `SELECT pe.id, pe.run_id, pe.employee_id, pe.gross, pe.deductions, pe.advance_deduction, pe.paid,
            r.period_end
       FROM payroll_entries pe
       JOIN payroll_runs r ON r.id = pe.run_id
      WHERE pe.id = ?`
  ).get(entryId);
  if (!entry) throw new Error('Payroll entry not found');
  if (entry.paid) throw new Error('This entry is already fully paid — cannot change the advance deduction.');
  const desired = Math.max(0, Number(newAmount) || 0);
  // Cap at current outstanding + what's already tied to this run (allow bumping back up if user later wants more)
  const alreadyThisRun = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) AS s FROM advance_deductions WHERE run_id = ? AND employee_id = ?'
  ).get(entry.run_id, entry.employee_id).s;
  const otherOutstanding = db.prepare(
    `SELECT COALESCE(SUM(a.amount - COALESCE(dsum.deducted, 0)), 0) AS s
       FROM advances a
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) dsum
              ON dsum.advance_id = a.id
      WHERE a.employee_id = ? AND a.advance_date <= ?`
  ).get(entry.employee_id, entry.period_end).s;
  const maxDeductable = +(otherOutstanding + alreadyThisRun).toFixed(2);
  if (desired > maxDeductable + 0.01) {
    throw new Error(`Cannot deduct ₹${desired.toFixed(2)} — total outstanding is only ₹${maxDeductable.toFixed(2)}`);
  }

  const tx = db.transaction(() => {
    applyAdvanceDeduction(entry.run_id, entry.employee_id, desired, entry.period_end);
    const gross = Number(entry.gross) || 0;
    const other = Number(entry.deductions) || 0;
    const netPay = +(gross - other - desired).toFixed(2);
    db.prepare(
      'UPDATE payroll_entries SET advance_deduction = ?, net_pay = ? WHERE id = ?'
    ).run(+desired.toFixed(2), netPay, entryId);
  });
  tx();
  return db.prepare('SELECT * FROM payroll_entries WHERE id = ?').get(entryId);
}

// Record a payment against a payroll entry.
//   amount <= balance  → normal pay (partial or full)
//   amount >  balance  → pay the balance to close the entry, insert a NEW advance for the excess
//                        (so next payroll run recovers it — matches business flow of "over-paid today,
//                        recover from future weeks")
//   amount omitted     → pays the full remaining balance
function payPayrollEntry(entryId, amount, paidDate) {
  const e = db.prepare('SELECT id, employee_id, net_pay, paid_amount, paid FROM payroll_entries WHERE id = ?').get(entryId);
  if (!e) throw new Error('Payroll entry not found');
  const net = Number(e.net_pay) || 0;
  const alreadyPaid = Number(e.paid_amount) || 0;
  const balance = Math.max(0, net - alreadyPaid);
  const date = paidDate || new Date().toISOString().slice(0, 10);

  // Zero-balance path: nothing owed on this entry (full leave, or advance ate the salary).
  // Mark paid=1 so it drops off the pending list. If the user still handed over money,
  // the full amount becomes a fresh advance for future recovery.
  if (balance <= 0.001) {
    const extra = (amount == null || amount === '') ? 0 : Number(amount);
    const tx0 = db.transaction(() => {
      if (!e.paid) {
        db.prepare('UPDATE payroll_entries SET paid = 1, paid_date = ? WHERE id = ?').run(date, entryId);
      }
      if (extra > 0.01) {
        db.prepare(
          `INSERT INTO advances (employee_id, advance_date, amount, mode, notes)
           VALUES (?, ?, ?, ?, ?)`
        ).run(e.employee_id, date, extra, 'Cash',
          `Over-payment on zero-balance payroll entry #${entryId} — recorded as advance for future recovery.`);
      }
    });
    tx0();
    return db.prepare('SELECT * FROM payroll_entries WHERE id = ?').get(entryId);
  }

  let add = amount == null || amount === '' ? balance : Number(amount);
  if (!Number.isFinite(add) || add <= 0) throw new Error('Payment amount must be > 0');

  const payThisEntry = Math.min(add, balance);
  const excess = +(add - payThisEntry).toFixed(2);

  const tx = db.transaction(() => {
    if (payThisEntry > 0) {
      const newPaid = +(alreadyPaid + payThisEntry).toFixed(2);
      const fullyPaid = newPaid + 0.001 >= net ? 1 : 0;
      db.prepare(
        'UPDATE payroll_entries SET paid_amount = ?, paid = ?, paid_date = ? WHERE id = ?'
      ).run(newPaid, fullyPaid, date, entryId);
    }
    // Over-payment → the extra amount is a NEW advance the employee owes back.
    if (excess > 0.01) {
      db.prepare(
        `INSERT INTO advances (employee_id, advance_date, amount, mode, notes)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        e.employee_id,
        date,
        excess,
        'Cash',
        `Over-payment on payroll entry #${entryId} — recorded as advance for future recovery.`
      );
    }
  });
  tx();
  return db.prepare('SELECT * FROM payroll_entries WHERE id = ?').get(entryId);
}

// Back-compat alias — old callers that expected "mark fully paid" still work.
function markPayrollEntryPaid(entryId, paidDate) {
  return payPayrollEntry(entryId, null, paidDate);
}

function deletePayrollRun(id) {
  // Deleting a run frees up its advances (ON DELETE SET NULL takes care of adjusted_in_run_id)
  db.prepare('DELETE FROM payroll_runs WHERE id = ?').run(id);
  return { ok: true };
}

// Recompute all entries in a run using the CURRENT attendance + employee data.
// Preserves the run itself + paid_date on entries that were already paid.
// This is the "refresh" action when attendance changes after the run was generated.
function recalculatePayrollRun(runId) {
  const run = db.prepare('SELECT * FROM payroll_runs WHERE id = ?').get(runId);
  if (!run) throw new Error('Run not found');
  const start = run.period_start || (run.period + '-01');
  const end = run.period_end || (run.period + '-' + String(daysInMonth(run.period)).padStart(2, '0'));

  // Snapshot state so we don't lose it on rebuild.
  // - Paid amounts (payment tracking) — restored per employee
  // - Manually-set advance_deduction — restored per employee (user's per-run recovery choice)
  const before = db.prepare(
    'SELECT employee_id, paid, paid_date, paid_amount, advance_deduction FROM payroll_entries WHERE run_id = ?'
  ).all(runId);
  const beforeMap = new Map(before.map((p) => [p.employee_id, p]));

  const emps = db.prepare('SELECT id FROM employees WHERE is_active = 1').all();

  const tx = db.transaction(() => {
    // Wipe deductions from this run (they'll be re-applied per-entry below)
    db.prepare('DELETE FROM advance_deductions WHERE run_id = ?').run(runId);
    db.prepare('UPDATE advances SET adjusted_in_run_id = NULL WHERE adjusted_in_run_id = ?').run(runId);
    db.prepare('DELETE FROM payroll_entries WHERE run_id = ?').run(runId);

    const ins = db.prepare(
      `INSERT INTO payroll_entries (run_id, employee_id, period, days_present, days_leave, days_absent,
         working_days, shifts_worked, pay_mode, per_shift_rate, weekly_salary,
         basic, hra, allowances, deductions, advance_deduction, gross, net_pay, paid, paid_amount, paid_date)
       VALUES (@run_id, @employee_id, @period, @days_present, @days_leave, @days_absent,
         @working_days, @shifts_worked, @pay_mode, @per_shift_rate, @weekly_salary,
         @basic, @hra, @allowances, @deductions, @advance_deduction, @gross, @net_pay, @paid, @paid_amount, @paid_date)`
    );
    for (const e of emps) {
      const p = computePayroll(e.id, start, end);
      if (!p) continue;
      const prior = beforeMap.get(e.id);
      // Preserve user's manual advance override if one existed AND it's still valid (<= current outstanding).
      // Otherwise fall back to the computed default (full outstanding).
      let advance = p.advance_deduction;
      if (prior && prior.advance_deduction != null) {
        const override = Number(prior.advance_deduction) || 0;
        // The override was the user's choice; cap at current outstanding + already-tied-to-this-run (fresh after our wipe = 0)
        const outstandingNow = p.advance_deduction; // full outstanding (nothing tied to this run yet)
        advance = Math.min(override, outstandingNow);
      }
      const netPay = +((p.gross || 0) - (p.deductions || 0) - advance).toFixed(2);
      ins.run({
        ...p,
        advance_deduction: +advance.toFixed(2),
        net_pay: netPay,
        period: run.period,
        run_id: runId,
        paid: prior?.paid ? 1 : 0,
        paid_amount: Number(prior?.paid_amount) || 0,
        paid_date: prior?.paid_date || null,
      });
      if (advance > 0) applyAdvanceDeduction(runId, e.id, advance, end);
    }
  });
  tx();
  return getPayrollRun(runId);
}

// ================================================================
// AUTO-WEEKLY payroll — generates every Saturday for Sun-Sat range.
// Salary period is Sunday → Saturday (7 days). Sunday work in a given week
// counts toward THAT week's Saturday payout (per user's rule: "if I work
// this Sunday, it goes on next Saturday's salary").
// So for today's date, we compute the Sun→Sat that INCLUDES the current
// (or most recent past) Saturday.
// ================================================================
function _sundayOf(d) {
  // Sunday = start of that week. Returns the Sunday <= d.
  const day = d.getDay(); // 0=Sun..6=Sat
  const s = new Date(d);
  s.setDate(d.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}
function _isoDay(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function runWeeklyPayrollIfDue() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  // Find the target Saturday. If today is Sat, use today. If Sun, use YESTERDAY (previous Sat).
  // Any other day, use the most recent past Saturday.
  const targetSat = new Date(now);
  if (dow === 6) {
    // today is Saturday — use today
  } else if (dow === 0) {
    targetSat.setDate(now.getDate() - 1); // yesterday
  } else {
    // Mon-Fri: go back to last Saturday
    targetSat.setDate(now.getDate() - (dow + 1));
  }
  targetSat.setHours(0, 0, 0, 0);
  // Sunday of that week = 6 days before the target Saturday
  const targetSun = new Date(targetSat);
  targetSun.setDate(targetSat.getDate() - 6);

  const periodStart = _isoDay(targetSun);
  const periodEnd = _isoDay(targetSat);
  const periodKey = `${periodStart}_to_${periodEnd}`;

  const existing = db.prepare('SELECT id FROM payroll_runs WHERE period = ?').get(periodKey);
  if (existing) return { created: false, reason: 'already_generated', runId: existing.id, period: periodKey };

  const empCount = db.prepare('SELECT COUNT(*) AS c FROM employees WHERE is_active = 1').get().c;
  if (empCount === 0) return { created: false, reason: 'no_active_employees', period: periodKey };

  // Gate 1: on Saturday, only auto-generate after 6pm (users mark attendance during the day).
  // Sun-Fri: no time gate — attendance for last Sat should already be locked in.
  if (dow === 6 && now.getHours() < 18) {
    return { created: false, reason: 'before_6pm', period: periodKey };
  }

  // Gate 2: at least one employee must have attendance marked for the target Saturday.
  // Without this, auto-run would generate a payroll where everyone shows 0 shifts.
  const satAttendanceCount = db
    .prepare('SELECT COUNT(*) AS c FROM attendance WHERE att_date = ?')
    .get(periodEnd).c;
  if (satAttendanceCount === 0) {
    return { created: false, reason: 'no_saturday_attendance', period: periodKey };
  }

  try {
    const run = runPayroll(periodStart, periodEnd, `Auto-generated on ${_isoDay(now)} (weekly Sun-Sat payroll)`);
    return { created: true, run, period: periodKey };
  } catch (e) {
    return { created: false, reason: 'error', error: String(e.message || e), period: periodKey };
  }
}

// ================================================================
// ADVANCES
// ================================================================

function listAdvances(filters = {}) {
  const where = [];
  const params = {};
  if (filters.employee_id) { where.push('a.employee_id = @employee_id'); params.employee_id = filters.employee_id; }
  if (filters.from) { where.push('a.advance_date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('a.advance_date <= @to'); params.to = filters.to; }
  // "unadjusted" now means "still has outstanding balance" (fully-deducted rows are filtered out)
  if (filters.unadjusted) where.push('(a.amount - COALESCE(dsum.deducted, 0)) > 0.001');
  const sql =
    `SELECT a.*, e.name AS employee_name, r.period AS adjusted_period,
            COALESCE(dsum.deducted, 0) AS deducted_amount,
            (a.amount - COALESCE(dsum.deducted, 0)) AS outstanding
       FROM advances a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN payroll_runs r ON r.id = a.adjusted_in_run_id
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) dsum
              ON dsum.advance_id = a.id`
    + (where.length ? ' WHERE ' + where.join(' AND ') : '')
    + ' ORDER BY a.advance_date DESC, a.id DESC';
  return db.prepare(sql).all(params);
}

function createAdvance(a) {
  const info = db.prepare(
    'INSERT INTO advances (employee_id, advance_date, amount, mode, reference, notes) VALUES (@employee_id, @advance_date, @amount, @mode, @reference, @notes)'
  ).run({
    employee_id: a.employee_id,
    advance_date: a.advance_date,
    amount: Number(a.amount) || 0,
    mode: a.mode || 'Cash',
    reference: a.reference || '',
    notes: a.notes || '',
  });
  return db.prepare('SELECT * FROM advances WHERE id = ?').get(info.lastInsertRowid);
}

function updateAdvance(a) {
  // Only allow editing advances with NO partial deductions applied yet — otherwise
  // the amount is partly recovered and we'd be retroactively changing money paid out.
  const row = db.prepare('SELECT id FROM advances WHERE id = ?').get(a.id);
  if (!row) throw new Error('Advance not found');
  const anyDeduction = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM advance_deductions WHERE advance_id = ?')
    .get(a.id).s;
  if (anyDeduction > 0) {
    throw new Error('Cannot edit an advance that has been partially or fully recovered. Delete the affected payroll run first.');
  }
  db.prepare(
    `UPDATE advances SET advance_date=@advance_date, amount=@amount, mode=@mode,
       reference=@reference, notes=@notes WHERE id=@id`
  ).run({
    id: a.id,
    advance_date: a.advance_date,
    amount: Number(a.amount) || 0,
    mode: a.mode || 'Cash',
    reference: a.reference || '',
    notes: a.notes || '',
  });
  return db.prepare('SELECT * FROM advances WHERE id = ?').get(a.id);
}

function deleteAdvance(id) {
  const row = db.prepare('SELECT id FROM advances WHERE id = ?').get(id);
  if (!row) return { ok: false, error: 'Not found' };
  const anyDeduction = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM advance_deductions WHERE advance_id = ?')
    .get(id).s;
  if (anyDeduction > 0) {
    throw new Error('Cannot delete an advance that has been partially or fully recovered. Delete the affected payroll run first.');
  }
  db.prepare('DELETE FROM advances WHERE id = ?').run(id);
  return { ok: true };
}

function employeeAdvanceSummary(employeeId) {
  const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM advances WHERE employee_id = ?').get(employeeId).s;
  // Outstanding = SUM over each advance of (amount - deducted-so-far). Deductions come from
  // advance_deductions table (each row = one partial recovery in a specific payroll run).
  const outstanding = db.prepare(
    `SELECT COALESCE(SUM(a.amount - COALESCE(d.deducted, 0)), 0) AS s
       FROM advances a
       LEFT JOIN (SELECT advance_id, SUM(amount) AS deducted FROM advance_deductions GROUP BY advance_id) d
              ON d.advance_id = a.id
      WHERE a.employee_id = ?`
  ).get(employeeId).s;
  return { total: +total.toFixed(2), outstanding: +outstanding.toFixed(2) };
}

// ================================================================
// SAMPLE DATA SEEDER — fills every table with realistic dummy data
// spread across the last 3 months so all reports/charts have something to render.
// ================================================================
function seedSampleData() {
  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const monthsAgoFirst = (n) => {
    const d = new Date(today.getFullYear(), today.getMonth() - n, 1);
    return d.toISOString().slice(0, 10);
  };

  // ---- Customers
  const customerIds = [];
  const customers = [
    { name: 'Sri Sakthi Constructions', contact_person: 'Mr. Ravi', phone: '9876543210', email: 'sakthi@ex.com', gstin: '33ABCDE1234F1Z5', address: '123 Nehru Rd', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' },
    { name: 'Anandan Textiles', contact_person: 'Anandan', phone: '9876543211', email: 'a@textile.in', gstin: '33XYZAB1234C1D5', address: '45 Mill St', city: 'Tirupur', state: 'Tamil Nadu', pincode: '641604' },
    { name: 'Green Farms Pvt Ltd', contact_person: 'Mr. Selvan', phone: '9876543212', email: 'green@farms.in', gstin: '33LMN1234EF1G5', address: '78 Farm Road', city: 'Erode', state: 'Tamil Nadu', pincode: '638001' },
    { name: 'BluePrint Architects', contact_person: 'Ms. Priya', phone: '9876543213', email: 'priya@blueprint.in', gstin: '', address: '9 Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    { name: 'Krishna Rice Mills', contact_person: 'Krishna Iyer', phone: '9876543214', email: '', gstin: '33KRI1234SH1N5', address: 'Mill Road', city: 'Salem', state: 'Tamil Nadu', pincode: '636001' },
  ];
  for (const c of customers) {
    const r = createCustomer(c);
    customerIds.push(r.id);
  }

  // ---- Vendors
  const vendorIds = [];
  const vendors = [
    { name: 'Sri Steel & Iron', phone: '8765432100', gstin: '33STEEL1234K1L5', notes: 'MS rods, sheets' },
    { name: 'City Hardware', phone: '8765432101', gstin: '', notes: 'Nuts, bolts, fittings' },
    { name: 'Bharat Cement Depot', phone: '8765432102', gstin: '33CEMENT12F1G5', notes: 'Cement, sand, aggregates' },
    { name: 'ElectroMax Wiring', phone: '8765432103', gstin: '33ELEC1234K1L5', notes: 'Cables, MCBs, switches' },
  ];
  for (const v of vendors) {
    const r = createVendor(v);
    vendorIds.push(r.id);
  }

  // ---- Products
  const productIds = [];
  const products = [
    { name: 'MS Gate Sliding + Openable', hsn_code: '7308', unit: 'Nos', rate: 82000, gst_rate: 18, category: 'Fabrication' },
    { name: 'MS Gate Roller Channel', hsn_code: '7308', unit: 'Ft', rate: 380, gst_rate: 18, category: 'Fabrication' },
    { name: 'UPVC Roofing Sheet 3mm', hsn_code: '3925', unit: 'Sqft', rate: 180, gst_rate: 18, category: 'Roofing' },
    { name: 'GI Roofing Sheet 0.5mm', hsn_code: '7210', unit: 'Sqft', rate: 95, gst_rate: 18, category: 'Roofing' },
    { name: 'CPVC Pipe 1"', hsn_code: '3917', unit: 'Ft', rate: 42, gst_rate: 18, category: 'Plumbing' },
    { name: 'Copper Wire 1.5 sqmm', hsn_code: '8544', unit: 'M', rate: 22, gst_rate: 18, category: 'Electrical' },
    { name: 'Site Fabrication Labour', hsn_code: '998873', unit: 'Day', rate: 1200, gst_rate: 18, category: 'Labour' },
    { name: 'Plumbing Installation Service', hsn_code: '995461', unit: 'Job', rate: 6000, gst_rate: 18, category: 'Labour' },
    { name: 'Transport / Delivery', hsn_code: '996511', unit: 'Trip', rate: 1200, gst_rate: 18, category: 'Transport' },
  ];
  for (const p of products) {
    const r = createProduct(p);
    productIds.push(r.id);
  }

  // ---- Shifts (split half-shifts through the day)
  const s1 = createShift({ name: 'Early morning', start_time: '06:00', end_time: '09:00', hours_per_day: 3 });
  const s2 = createShift({ name: 'Morning', start_time: '09:00', end_time: '14:00', hours_per_day: 5 });
  const s3 = createShift({ name: 'Afternoon', start_time: '14:00', end_time: '18:00', hours_per_day: 4 });
  const s4 = createShift({ name: 'Evening', start_time: '18:00', end_time: '21:00', hours_per_day: 3 });

  const employees = [
    // Per-shift labour (different rates per person)
    { name: 'Ramesh Kumar', code: 'EMP001', role: 'Fitter', phone: '9111111111', joining_date: daysAgo(200), shift_id: s2.id, pay_mode: 'per_shift', per_shift_rate: 950, weekly_salary: 0, basic_salary: 0, hra: 0, allowances: 0, per_day_rate: 0, is_active: 1 },
    { name: 'Suresh M', code: 'EMP002', role: 'Welder', phone: '9111111112', joining_date: daysAgo(150), shift_id: s2.id, pay_mode: 'per_shift', per_shift_rate: 850, weekly_salary: 0, basic_salary: 0, hra: 0, allowances: 0, per_day_rate: 0, is_active: 1 },
    // Weekly salary
    { name: 'Mahesh P', code: 'EMP003', role: 'Helper', phone: '9111111113', joining_date: daysAgo(90), shift_id: s3.id, pay_mode: 'weekly', weekly_salary: 4500, per_shift_rate: 0, basic_salary: 0, hra: 0, allowances: 0, per_day_rate: 0, is_active: 1 },
    // Monthly salary
    { name: 'Dinesh V', code: 'EMP004', role: 'Electrician', phone: '9111111114', joining_date: daysAgo(60), shift_id: s2.id, pay_mode: 'monthly', per_shift_rate: 0, weekly_salary: 0, basic_salary: 25000, hra: 5000, allowances: 2500, per_day_rate: 0, is_active: 1 },
  ];
  const empIds = [];
  for (const e of employees) {
    const r = createEmployee(e);
    empIds.push(r.id);
  }

  // Attendance for last 60 days — each employee may work 1-4 half-shifts per day
  // Weighted so most days = 2 shifts (full day), occasional 1/3/4, some absent/leave
  const pattern = [2, 2, 2, 2, 2, 2, 2, 3, 3, 4, 1, 0, 0]; // 0 = absent
  for (const empId of empIds) {
    for (let d = 60; d >= 1; d--) {
      const date = daysAgo(d);
      const dow = new Date(date).getDay();
      if (dow === 0) continue; // Sunday off
      const n = pattern[Math.floor(Math.random() * pattern.length)];
      if (n === 0) {
        upsertAttendance({ employee_id: empId, att_date: date, status: 'Absent', shifts_worked: 0 });
      } else {
        upsertAttendance({ employee_id: empId, att_date: date, status: n >= 2 ? 'Present' : 'Half', shifts_worked: n });
      }
    }
  }

  // A leave record per employee
  createLeave({ employee_id: empIds[0], from_date: daysAgo(20), to_date: daysAgo(19), days: 2, leave_type: 'Sick', status: 'Approved', reason: 'Fever' });
  createLeave({ employee_id: empIds[1], from_date: daysAgo(10), to_date: daysAgo(10), days: 1, leave_type: 'Casual', status: 'Approved', reason: 'Personal' });

  // Advances (some outstanding, some to be adjusted in payroll)
  createAdvance({ employee_id: empIds[0], advance_date: daysAgo(15), amount: 5000, mode: 'Cash', notes: 'Festival advance' });
  createAdvance({ employee_id: empIds[2], advance_date: daysAgo(8), amount: 2000, mode: 'UPI', notes: 'Emergency' });

  // ---- Quotations spread across last 3 months (mix of statuses)
  const subjects = [
    'Main gate fabrication + installation',
    'Roofing work at godown',
    'Plumbing rework in office block',
    'Wiring for new shed',
    'Steel structure supply',
    'Site labour + material',
    'GI roofing sheet supply',
    'Complete fabrication contract',
    'Water pipeline upgrade',
    'Emergency repair works',
  ];
  const quoteResults = [];
  for (let i = 0; i < 12; i++) {
    const daysBack = Math.floor(Math.random() * 80) + 5;
    const custId = customerIds[i % customerIds.length];
    const items = [];
    const nItems = 1 + Math.floor(Math.random() * 3);
    for (let j = 0; j < nItems; j++) {
      const p = products[Math.floor(Math.random() * products.length)];
      items.push({
        product_id: null,
        name: p.name,
        hsn_code: p.hsn_code,
        unit: p.unit,
        quantity: 1 + Math.floor(Math.random() * 20),
        rate: p.rate,
        gst_rate: p.gst_rate,
      });
    }
    const q = createQuotation({
      customer_id: custId,
      quote_date: daysAgo(daysBack),
      subject: subjects[i % subjects.length],
      terms: getSettings().default_terms || '',
      items,
    });
    quoteResults.push(q);
  }

  // Mark ~60% billed, ~20% lost, rest pending. Add payments on billed ones.
  quoteResults.forEach((q, i) => {
    if (i % 5 === 0) return; // pending
    if (i % 5 === 1) {
      updateQuotationStatus(q.id, 'Lost');
      return;
    }
    // billed
    updateQuotationStatus(q.id, 'Billed');
    // partial or full payment
    const days = Math.floor(Math.random() * 30);
    const amt = i % 3 === 0 ? q.grand_total : +(q.grand_total * (0.3 + Math.random() * 0.5)).toFixed(2);
    addQuotePayment({
      quotation_id: q.id,
      payment_date: daysAgo(days),
      amount: amt,
      mode: ['Cash', 'UPI', 'Bank Transfer', 'Cheque'][i % 4],
      reference: 'TXN' + (10000 + i),
    });
  });

  // ---- Invoices (convert some billed quotes)
  const billed = quoteResults.filter((_, i) => i % 5 >= 2);
  for (let i = 0; i < Math.min(4, billed.length); i++) {
    convertQuotationToInvoice(billed[i].id, { due_date: daysAgo(-15) });
  }

  // ---- Expenses (mix of deducted and extra, across categories and months)
  const categories = ['Labour', 'Material', 'Transport', 'Utilities', 'Refreshments', 'Rent', 'Misc'];
  for (let i = 0; i < 40; i++) {
    const daysBack = Math.floor(Math.random() * 80) + 1;
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const amt = cat === 'Refreshments' ? 100 + Math.floor(Math.random() * 500)
              : cat === 'Rent' ? 15000
              : cat === 'Utilities' ? 500 + Math.floor(Math.random() * 3000)
              : 800 + Math.floor(Math.random() * 8000);
    const vendorName = vendors[Math.floor(Math.random() * vendors.length)].name;
    const items = cat === 'Material' && Math.random() > 0.5
      ? [
          { name: 'MS Round Bar', size: '12mm', weight: '45 kg', unit: 'kg', quantity: 45, rate: 65, amount: 2925 },
          { name: 'MS Angle', size: '25x25', weight: '18 kg', unit: 'kg', quantity: 18, rate: 62, amount: 1116 },
        ]
      : [];
    const finalAmount = items.length > 0 ? items.reduce((s, it) => s + it.amount, 0) : amt;
    createExpense({
      expense_date: daysAgo(daysBack),
      category: cat,
      amount: finalAmount,
      vendor_name: vendorName,
      description: cat + ' expense entry',
      payment_mode: ['Cash', 'UPI', 'Bank Transfer'][Math.floor(Math.random() * 3)],
      // ~15% are "extra" (not deducted from income)
      deduct_from_income: Math.random() > 0.85 ? 0 : 1,
      items,
    });
  }

  // ---- Payroll runs for last 2 months
  const period1 = monthsAgoFirst(2).slice(0, 7);
  const period0 = monthsAgoFirst(1).slice(0, 7);
  try { runPayroll(period1, 'Auto-seeded'); } catch (_e) {}
  try { runPayroll(period0, 'Auto-seeded'); } catch (_e) {}

  return { ok: true, message: 'Sample data seeded' };
}

function wipeAllData() {
  const tables = ['payroll_entries', 'payroll_runs', 'advances', 'attendance', 'leaves', 'employees', 'shifts',
                  'payments', 'quote_payments', 'invoice_items', 'invoices', 'expense_items', 'expenses', 'vendors',
                  'quotation_items', 'quotations', 'customers', 'products'];
  const tx = db.transaction(() => {
    for (const t of tables) {
      try { db.exec(`DELETE FROM ${t}`); } catch (_e) {}
    }
    try { db.exec("DELETE FROM sqlite_sequence WHERE name != 'users'"); } catch (_e) {}
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'quote_next_number'").run();
    db.prepare("UPDATE settings SET value = '1' WHERE key = 'invoice_next_number'").run();
  });
  tx();
  return { ok: true, message: 'All data wiped' };
}

module.exports = {
  init,
  getUserDataDir,
  getAssetsDir,
  login,
  changePassword,
  listUsers,
  getUser,
  createUser,
  updateUser,
  adminResetPassword,
  deleteUser,
  getSettings,
  updateSettings,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listQuotations,
  getQuotation,
  peekNextQuoteNumber,
  createQuotation,
  updateQuotation,
  deleteQuotation,
  updateQuotationStatus,
  dashboardStats: dashboardStatsPlus,
  getLatestOrDemoQuotation,
  // Invoices
  listInvoices,
  getInvoice,
  peekNextInvoiceNumber,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  convertQuotationToInvoice,
  addPayment,
  deletePayment,
  listPayments,
  receivablesReport,
  // Vendors
  listVendors,
  vendorSummary,
  listVendorPayments,
  createVendorPayment,
  deleteVendorPayment,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
  // Expenses
  listIncomes,
  getIncome,
  createIncome,
  updateIncome,
  recordIncomePayment,
  deleteIncome,
  incomeStats,
  listExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  expenseCategories,
  expenseStats,
  // Reports
  monthlyTrend,
  profitLossReport,
  cashflowReport,
  salesReport,
  gstReport,
  attendanceSummary,
  payrollRegister,
  advancesOutstanding,
  customerReport,
  vendorReport,
  pipelineStats,
  listPendingQuotations,
  markQuotationBilled,
  markQuotationLost,
  markQuotationPending,
  addQuotePayment,
  deleteQuotePayment,
  listQuotePayments,
  // HR — shifts
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  // HR — employees
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  // HR — attendance
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  attendanceMatrix,
  creditReport,
  recordExpensePayment,
  // HR — leaves
  listLeaves,
  createLeave,
  deleteLeave,
  // Payroll
  listPayrollRuns,
  listPayrollEntriesForEmployee,
  runWeeklyPayrollIfDue,
  recalculatePayrollRun,
  dashboardTrend,
  dashboardTrendForRange,
  dashboardMoneyForRange,
  getPayrollRun,
  runPayroll,
  runPayrollForEmployee,
  computePayroll,
  markPayrollEntryPaid,
  payPayrollEntry,
  setPayrollAdvanceDeduction,
  listAdvanceDeductions,
  deletePayrollRun,
  // Advances
  listAdvances,
  createAdvance,
  updateAdvance,
  deleteAdvance,
  employeeAdvanceSummary,
  // Dev / admin helpers
  seedSampleData,
  wipeAllData,
};
