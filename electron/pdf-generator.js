const PdfPrinter = require('pdfmake');
const path = require('node:path');
const fs = require('node:fs');

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const printer = new PdfPrinter(fonts);

// ---- Default design tokens (used as fallbacks) ----
const DEFAULT = {
  brand: '#2b48d0',
  brandDark: '#1a2766',
  brandSoft: '#eef4ff',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  white: '#ffffff',
  fontBase: 9.5,
  fontHeading: 16,
  fontTitle: 12,
  logoSize: 60,
  quoteTitle: 'QUOTATION',
  watermarkSize: 420,
  watermarkOpacity: 0.14,
  watermarkX: 0,
  watermarkY: 0,
};

function bool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v) === 'true';
}
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v, fallback) {
  return v == null || v === '' ? fallback : String(v);
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safe(s) {
  return s == null ? '' : String(s);
}

// Roboto / Helvetica (pdfmake built-ins) do not include U+20B9 (₹).
// Replace with "Rs. " for anything that will render into the PDF so we don't
// get the placeholder glyph ("1"/box) that we saw in reports.
function pdfSafe(s) {
  if (s == null) return '';
  return String(s)
    .replace(/₹/g, 'Rs.')
    .replace(/[←→↔➔➜]/g, '-')
    .replace(/ /g, ' ');
}

function numberToWordsIndian(num) {
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  const words = inWords(rupees);
  let out = `${words} Rupees`;
  if (paise > 0) out += ` and ${inWords(paise)} Paise`;
  return `${out} Only`;
}

function inWords(num) {
  if (num === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ' ' + a[n % 10] : ''}`);
  const three = (n) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${h ? a[h] + ' Hundred' + (r ? ' ' : '') : ''}${r ? two(r) : ''}`;
  };
  let n = num;
  let out = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const rest = n;
  if (crore) out += two(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (rest) out += three(rest);
  return out.trim();
}

function loadImage(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const bin = fs.readFileSync(p);
    const ext = path.extname(p).replace('.', '').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${bin.toString('base64')}`;
  } catch (_e) {
    return null;
  }
}

function buildQuotationPdf(q, s) {
  // -------- Read design tokens with fallbacks --------
  const D = {
    brand: str(s.pdf_brand_color, DEFAULT.brand),
    brandDark: str(s.pdf_brand_dark_color, DEFAULT.brandDark),
    brandSoft: DEFAULT.brandSoft,
    ink: str(s.pdf_text_color, DEFAULT.ink),
    muted: str(s.pdf_muted_color, DEFAULT.muted),
    border: DEFAULT.border,
    white: DEFAULT.white,
    fontBase: num(s.pdf_font_base_size, DEFAULT.fontBase),
    fontHeading: num(s.pdf_font_heading_size, DEFAULT.fontHeading),
    fontTitle: num(s.pdf_font_title_size, DEFAULT.fontTitle),
    logoSize: num(s.pdf_logo_size, DEFAULT.logoSize),
    logoX: num(s.pdf_logo_x_offset, 0),
    logoY: num(s.pdf_logo_y_offset, 0),
    quoteTitle: str(s.pdf_quote_title, DEFAULT.quoteTitle),
    showWatermark: bool(s.pdf_show_watermark, true),
    wmSize: num(s.pdf_watermark_size, DEFAULT.watermarkSize),
    wmOpacity: num(s.pdf_watermark_opacity, DEFAULT.watermarkOpacity),
    wmX: num(s.pdf_watermark_x_offset, DEFAULT.watermarkX),
    wmY: num(s.pdf_watermark_y_offset, DEFAULT.watermarkY),
    showBank: bool(s.pdf_show_bank, true),
    showSignature: bool(s.pdf_show_signature, true),
    showTerms: bool(s.pdf_show_terms, true),
    showNotes: bool(s.pdf_show_notes, true),
    showAmountInWords: bool(s.pdf_show_amount_in_words, true),
    // HSN off by default (quotations don't show it). buildInvoicePdf flips it on
    // for invoice PDFs only.
    showHsn: bool(s.pdf_show_hsn_column, false),
    showUnit: bool(s.pdf_show_unit_column, true),
    showTaxable: bool(s.pdf_show_taxable_column, true),
    showCgst: bool(s.pdf_show_cgst_column, true),
    showSgst: bool(s.pdf_show_sgst_column, true),
    grandTotalSolid: bool(s.pdf_grand_total_solid_bg, true),
    grandTotalFontSize: num(s.pdf_grand_total_font_size, 11),
    // Per-block font sizes
    fontCompany: num(s.pdf_font_company_lines_size, 9),
    fontBillTo: num(s.pdf_font_billTo_size, 9.5),
    fontItems: num(s.pdf_font_items_size, 8.5),
    fontAmountInWords: num(s.pdf_font_amountInWords_size, 10),
    fontTerms: num(s.pdf_font_terms_size, 8.5),
    fontNotes: num(s.pdf_font_notes_size, 8.5),
    fontBank: num(s.pdf_font_bank_size, 9),
    fontSignature: num(s.pdf_font_signature_size, 9),
    fontFooter: num(s.pdf_font_footer_size, 8),
    // Per-field toggles
    showCompanyName: bool(s.pdf_show_company_name, true),
    showCompanyTagline: bool(s.pdf_show_company_tagline, true),
    showCompanyAddress: bool(s.pdf_show_company_address, true),
    showCompanyLocation: bool(s.pdf_show_company_location, true),
    showCompanyContact: bool(s.pdf_show_company_contact, true),
    showQuoteNo: bool(s.pdf_show_quote_no, true),
    showQuoteDate: bool(s.pdf_show_quote_date, true),
    showBillName: bool(s.pdf_show_bill_name, true),
    showBillAttn: bool(s.pdf_show_bill_attn, true),
    showBillAddress: bool(s.pdf_show_bill_address, true),
    showBillLocation: bool(s.pdf_show_bill_location, true),
    showBillPhone: bool(s.pdf_show_bill_phone, true),
    showBillEmail: bool(s.pdf_show_bill_email, true),
    showBillGstin: bool(s.pdf_show_bill_gstin, true),
    showBillSubject: bool(s.pdf_show_bill_subject, true),
    showFooterName: bool(s.pdf_show_footer_name, true),
    showFooterGstin: bool(s.pdf_show_footer_gstin, true),
    showFooterPan: bool(s.pdf_show_footer_pan, true),
    showFooterPhone: bool(s.pdf_show_footer_phone, true),
    showFooterEmail: bool(s.pdf_show_footer_email, true),
    showFooterPage: bool(s.pdf_show_footer_page, true),

    // Alignment
    alignHeader: str(s.pdf_align_header, 'center'),
    alignBillTo: str(s.pdf_align_billTo, 'left'),
    alignTerms: str(s.pdf_align_terms, 'left'),
    alignNotes: str(s.pdf_align_notes, 'left'),
    alignSignature: str(s.pdf_align_signature, 'center'),

    // Per-block position offsets (pt)
    pos: {
      header: [num(s.pdf_pos_header_x, 0), num(s.pdf_pos_header_y, 0)],
      title: [num(s.pdf_pos_title_x, 0), num(s.pdf_pos_title_y, 0)],
      billTo: [num(s.pdf_pos_billTo_x, 0), num(s.pdf_pos_billTo_y, 0)],
      items: [num(s.pdf_pos_items_x, 0), num(s.pdf_pos_items_y, 0)],
      amountInWords: [num(s.pdf_pos_amountInWords_x, 0), num(s.pdf_pos_amountInWords_y, 0)],
      terms: [num(s.pdf_pos_terms_x, 0), num(s.pdf_pos_terms_y, 0)],
      notes: [num(s.pdf_pos_notes_x, 0), num(s.pdf_pos_notes_y, 0)],
      bank: [num(s.pdf_pos_bank_x, 0), num(s.pdf_pos_bank_y, 0)],
      signature: [num(s.pdf_pos_signature_x, 0), num(s.pdf_pos_signature_y, 0)],
      footer: [num(s.pdf_pos_footer_x, 0), num(s.pdf_pos_footer_y, 0)],
    },
  };

  // Wrap a pdfmake block with (x, y) offset via margin adjustments
  const offset = (block, key) => {
    const [x, y] = D.pos[key] || [0, 0];
    if (!x && !y) return block;
    return { stack: [block], margin: [x, y, -x, -y] };
  };

  // Derived font sizes
  const FS = {
    xs: Math.max(6, D.fontBase - 2),
    sm: Math.max(7, D.fontBase - 1),
    base: D.fontBase,
    md: D.fontBase + 1,
    lg: D.fontTitle,
    xl: D.fontHeading,
  };

  const boxLayout = (opts = {}) => ({
    fillColor: (rowIndex) => {
      if (rowIndex === 0 && opts.headerFill) return opts.headerFill;
      return null;
    },
    hLineColor: () => D.border,
    vLineColor: () => D.border,
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    paddingLeft: () => opts.pad ?? 3,
    paddingRight: () => opts.pad ?? 3,
    paddingTop: () => opts.padY ?? 4,
    paddingBottom: () => opts.padY ?? 4,
  });

  const customer = q.customer || q.customer_snapshot || {};
  const logoImage = loadImage(s.logo_path);
  const watermarkImage = D.showWatermark ? loadImage(s.watermark_path) : null;

  // ---------- Centered company header ----------
  const centeredCompany = {
    stack: [
      logoImage
        ? {
            image: logoImage,
            width: D.logoSize,
            height: D.logoSize,
            fit: [D.logoSize, D.logoSize],
            alignment: D.alignHeader,
            margin: [Math.max(0, D.logoX), Math.max(0, D.logoY), Math.max(0, -D.logoX), Math.max(6, 6 - D.logoY)],
          }
        : {},
      D.showCompanyName ? { text: safe(s.company_name), style: 'companyName', alignment: D.alignHeader } : {},
      D.showCompanyTagline && s.company_tagline
        ? { text: safe(s.company_tagline), style: 'companyTag', alignment: D.alignHeader }
        : {},
      D.showCompanyAddress && s.company_address
        ? { text: safe(s.company_address), style: 'companyLine', alignment: D.alignHeader }
        : {},
      D.showCompanyLocation
        ? {
            text: [safe(s.company_city), safe(s.company_state), safe(s.company_pincode)]
              .filter(Boolean)
              .join(', '),
            style: 'companyLine',
            alignment: D.alignHeader,
          }
        : {},
      D.showCompanyContact
        ? {
            text: [
              s.company_phone ? `Phone: ${s.company_phone}` : '',
              s.company_email ? `Email: ${s.company_email}` : '',
              s.company_website ? `Web: ${s.company_website}` : '',
            ]
              .filter(Boolean)
              .join('   |   '),
            style: 'companyLine',
            alignment: D.alignHeader,
          }
        : {},
    ],
  };

  // ---------- Title bar ----------
  const titleCells = [
    {
      text: D.quoteTitle,
      fillColor: D.brand,
      color: D.white,
      bold: true,
      fontSize: FS.lg,
      characterSpacing: 2,
      margin: [12, 7, 12, 7],
    },
  ];
  const titleWidths = ['*'];
  if (D.showQuoteNo) {
    titleCells.push({
      text: `No: ${safe(q.quote_number)}`,
      fillColor: D.brandDark,
      color: D.white,
      bold: true,
      fontSize: FS.base,
      alignment: 'right',
      margin: [12, 7, 12, 7],
    });
    titleWidths.push('auto');
  }
  if (D.showQuoteDate) {
    titleCells.push({
      text: `Date: ${safe(q.quote_date)}`,
      fillColor: D.brandDark,
      color: D.white,
      bold: true,
      fontSize: FS.base,
      alignment: 'right',
      margin: [12, 7, 12, 7],
    });
    titleWidths.push('auto');
  }

  const titleBar = {
    table: { widths: titleWidths, body: [titleCells] },
    layout: 'noBorders',
  };

  // ---------- Bill To ----------
  const billToRows = [];
  if (D.showBillName)
    billToRows.push([{ text: 'Name', style: 'kvLabel' }, { text: safe(customer.name) || '—', style: 'kvValueBold' }]);
  if (D.showBillAttn && customer.contact_person)
    billToRows.push([{ text: 'Attn', style: 'kvLabel' }, { text: safe(customer.contact_person), style: 'kvValue' }]);
  if (D.showBillAddress && customer.address)
    billToRows.push([{ text: 'Address', style: 'kvLabel' }, { text: safe(customer.address), style: 'kvValue' }]);
  const cityLine = [safe(customer.city), safe(customer.state), safe(customer.pincode)].filter(Boolean).join(', ');
  if (D.showBillLocation && cityLine)
    billToRows.push([{ text: 'City', style: 'kvLabel' }, { text: cityLine, style: 'kvValue' }]);
  if (D.showBillPhone && customer.phone)
    billToRows.push([{ text: 'Phone', style: 'kvLabel' }, { text: safe(customer.phone), style: 'kvValue' }]);
  if (D.showBillEmail && customer.email)
    billToRows.push([{ text: 'Email', style: 'kvLabel' }, { text: safe(customer.email), style: 'kvValue' }]);
  if (D.showBillGstin && customer.gstin)
    billToRows.push([{ text: 'GSTIN', style: 'kvLabel' }, { text: safe(customer.gstin), style: 'kvValueBold' }]);
  if (D.showBillSubject && q.subject)
    billToRows.push([{ text: 'Subject', style: 'kvLabel' }, { text: safe(q.subject), style: 'kvValueItalic' }]);

  const billTo = {
    stack: [
      { text: 'QUOTE TO', style: 'sectionTag', margin: [0, 0, 0, 5] },
      {
        table: { widths: [50, '*'], body: billToRows },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 6,
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
      },
    ],
  };

  // ---------- Items table (dynamic columns) ----------
  const anySize = q.items.some((it) => it.size && String(it.size).trim() !== '');
  const anyWeight = q.items.some((it) => it.weight && String(it.weight).trim() !== '');
  const gstMode = q.gst_mode || 'per_line';
  const flatMode = gstMode === 'flat_on_total';

  const columns = ['sno', 'desc'];
  if (D.showHsn) columns.push('hsn');
  if (D.showUnit) columns.push('unit');
  if (anySize) columns.push('size');
  if (anyWeight) columns.push('weight');
  columns.push('qty');
  columns.push('rate');
  if (D.showTaxable) columns.push('taxable');
  // In flat mode, don't clutter the table with per-line CGST/SGST (they'd all be zero)
  if (D.showCgst && !flatMode) columns.push('cgst');
  if (D.showSgst && !flatMode) columns.push('sgst');
  columns.push('total');

  const headerLabel = {
    sno: { text: 'S.No', style: 'thHead', alignment: 'center' },
    desc: { text: 'Description', style: 'thHead' },
    hsn: { text: 'HSN/SAC', style: 'thHead', alignment: 'center' },
    qty: { text: 'Qty', style: 'thHead', alignment: 'right' },
    unit: { text: 'Unit', style: 'thHead', alignment: 'center' },
    size: { text: 'Size', style: 'thHead', alignment: 'center' },
    weight: { text: 'Weight', style: 'thHead', alignment: 'right' },
    rate: { text: 'Rate', style: 'thHead', alignment: 'right' },
    taxable: { text: 'Taxable', style: 'thHead', alignment: 'right' },
    cgst: { text: 'CGST', style: 'thHead', alignment: 'right' },
    sgst: { text: 'SGST', style: 'thHead', alignment: 'right' },
    total: { text: 'Total', style: 'thHead', alignment: 'right' },
  };
  const columnWidth = {
    // Size widened so single sizes like "17.25x4.5" fit on ONE line.
    // Multi-face sizes ("AxB+CxD") render as a vertical stack so they wrap cleanly on the '+'.
    sno: 14, desc: '*', hsn: 38, qty: 28, unit: 24, size: 60, weight: 48, rate: 42, taxable: 48, cgst: 38, sgst: 38, total: 72,
  };

  // Render the Size cell. Single-group ("17.25x4.5") stays on one line.
  // Multi-group ("17.25x4.5+12.5x4.55") stacks each group as its own line.
  const sizeCell = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return { text: '—', style: 'tdBody', alignment: 'center' };
    if (!s.includes('+')) return { text: s, style: 'tdBody', alignment: 'center', noWrap: true };
    const groups = s.split('+').map((g) => g.trim()).filter(Boolean);
    return {
      stack: groups.map((g, i) => ({
        text: (i === 0 ? '' : '+ ') + g,
        style: 'tdBody',
        alignment: 'center',
        noWrap: true,
      })),
    };
  };

  const itemsHeader = columns.map((c) => headerLabel[c]);
  const widths = columns.map((c) => columnWidth[c]);

  const stackedTax = (rate, amount) => ({
    stack: [
      { text: `${(Number(rate) / 2).toFixed(rate % 2 === 0 ? 1 : 2)}%`, style: 'tdTaxRate', alignment: 'right' },
      { text: money(amount / 2), style: 'tdTaxAmt', alignment: 'right' },
    ],
  });

  const itemsRows = [itemsHeader];
  q.items.forEach((it, i) => {
    const rowMap = {
      sno: { text: String(i + 1), style: 'tdBody', alignment: 'center' },
      desc: {
        stack: [
          { text: safe(it.name), style: 'tdName' },
          it.description ? { text: safe(it.description), style: 'tdDesc' } : {},
        ],
      },
      hsn: { text: safe(it.hsn_code) || '—', style: 'tdBody', alignment: 'center' },
      qty: { text: money(it.quantity), style: 'tdBody', alignment: 'right' },
      unit: { text: safe(it.unit), style: 'tdBody', alignment: 'center' },
      size: sizeCell(it.size),
      weight: { text: safe(it.weight) || '—', style: 'tdBody', alignment: 'right' },
      rate: { text: money(it.rate), style: 'tdBody', alignment: 'right' },
      taxable: { text: money(it.amount), style: 'tdBody', alignment: 'right' },
      cgst: stackedTax(it.gst_rate, it.gst_amount),
      sgst: stackedTax(it.gst_rate, it.gst_amount),
      total: { text: money(it.total), style: 'tdBodyBold', alignment: 'right' },
    };
    itemsRows.push(columns.map((c) => rowMap[c]));
  });

  // Totals footer rows — label spans everything before Total, value in Total col
  const nCols = columns.length;
  const labelStart = 0;
  const labelSpan = nCols - 1;

  const totalRow = (label, value, opts = {}) => {
    // Big rows (grand total) use the dedicated grand-total font size
    const rowFontSize = opts.big ? D.grandTotalFontSize : FS.sm;
    const cells = [];
    for (let i = 0; i < nCols - 1; i++) {
      if (i === labelStart) {
        const cell = {
          text: label,
          alignment: 'right',
          bold: true,
          fontSize: rowFontSize,
          color: opts.big ? D.white : D.ink,
          colSpan: labelSpan,
        };
        if (opts.big) cell.fillColor = D.brand;
        cells.push(cell);
      } else {
        cells.push({});
      }
    }
    const last = {
      text: value,
      alignment: 'right',
      bold: true,
      fontSize: rowFontSize,
      color: opts.big ? D.white : D.ink,
      noWrap: true, // keep "Rs. 53,100.00" together
    };
    if (opts.big) last.fillColor = D.brand;
    cells.push(last);
    return cells;
  };

  // Non-breaking space between "Rs." and amount so they stay on one line
  // GST breakdown block above Grand Total: Subtotal + per-rate lines
  itemsRows.push(totalRow('Subtotal', money(q.subtotal)));

  const gstBreakdown = {};
  if (flatMode) {
    const r = Number(q.flat_gst_rate) || 0;
    if (q.gst_total > 0) gstBreakdown[r] = { taxable: q.subtotal, tax: q.gst_total };
  } else {
    for (const it of q.items) {
      const r = Number(it.gst_rate) || 0;
      if (!gstBreakdown[r]) gstBreakdown[r] = { taxable: 0, tax: 0 };
      gstBreakdown[r].taxable += Number(it.amount) || 0;
      gstBreakdown[r].tax += Number(it.gst_amount) || 0;
    }
  }
  for (const r of Object.keys(gstBreakdown).sort((a, b) => Number(a) - Number(b))) {
    const v = gstBreakdown[r];
    if (!(v.tax > 0)) continue;
    const label = flatMode
      ? 'GST @ ' + r + '% on ' + money(v.taxable)
      : 'GST @ ' + r + '% on ' + money(v.taxable) + '  (CGST ' + money(v.tax / 2) + ' + SGST ' + money(v.tax / 2) + ')';
    itemsRows.push(totalRow(label, money(v.tax)));
  }

  itemsRows.push(totalRow('GRAND TOTAL', `Rs. ${money(q.grand_total)}`, { big: D.grandTotalSolid }));

  const itemsTable = {
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths,
      body: itemsRows,
    },
    layout: boxLayout({ headerFill: D.brand, pad: 5, padY: 5 }),
  };

  // ---------- Custom user-added text elements ----------
  let customElements = [];
  try {
    customElements = JSON.parse(s.pdf_custom_elements || '[]');
    if (!Array.isArray(customElements)) customElements = [];
  } catch (_e) {
    customElements = [];
  }

  // ---------- Content assembly ----------
  const content = [
    offset(centeredCompany, 'header'),
    {
      canvas: [{ type: 'line', x1: 0, y1: 8, x2: 535, y2: 8, lineWidth: 1.5, lineColor: D.brand }],
      margin: [0, 8, 0, 10],
    },
    offset(titleBar, 'title'),
    offset({ columns: [{ width: '*', ...billTo }], margin: [0, 12, 0, 12] }, 'billTo'),
    offset(itemsTable, 'items'),
  ];

  if (D.showAmountInWords) {
    content.push(offset({
      table: {
        widths: ['*'],
        body: [[{ text: `Amount in words: ${numberToWordsIndian(q.grand_total)}`, style: 'inWords' }]],
      },
      layout: {
        hLineColor: () => D.brand,
        vLineColor: () => D.brand,
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 10, 0, 0],
    }, 'amountInWords'));
  }

  const hasBank = D.showBank && (s.bank_name || s.bank_account || s.bank_ifsc || s.bank_branch);
  const termsBlock = D.showTerms && q.terms
    ? offset({
        stack: [
          { text: 'TERMS & CONDITIONS', style: 'sectionTag', margin: [0, 0, 0, 5], alignment: D.alignTerms },
          { text: q.terms, style: 'terms', alignment: D.alignTerms },
        ],
      }, 'terms')
    : { text: '' };

  const notesBlock = D.showNotes && q.notes
    ? offset({
        stack: [
          { text: 'NOTES', style: 'sectionTag', margin: [0, 8, 0, 5], alignment: D.alignNotes },
          { text: q.notes, style: 'notesText', alignment: D.alignNotes },
        ],
      }, 'notes')
    : { text: '' };

  const bankBlock = hasBank
    ? offset({
        stack: [
          { text: 'BANK DETAILS', style: 'sectionTag', margin: [0, 8, 0, 5] },
          {
            table: {
              widths: [56, '*'],
              body: [
                [{ text: 'Bank', style: 'bankLabel' }, { text: safe(s.bank_name) || '—', style: 'bankValue' }],
                [{ text: 'A/c No.', style: 'bankLabel' }, { text: safe(s.bank_account) || '—', style: 'bankValue' }],
                [{ text: 'IFSC', style: 'bankLabel' }, { text: safe(s.bank_ifsc) || '—', style: 'bankValue' }],
                [{ text: 'Branch', style: 'bankLabel' }, { text: safe(s.bank_branch) || '—', style: 'bankValue' }],
              ],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: () => 0,
              paddingLeft: () => 0,
              paddingRight: () => 6,
              paddingTop: () => 2,
              paddingBottom: () => 2,
            },
          },
        ],
      }, 'bank')
    : { text: '' };

  const signatureBlock = D.showSignature
    ? offset({
        stack: [
          { text: '', margin: [0, 28, 0, 0] },
          {
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: D.muted }],
            alignment: D.alignSignature,
          },
          { text: `For ${safe(s.company_name)}`, style: 'signLabel', alignment: D.alignSignature },
          { text: 'Authorized Signatory', style: 'signSub', alignment: D.alignSignature },
        ],
        alignment: D.alignSignature,
      }, 'signature')
    : { text: '' };

  content.push({
    columns: [
      { width: '*', stack: [termsBlock, notesBlock, bankBlock] },
      { width: 220, ...signatureBlock },
    ],
    columnGap: 20,
    margin: [0, 14, 0, 0],
  });

  // Append custom text elements — each floats at its own (x, y) coordinate
  for (const el of customElements) {
    if (!el || typeof el.text !== 'string') continue;
    content.push({
      text: el.text,
      absolutePosition: { x: num(el.x, 30), y: num(el.y, 400) },
      fontSize: num(el.fontSize, 10),
      color: el.color || D.ink,
      alignment: el.align || 'left',
      bold: !!el.bold,
      italics: !!el.italic,
    });
  }

  const footerLine = [
    D.showFooterName && s.company_name ? safe(s.company_name) : '',
    D.showFooterGstin && s.company_gstin ? `GSTIN: ${s.company_gstin}` : '',
    D.showFooterPan && s.company_pan ? `PAN: ${s.company_pan}` : '',
    D.showFooterPhone && s.company_phone ? `Ph: ${s.company_phone}` : '',
    D.showFooterEmail && s.company_email ? s.company_email : '',
  ]
    .filter(Boolean)
    .join('   |   ');

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 58],
    info: {
      title: `Quotation ${q.quote_number}`,
      author: s.company_name || 'MRL Fabrications',
    },
    background: watermarkImage
      ? (_currentPage, pageSize) => {
          const w = D.wmSize;
          return {
            image: watermarkImage,
            width: w,
            opacity: D.wmOpacity,
            absolutePosition: {
              x: (pageSize.width - w) / 2 + D.wmX,
              y: (pageSize.height - w) / 2 + D.wmY,
            },
          };
        }
      : undefined,
    footer: (currentPage, pageCount) => ({
      stack: [
        {
          canvas: [{ type: 'line', x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 0.5, lineColor: D.border }],
          margin: [0, 0, 0, 5],
        },
        {
          columns: [
            { text: footerLine, style: 'footerText', alignment: 'left' },
            {
              text: D.showFooterPage ? `Page ${currentPage} of ${pageCount}` : '',
              style: 'footerText',
              alignment: 'right',
              width: 80,
            },
          ],
          margin: [30, 0, 30, 0],
        },
      ],
    }),
    content,
    styles: {
      companyName: { fontSize: FS.xl, bold: true, color: D.brandDark, characterSpacing: 0.5 },
      companyTag: { fontSize: D.fontCompany, color: D.muted, italics: true, margin: [0, 2, 0, 5] },
      companyLine: { fontSize: D.fontCompany, color: D.ink, lineHeight: 1.3 },

      sectionTag: { fontSize: FS.xs, bold: true, color: D.brandDark, characterSpacing: 0.6 },

      kvLabel: { fontSize: D.fontBillTo, color: D.muted, bold: true },
      kvValue: { fontSize: D.fontBillTo, color: D.ink, lineHeight: 1.3 },
      kvValueBold: { fontSize: D.fontBillTo + 1, color: D.ink, bold: true, lineHeight: 1.3 },
      kvValueItalic: { fontSize: D.fontBillTo, color: D.brandDark, italics: true, bold: true, lineHeight: 1.3 },

      thHead: { color: D.white, bold: true, fontSize: D.fontItems },
      tdBody: { fontSize: D.fontItems, color: D.ink },
      tdBodyBold: { fontSize: D.fontItems, color: D.ink, bold: true },
      tdName: { fontSize: D.fontItems, color: D.ink, bold: true, margin: [0, 0, 0, 1] },
      tdDesc: { fontSize: Math.max(6, D.fontItems - 1), color: D.muted, italics: true, lineHeight: 1.3 },
      tdTaxRate: { fontSize: Math.max(6, D.fontItems - 1), color: D.muted },
      tdTaxAmt: { fontSize: D.fontItems, color: D.ink, bold: true },

      inWords: { fontSize: D.fontAmountInWords, italics: true, color: D.brandDark, bold: true },
      terms: { fontSize: D.fontTerms, color: D.ink, lineHeight: 1.45 },
      notesText: { fontSize: D.fontNotes, color: D.ink, lineHeight: 1.45 },

      bankLabel: { fontSize: D.fontBank, color: D.muted, bold: true },
      bankValue: { fontSize: D.fontBank, color: D.ink, lineHeight: 1.3 },

      signLabel: { fontSize: D.fontSignature, bold: true, color: D.ink, margin: [0, 5, 0, 0] },
      signSub: { fontSize: Math.max(6, D.fontSignature - 1), color: D.muted },

      footerText: { fontSize: D.fontFooter, color: D.muted },
    },
    defaultStyle: { font: 'Roboto', fontSize: FS.base, color: D.ink, lineHeight: 1.25 },
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ================================================================
// Invoice PDF — reuses the quotation renderer with a shim that:
//   - swaps QUOTATION title → TAX INVOICE (via a settings override)
//   - maps invoice fields onto quotation-shape fields
//   - appends a Payment History + Balance Due block via custom elements
// ================================================================

async function buildInvoicePdf(invoice, settings) {
  // Shim invoice → quotation shape for the renderer
  const asQuotation = {
    ...invoice,
    quote_number: invoice.invoice_number,
    quote_date: invoice.invoice_date,
    valid_until: invoice.due_date,
    // items already share the same shape (product_id, name, description, hsn_code, unit, size, qty, rate, gst_rate, amount, gst_amount, total)
    items: invoice.items || [],
  };

  const paid = Number(invoice.paid_total) || 0;
  const balance = Math.max(0, (Number(invoice.grand_total) || 0) - paid);
  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];

  // Payment summary rendered as an extra "custom element" appended near the bottom-right
  const custom = [];
  try {
    if (settings.pdf_custom_elements) {
      const existing = JSON.parse(settings.pdf_custom_elements);
      if (Array.isArray(existing)) custom.push(...existing);
    }
  } catch (_e) {}

  const summaryLines = [
    `Grand Total : Rs. ${money(invoice.grand_total)}`,
    `Paid        : Rs. ${money(paid)}`,
    `Balance Due : Rs. ${money(balance)}`,
  ];
  if (invoice.due_date) summaryLines.push(`Due Date    : ${invoice.due_date}`);
  custom.push({
    id: `__inv_summary_${invoice.id}`,
    text: summaryLines.join('\n'),
    x: 340, y: 720,
    fontSize: 10,
    color: balance > 0 ? '#b91c1c' : '#0f172a',
    align: 'left',
    bold: true,
    italic: false,
  });
  if (payments.length > 0) {
    const lines = ['PAYMENT HISTORY'];
    for (const p of payments) {
      lines.push(`${p.payment_date}  ${p.mode || 'Cash'}  Rs. ${money(p.amount)}${p.reference ? '  #' + p.reference : ''}`);
    }
    custom.push({
      id: `__inv_payments_${invoice.id}`,
      text: lines.join('\n'),
      x: 30, y: 720,
      fontSize: 8,
      color: '#334155',
      align: 'left',
      bold: false,
      italic: false,
    });
  }

  // Settings overrides — flip the header text from QUOTATION to TAX INVOICE and
  // force HSN/SAC column on for invoices (regardless of the shared setting).
  const overriddenSettings = {
    ...settings,
    pdf_quote_title: settings.pdf_invoice_title || 'TAX INVOICE',
    pdf_show_hsn_column: 'true',
    pdf_custom_elements: JSON.stringify(custom),
  };

  return await buildQuotationPdf(asQuotation, overriddenSettings);
}

// ================================================================
// Generic Report PDF — used by all report pages (cashflow / P&L / aging / GST / sales)
// Signature:
//   { title, subtitle?, period: {from, to}, tiles?: [{label, value, tone?}],
//     columns: [{key, label, align?, format?}], rows, totals?: {colspan, values} }
// ================================================================
async function buildReportPdf(report, settings) {
  const s = settings || {};
  const D = {
    brand: str(s.pdf_brand_color, '#2b48d0'),
    brandDark: str(s.pdf_brand_dark_color, '#1a2766'),
    ink: str(s.pdf_text_color, '#0f172a'),
    muted: str(s.pdf_muted_color, '#64748b'),
    border: '#e2e8f0',
    softBg: '#f8fafc',
    white: '#ffffff',
  };

  // Landscape A4 = 802pt wide × 555pt tall (minus 30pt margins). Reports have many columns
  // so landscape avoids cramped/overlapping columns.
  const pageWidth = 802;
  const contentWidth = pageWidth - 60; // 30pt margins each side

  const now = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const headerStack = [
    {
      columns: [
        { text: pdfSafe(s.company_name) || 'Company', fontSize: 10, bold: true, color: D.brandDark, alignment: 'left' },
        { text: 'Generated: ' + now, fontSize: 8, color: D.muted, alignment: 'right' },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: contentWidth, y2: 4, lineWidth: 0.5, lineColor: D.border }], margin: [0, 4, 0, 6] },
    { text: pdfSafe(report.title), fontSize: 18, bold: true, color: D.brandDark, margin: [0, 0, 0, 2] },
    report.period
      ? { text: `Period: ${report.period.from} to ${report.period.to}`, fontSize: 9, color: D.muted }
      : { text: '', margin: [0, 0, 0, 0] },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: contentWidth, y2: 6, lineWidth: 1.5, lineColor: D.brand }], margin: [0, 8, 0, 8] },
  ];

  // Tiles rendered as a compact bordered strip
  const tilesTable = Array.isArray(report.tiles) && report.tiles.length > 0
    ? {
        table: {
          widths: report.tiles.map(() => '*'),
          body: [
            report.tiles.map((t) => ({
              stack: [
                { text: pdfSafe(t.label), fontSize: 7, bold: true, color: D.muted, characterSpacing: 0.5 },
                {
                  text: pdfSafe(t.value),
                  fontSize: 12,
                  bold: true,
                  color:
                    t.tone === 'good' ? '#047857' :
                    t.tone === 'bad' ? '#b91c1c' :
                    t.tone === 'warn' ? '#b45309' :
                    D.ink,
                  margin: [0, 3, 0, 0],
                  noWrap: true,
                },
              ],
              margin: [8, 8, 8, 8],
              fillColor: D.softBg,
            })),
          ],
        },
        layout: {
          hLineColor: () => D.border,
          vLineColor: () => D.border,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
        margin: [0, 0, 0, 10],
      }
    : null;

  // Data table
  const cols = report.columns || [];
  const headRow = cols.map((c) => ({ text: pdfSafe(c.label), bold: true, color: D.white, fontSize: 9, alignment: c.align || 'left' }));
  const bodyRows = (report.rows || []).map((r) =>
    cols.map((c) => {
      const raw = c.get ? c.get(r) : r[c.key];
      // c.format may not survive JSON transport (functions strip on HTTP);
      // if it's a plain-formatted string in the row already, we still handle raw
      const value = typeof c.format === 'function' ? c.format(raw, r) : (raw == null ? '' : String(raw));
      return {
        text: pdfSafe(value),
        fontSize: 8.5,
        color: typeof c.color === 'function' ? c.color(raw, r) : D.ink,
        alignment: c.align || 'left',
        noWrap: c.align === 'right', // amounts should never wrap
      };
    })
  );

  const tableBody = [headRow, ...bodyRows];

  // Optional totals row — pdfmake requires empty placeholder cells for each column
  // that a colSpan cell covers, otherwise it throws "Malformed table row".
  if (report.totals && Array.isArray(report.totals.cells)) {
    const paddedRow = [];
    for (const cell of report.totals.cells) {
      paddedRow.push({
        text: pdfSafe(cell.text),
        bold: true,
        fontSize: 9.5,
        color: D.ink,
        fillColor: '#f1f5f9',
        alignment: cell.align || 'left',
        colSpan: cell.colSpan || 1,
        noWrap: cell.align === 'right',
      });
      const span = cell.colSpan || 1;
      for (let i = 1; i < span; i++) paddedRow.push({});
    }
    while (paddedRow.length < cols.length) paddedRow.push({});
    tableBody.push(paddedRow);
  }

  // Column widths: use provided width, else compute from column count so the whole table
  // fills the printable area. Avoids the "cramped narrow columns bleeding into next column" look.
  const nCols = cols.length || 1;
  const avgW = Math.floor(contentWidth / nCols);
  const widths = cols.map((c) => {
    if (c.width) return c.width;
    // If we have many columns, use "*" so pdfmake distributes; but for <= 8 give explicit average
    return nCols <= 8 ? avgW : '*';
  });

  const dataTable = {
    table: { headerRows: 1, widths, body: tableBody, dontBreakRows: true, keepWithHeaderRows: 1 },
    layout: {
      fillColor: (rowIndex) => (rowIndex === 0 ? D.brand : null),
      hLineColor: () => D.border,
      vLineColor: () => D.border,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 4, 0, 0],
  };

  const content = [...headerStack];
  if (tilesTable) content.push(tilesTable);
  if (report.subtitle) content.push({ text: pdfSafe(report.subtitle), fontSize: 9, color: D.muted, margin: [0, 0, 0, 8] });
  content.push(dataTable);

  if (!report.rows || report.rows.length === 0) {
    content.push({ text: 'No data in this period.', italics: true, color: D.muted, alignment: 'center', margin: [0, 12, 0, 0] });
  }

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 42],
    info: { title: report.title, author: s.company_name || 'MRL Fabrications' },
    footer: (page, pageCount) => ({
      columns: [
        { text: `${pdfSafe(s.company_name)}  •  ${pdfSafe(report.title)}`, fontSize: 7, color: D.muted, alignment: 'left' },
        { text: `Page ${page} of ${pageCount}`, fontSize: 7, color: D.muted, alignment: 'right', width: 80 },
      ],
      margin: [30, 8, 30, 0],
    }),
    content,
    defaultStyle: { font: 'Roboto', fontSize: 9, color: D.ink },
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildQuotationPdf, buildInvoicePdf, buildReportPdf };
