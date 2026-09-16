// HTTP shim that mimics window.api (the Electron preload bridge) using fetch,
// so the same React code runs in the Electron desktop app AND in a web browser.

async function req(method, path, body) {
  const opts = {
    method,
    credentials: 'include', // session cookie
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function openFilePicker(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(val);
    };
    input.onchange = () => finish(input.files?.[0] || null);
    input.oncancel = () => finish(null);
    // Fallback in case the browser fires no cancel event: resolve null after a while if no change
    setTimeout(() => finish(null), 120000);
    input.click();
  });
}

async function uploadImage(kind) {
  const accept = kind === 'receipt' ? 'image/png,image/jpeg,image/jpg,application/pdf' : 'image/png,image/jpeg,image/jpg';
  const file = await openFilePicker(accept);
  if (!file) return null;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/upload/${kind}`, {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return data.path;
}

export function createHttpApi() {
  return {
    auth: {
      login: (creds) => req('POST', '/auth/login', creds),
      logout: () => req('POST', '/auth/logout'),
      whoami: async () => {
        try {
          return await req('GET', '/auth/whoami');
        } catch (_e) {
          return null;
        }
      },
      changePassword: (payload) => req('POST', '/auth/change-password', payload),
    },
    settings: {
      get: () => req('GET', '/settings'),
      update: (patch) => req('PATCH', '/settings', patch),
    },
    products: {
      list: () => req('GET', '/products'),
      create: (p) => req('POST', '/products', p),
      update: (p) => req('PATCH', `/products/${p.id}`, p),
      remove: (id) => req('DELETE', `/products/${id}`),
    },
    customers: {
      list: () => req('GET', '/customers'),
      create: (c) => req('POST', '/customers', c),
      update: (c) => req('PATCH', `/customers/${c.id}`, c),
      remove: (id) => req('DELETE', `/customers/${id}`),
    },
    quotations: {
      list: () => req('GET', '/quotations'),
      get: (id) => req('GET', `/quotations/${id}`),
      nextNumber: () => req('GET', '/quotations/next-number'),
      create: (q) => req('POST', '/quotations', q),
      update: (q) => req('PATCH', `/quotations/${q.id}`, q),
      remove: (id) => req('DELETE', `/quotations/${id}`),
      updateStatus: (id, status) => req('PATCH', `/quotations/${id}/status`, { status }),
      markBilled: (id) => req('POST', `/quotations/${id}/mark-billed`),
      markLost: (id) => req('POST', `/quotations/${id}/mark-lost`),
      markPending: (id) => req('POST', `/quotations/${id}/mark-pending`),
      latestOrDemo: () => req('GET', '/quotations/latest-or-demo'),
    },
    quotePayments: {
      add: (p) => req('POST', '/quote-payments', p),
      remove: (id) => req('DELETE', `/quote-payments/${id}`),
    },
    advances: {
      list: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/advances' + qs);
      },
      create: (a) => req('POST', '/advances', a),
      update: (a) => req('PATCH', `/advances/${a.id}`, a),
      remove: (id) => req('DELETE', `/advances/${id}`),
      deductions: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/advances/deductions' + qs);
      },
      summary: (empId) => req('GET', `/advances/summary/${empId}`),
    },
    admin: {
      seedSampleData: () => req('POST', '/admin/seed-sample-data'),
      wipeAllData: () => req('POST', '/admin/wipe-all-data'),
    },
    adminUsers: {
      list: () => req('GET', '/admin/users'),
      create: (u) => req('POST', '/admin/users', u),
      update: (u) => req('PATCH', `/admin/users/${u.id}`, u),
      resetPassword: (id, newPassword) => req('POST', `/admin/users/${id}/reset-password`, { newPassword }),
      remove: (id) => req('DELETE', `/admin/users/${id}`),
    },
    invoices: {
      list: () => req('GET', '/invoices'),
      get: (id) => req('GET', `/invoices/${id}`),
      nextNumber: () => req('GET', '/invoices/next-number'),
      create: (inv) => req('POST', '/invoices', inv),
      update: (inv) => req('PATCH', `/invoices/${inv.id}`, inv),
      remove: (id) => req('DELETE', `/invoices/${id}`),
      convertFromQuotation: (quotationId, extras) =>
        req('POST', '/invoices/convert-from-quotation', { quotationId, extras }),
      receivables: () => req('GET', '/invoices/receivables'),
    },
    payments: {
      add: (p) => req('POST', '/payments', p),
      remove: (id) => req('DELETE', `/payments/${id}`),
    },
    vendors: {
      list: () => req('GET', '/vendors'),
      create: (v) => req('POST', '/vendors', v),
      update: (v) => req('PATCH', `/vendors/${v.id}`, v),
      remove: (id) => req('DELETE', `/vendors/${id}`),
      summary: (id) => req('GET', `/vendors/${id}/summary`),
      payments: (id) => req('GET', `/vendors/${id}/payments`),
      pay: (id, payment) => req('POST', `/vendors/${id}/payments`, payment),
      removePayment: (paymentId) => req('DELETE', `/vendor-payments/${paymentId}`),
    },
    incomes: {
      list: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString() : '';
        return req('GET', '/incomes' + qs);
      },
      get: (id) => req('GET', `/incomes/${id}`),
      create: (i) => req('POST', '/incomes', i),
      update: (i) => req('PUT', `/incomes/${i.id}`, i),
      recordPayment: (id, amount) => req('POST', `/incomes/${id}/record-payment`, { amount }),
      remove: (id) => req('DELETE', `/incomes/${id}`),
      stats: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString() : '';
        return req('GET', '/incomes/stats' + qs);
      },
    },
    expenses: {
      list: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/expenses' + qs);
      },
      get: (id) => req('GET', `/expenses/${id}`),
      create: (e) => req('POST', '/expenses', e),
      update: (e) => req('PATCH', `/expenses/${e.id}`, e),
      remove: (id) => req('DELETE', `/expenses/${id}`),
      categories: () => req('GET', '/expenses/categories'),
      stats: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/expenses/stats' + qs);
      },
      recordPayment: (id, amount) => req('POST', `/expenses/${id}/record-payment`, { amount }),
    },
    dashboard: {
      stats: () => req('GET', '/dashboard/stats'),
      moneyForRange: (from, to) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return req('GET', `/dashboard/money-for-range${suffix}`);
      },
    },
    pdf: {
      preview: (id) => req('GET', `/pdf/preview/${id}`),
      export: async (id) => {
        const link = document.createElement('a');
        link.href = `/api/pdf/export/${id}`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return { canceled: false };
      },
      designerPreview: (patch) => req('POST', '/pdf/designer-preview', patch),
      previewInvoice: (id) => req('GET', `/pdf/preview-invoice/${id}`),
      exportInvoice: async (id) => {
        const link = document.createElement('a');
        link.href = `/api/pdf/export-invoice/${id}`;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return { canceled: false };
      },
    },
    dialog: {
      pickLogo: () => uploadImage('logo'),
      pickWatermark: () => uploadImage('watermark'),
      pickReceipt: () => uploadImage('receipt'),
    },
    reports: {
      monthlyTrend: (months) => req('GET', '/reports/monthly-trend' + (months ? `?months=${months}` : '')),
      dashboardTrend: (granularity, count) => {
        const qs = new URLSearchParams();
        if (granularity) qs.set('granularity', granularity);
        if (count) qs.set('count', String(count));
        return req('GET', '/reports/dashboard-trend' + (qs.toString() ? '?' + qs : ''));
      },
      dashboardTrendForRange: (from, to) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        return req('GET', '/reports/dashboard-trend-for-range' + (qs.toString() ? '?' + qs : ''));
      },
      profitLoss: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/profit-loss' + qs);
      },
      cashflow: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/cashflow' + qs);
      },
      sales: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/sales' + qs);
      },
      gst: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/gst' + qs);
      },
      attendance: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/attendance' + qs);
      },
      payrollRegister: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/payroll-register' + qs);
      },
      advancesOutstanding: () => req('GET', '/reports/advances-outstanding'),
      customers: () => req('GET', '/reports/customers'),
      vendors: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/vendors' + qs);
      },
      credit: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/reports/credit' + qs);
      },
      pdf: (payload) => req('POST', '/reports/pdf', payload),
      pipeline: () => req('GET', '/reports/pipeline'),
      pendingQuotations: (limit) => req('GET', '/reports/pending-quotations' + (limit ? `?limit=${limit}` : '')),
    },
    shifts: {
      list: () => req('GET', '/shifts'),
      create: (s) => req('POST', '/shifts', s),
      update: (s) => req('PATCH', `/shifts/${s.id}`, s),
      remove: (id) => req('DELETE', `/shifts/${id}`),
    },
    employees: {
      list: () => req('GET', '/employees'),
      get: (id) => req('GET', `/employees/${id}`),
      create: (e) => req('POST', '/employees', e),
      update: (e) => req('PATCH', `/employees/${e.id}`, e),
      remove: (id) => req('DELETE', `/employees/${id}`),
    },
    attendance: {
      list: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/attendance' + qs);
      },
      upsert: (a) => req('POST', '/attendance', a),
      remove: (id) => req('DELETE', `/attendance/${id}`),
      matrix: (period) => req('GET', `/attendance/matrix?period=${period}`),
    },
    leaves: {
      list: (filters) => {
        const qs = filters ? '?' + new URLSearchParams(filters).toString() : '';
        return req('GET', '/leaves' + qs);
      },
      create: (l) => req('POST', '/leaves', l),
      remove: (id) => req('DELETE', `/leaves/${id}`),
    },
    payroll: {
      list: () => req('GET', '/payroll/runs'),
      get: (id) => req('GET', `/payroll/runs/${id}`),
      entriesForEmployee: (employee_id) => req('GET', `/payroll/entries/for-employee/${employee_id}`),
      runForEmployee: (employee_id, period_start, period_end, notes) =>
        req('POST', '/payroll/run-for-employee', { employee_id, period_start, period_end, notes }),
      preview: (employee_id, period) =>
        req('GET', `/payroll/preview?employee_id=${employee_id}&period=${period}`),
      previewRange: (employee_id, period_start, period_end) =>
        req('GET', `/payroll/preview?employee_id=${employee_id}&period_start=${period_start}&period_end=${period_end}`),
      run: (period, notes) => req('POST', '/payroll/runs', { period, notes }),
      runRange: (period_start, period_end, notes) =>
        req('POST', '/payroll/runs', { period_start, period_end, notes }),
      markPaid: (entry_id, paid_date) =>
        req('POST', `/payroll/entries/${entry_id}/mark-paid`, { paid_date }),
      pay: (entry_id, amount, paid_date) =>
        req('POST', `/payroll/entries/${entry_id}/pay`, { amount, paid_date }),
      setAdvanceDeduction: (entry_id, amount) =>
        req('POST', `/payroll/entries/${entry_id}/set-advance`, { amount }),
      remove: (id) => req('DELETE', `/payroll/runs/${id}`),
      autoRunIfDue: () => req('POST', '/payroll/auto-run'),
      recalculate: (id) => req('POST', `/payroll/runs/${id}/recalculate`),
    },
  };
}

// Attach to window.api if not already present (i.e. we're running in a plain browser, not Electron)
export function installIfBrowser() {
  if (typeof window === 'undefined') return false;
  if (window.api) return false; // Electron already provided one via preload
  window.api = createHttpApi();
  window.__MRL_WEB__ = true;
  return true;
}
