import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../utils/asset.js';

const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isTrue = (v) => String(v) === 'true';

function inWordsSimple(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : `${b[Math.floor(n / 10)]}${n % 10 ? ' ' + a[n % 10] : ''}`);
  const three = (n) => {
    const h = Math.floor(n / 100), r = n % 100;
    return `${h ? a[h] + ' Hundred' + (r ? ' ' : '') : ''}${r ? two(r) : ''}`;
  };
  let n = Math.floor(num), out = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) out += two(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (n) out += three(n);
  return `${out.trim()} Rupees Only`;
}

const PT = 1.33;

export default function PdfHtmlMock({ values, settings, quotation, selected, onSelect, onDragValue, onCustomChange }) {
  const v = values;
  const s = settings || {};
  const q = quotation;

  const [drag, setDrag] = useState(null); // { keyX, keyY, startX, startY, initX, initY, customId? }

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const dx = (e.clientX - drag.startX) / PT;
      const dy = (e.clientY - drag.startY) / PT;
      const nx = Math.round(drag.initX + dx);
      const ny = Math.round(drag.initY + dy);
      if (drag.customId) {
        onCustomChange?.(drag.customId, { x: nx, y: ny });
      } else {
        onDragValue?.(drag.keyX, nx);
        onDragValue?.(drag.keyY, ny);
      }
    };
    const up = () => setDrag(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, onDragValue, onCustomChange]);

  // Parse custom text elements
  let customElements = [];
  try {
    const parsed = JSON.parse(v.pdf_custom_elements || '[]');
    if (Array.isArray(parsed)) customElements = parsed;
  } catch (_e) { /* ignore */ }

  if (!q) return null;

  const brand = v.pdf_brand_color || '#2b48d0';
  const brandDark = v.pdf_brand_dark_color || '#1a2766';
  const ink = v.pdf_text_color || '#0f172a';
  const muted = v.pdf_muted_color || '#64748b';
  const base = Number(v.pdf_font_base_size || 9.5) * PT;
  const sm = Math.max(7, Number(v.pdf_font_base_size || 9.5) - 1) * PT;
  const xs = Math.max(6, Number(v.pdf_font_base_size || 9.5) - 2) * PT;
  const heading = Number(v.pdf_font_heading_size || 16) * PT;
  const title = Number(v.pdf_font_title_size || 12) * PT;
  const logoSize = Number(v.pdf_logo_size || 60) * PT;
  const logoX = Number(v.pdf_logo_x_offset || 0) * PT;
  const logoY = Number(v.pdf_logo_y_offset || 0) * PT;
  const quoteTitle = v.pdf_quote_title || 'QUOTATION';

  const showWatermark = isTrue(v.pdf_show_watermark);
  const wmSize = Number(v.pdf_watermark_size || 420) * PT;
  const wmOpacity = Number(v.pdf_watermark_opacity || 0.14);
  const wmX = Number(v.pdf_watermark_x_offset || 0) * PT;
  const wmY = Number(v.pdf_watermark_y_offset || 0) * PT;

  const showBank = isTrue(v.pdf_show_bank);
  const showSig = isTrue(v.pdf_show_signature);
  const showTerms = isTrue(v.pdf_show_terms);
  const showNotes = isTrue(v.pdf_show_notes);
  const showAmt = isTrue(v.pdf_show_amount_in_words);
  const showHsn = false; // HSN/SAC removed from UI
  const showUnit = isTrue(v.pdf_show_unit_column);
  const showTaxable = isTrue(v.pdf_show_taxable_column);
  const showCgst = isTrue(v.pdf_show_cgst_column);
  const showSgst = isTrue(v.pdf_show_sgst_column);
  const grandTotalSolid = isTrue(v.pdf_grand_total_solid_bg);
  const grandTotalFont = Number(v.pdf_grand_total_font_size || 12) * PT;

  // Per-block font sizes (Word-style per-section)
  const fontCompany = Number(v.pdf_font_company_lines_size || 9) * PT;
  const fontBillTo = Number(v.pdf_font_billTo_size || 9.5) * PT;
  const fontItems = Number(v.pdf_font_items_size || 8.5) * PT;
  const fontAmountInWords = Number(v.pdf_font_amountInWords_size || 10) * PT;
  const fontTerms = Number(v.pdf_font_terms_size || 8.5) * PT;
  const fontNotes = Number(v.pdf_font_notes_size || 8.5) * PT;
  const fontBank = Number(v.pdf_font_bank_size || 9) * PT;
  const fontSignature = Number(v.pdf_font_signature_size || 9) * PT;
  const fontFooter = Number(v.pdf_font_footer_size || 8) * PT;
  const fontItemsXs = Math.max(6, Number(v.pdf_font_items_size || 8.5) - 1) * PT;

  const alignHeader = v.pdf_align_header || 'center';
  const alignBillTo = v.pdf_align_billTo || 'left';
  const alignTerms = v.pdf_align_terms || 'left';
  const alignNotes = v.pdf_align_notes || 'left';
  const alignSignature = v.pdf_align_signature || 'center';

  const customer = q.customer || q.customer_snapshot || {};

  const pageW = 595 * PT;
  const pageH = 842 * PT;

  const handleClick = (e, key) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect?.(key, rect);
  };

  const outlineStyle = (key) => ({
    outline: selected === key ? `2px dashed ${brand}` : '2px dashed transparent',
    outlineOffset: 2,
    borderRadius: 2,
    transition: 'outline-color .12s',
  });

  // Map of block keys → their X/Y offset setting keys
  const BLOCK_POS = {
    header: ['pdf_pos_header_x', 'pdf_pos_header_y'],
    title: ['pdf_pos_title_x', 'pdf_pos_title_y'],
    billTo: ['pdf_pos_billTo_x', 'pdf_pos_billTo_y'],
    items: ['pdf_pos_items_x', 'pdf_pos_items_y'],
    amountInWords: ['pdf_pos_amountInWords_x', 'pdf_pos_amountInWords_y'],
    terms: ['pdf_pos_terms_x', 'pdf_pos_terms_y'],
    notes: ['pdf_pos_notes_x', 'pdf_pos_notes_y'],
    bank: ['pdf_pos_bank_x', 'pdf_pos_bank_y'],
    signature: ['pdf_pos_signature_x', 'pdf_pos_signature_y'],
    footer: ['pdf_pos_footer_x', 'pdf_pos_footer_y'],
  };

  const startRegionDrag = (e, key) => {
    const pos = BLOCK_POS[key];
    if (!pos) return;
    if (e.button !== 0) return;
    // Only start drag if user actually drags — track initial state
    e.stopPropagation();
    setDrag({
      keyX: pos[0],
      keyY: pos[1],
      startX: e.clientX,
      startY: e.clientY,
      initX: Number(v[pos[0]] || 0),
      initY: Number(v[pos[1]] || 0),
    });
    onSelect?.(key, e.currentTarget.getBoundingClientRect());
  };

  const region = (key, children, style = {}) => {
    const pos = BLOCK_POS[key];
    const tx = pos ? Number(v[pos[0]] || 0) * PT : 0;
    const ty = pos ? Number(v[pos[1]] || 0) * PT : 0;
    return (
      <div
        data-region={key}
        onClick={(e) => handleClick(e, key)}
        onMouseDown={pos ? (e) => startRegionDrag(e, key) : undefined}
        style={{
          position: 'relative',
          cursor: pos ? 'move' : 'pointer',
          transform: `translate(${tx}px, ${ty}px)`,
          ...outlineStyle(key),
          ...style,
        }}
        onMouseEnter={(e) => {
          if (selected !== key) e.currentTarget.style.outlineColor = 'rgba(43,72,208,.35)';
        }}
        onMouseLeave={(e) => {
          if (selected !== key) e.currentTarget.style.outlineColor = 'transparent';
        }}
      >
        {children}
      </div>
    );
  };

  // Small inline field wrapper — clickable field with its own dashed outline on hover/select
  const field = (key, children, extraStyle = {}, tag = 'div') => {
    const Tag = tag;
    return (
      <Tag
        data-region={key}
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onSelect?.(key, rect);
        }}
        onMouseEnter={(e) => {
          if (selected !== key) e.currentTarget.style.outlineColor = 'rgba(43,72,208,.35)';
        }}
        onMouseLeave={(e) => {
          if (selected !== key) e.currentTarget.style.outlineColor = 'transparent';
        }}
        style={{
          cursor: 'pointer',
          outline: selected === key ? `1.5px dashed ${brand}` : '1.5px dashed transparent',
          outlineOffset: 2,
          borderRadius: 2,
          transition: 'outline-color .12s',
          ...extraStyle,
        }}
      >
        {children}
      </Tag>
    );
  };

  // Per-field show toggles
  const F = {
    companyName: isTrue(v.pdf_show_company_name),
    companyTagline: isTrue(v.pdf_show_company_tagline),
    companyAddress: isTrue(v.pdf_show_company_address),
    companyLocation: isTrue(v.pdf_show_company_location),
    companyContact: isTrue(v.pdf_show_company_contact),
    quoteNo: isTrue(v.pdf_show_quote_no),
    quoteDate: isTrue(v.pdf_show_quote_date),
    billName: isTrue(v.pdf_show_bill_name),
    billAttn: isTrue(v.pdf_show_bill_attn),
    billAddress: isTrue(v.pdf_show_bill_address),
    billLocation: isTrue(v.pdf_show_bill_location),
    billPhone: isTrue(v.pdf_show_bill_phone),
    billEmail: isTrue(v.pdf_show_bill_email),
    billGstin: isTrue(v.pdf_show_bill_gstin),
    billSubject: isTrue(v.pdf_show_bill_subject),
    footerName: isTrue(v.pdf_show_footer_name),
    footerGstin: isTrue(v.pdf_show_footer_gstin),
    footerPan: isTrue(v.pdf_show_footer_pan),
    footerPhone: isTrue(v.pdf_show_footer_phone),
    footerEmail: isTrue(v.pdf_show_footer_email),
    footerPage: isTrue(v.pdf_show_footer_page),
  };

  const cellPad = 5 * PT;
  const border = '#e2e8f0';

  // Detect whether any item has a size — if so, show the Size column
  const anySize = q.items.some((it) => it.size && String(it.size).trim() !== '');
  const gstMode = q.gst_mode || 'per_line';
  const flatMode = gstMode === 'flat_on_total';

  // In flat mode, hide the per-line CGST/SGST columns (they'd all be zero)
  const effShowCgst = showCgst && !flatMode;
  const effShowSgst = showSgst && !flatMode;

  // Parse size like the backend
  const parseSize = (size) => {
    if (size == null || size === '') return 1;
    const s = String(size).trim().toLowerCase();
    const m = s.match(/^(\d+(?:\.\d+)?)\s*[x*×]\s*(\d+(?:\.\d+)?)$/);
    if (m) return Number(m[1]) * Number(m[2]);
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  // Count all visible columns except the final Total column
  const totalColSpan =
    1 + // sno
    1 + // desc
    (showHsn ? 1 : 0) +
    (showUnit ? 1 : 0) +
    (anySize ? 1 : 0) +
    1 + // qty
    1 + // rate
    (showTaxable ? 1 : 0) +
    (effShowCgst ? 1 : 0) +
    (effShowSgst ? 1 : 0);
  const logoSrc = s.logo_path ? assetUrl(s.logo_path) : null;
  const wmSrc = s.watermark_path ? assetUrl(s.watermark_path) : null;

  const startWatermarkDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      keyX: 'pdf_watermark_x_offset',
      keyY: 'pdf_watermark_y_offset',
      startX: e.clientX,
      startY: e.clientY,
      initX: Number(v.pdf_watermark_x_offset || 0),
      initY: Number(v.pdf_watermark_y_offset || 0),
    });
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect?.('watermark', rect);
  };

  const startLogoDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      keyX: 'pdf_logo_x_offset',
      keyY: 'pdf_logo_y_offset',
      startX: e.clientX,
      startY: e.clientY,
      initX: Number(v.pdf_logo_x_offset || 0),
      initY: Number(v.pdf_logo_y_offset || 0),
    });
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect?.('logo', rect);
  };

  return (
    <div
      className="mx-auto shadow-2xl relative bg-white"
      style={{
        width: pageW,
        minHeight: pageH,
        padding: 30 * PT,
        color: ink,
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: base,
        lineHeight: 1.3,
        display: 'flex',
        flexDirection: 'column',
        userSelect: drag ? 'none' : 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect?.(null, null);
      }}
    >
      {/* Watermark (absolute, draggable) */}
      {showWatermark && (
        <div
          data-region="watermark"
          onMouseDown={startWatermarkDrag}
          onClick={(e) => e.stopPropagation()}
          title="Drag to reposition"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${wmX}px), calc(-50% + ${wmY}px))`,
            width: wmSize,
            height: wmSrc ? wmSize : Math.max(60, wmSize / 4),
            opacity: wmOpacity, // WYSIWYG: mock uses the exact opacity that will be in the PDF
            cursor: drag?.keyX === 'pdf_watermark_x_offset' ? 'grabbing' : 'grab',
            outline: selected === 'watermark' ? `2px dashed ${brand}` : 'none',
            outlineOffset: 4,
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          {wmSrc ? (
            <img
              src={wmSrc}
              alt="Watermark"
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                border: `2px dashed ${muted}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: muted,
                fontSize: xs,
                fontStyle: 'italic',
              }}
            >
              Upload a watermark image from the sidebar
            </div>
          )}
        </div>
      )}

      {/* Custom user-added text elements — floats at their (x, y) absolute positions */}
      {customElements.map((el) => {
        const isSel = selected === el.id;
        return (
          <div
            key={el.id}
            data-region={el.id}
            title="Drag to reposition"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              e.preventDefault();
              setDrag({
                customId: el.id,
                startX: e.clientX,
                startY: e.clientY,
                initX: Number(el.x || 0),
                initY: Number(el.y || 0),
              });
              onSelect?.(el.id, e.currentTarget.getBoundingClientRect());
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(el.id, e.currentTarget.getBoundingClientRect());
            }}
            style={{
              position: 'absolute',
              left: (el.x || 0) * PT,
              top: (el.y || 0) * PT,
              fontSize: (el.fontSize || 10) * PT,
              color: el.color || ink,
              textAlign: el.align || 'left',
              fontWeight: el.bold ? 700 : 400,
              fontStyle: el.italic ? 'italic' : 'normal',
              cursor: drag?.customId === el.id ? 'grabbing' : 'move',
              outline: isSel ? `2px dashed ${brand}` : '2px dashed transparent',
              outlineOffset: 3,
              padding: '2px 4px',
              maxWidth: pageW - 60,
              whiteSpace: 'pre-wrap',
              userSelect: 'none',
              zIndex: 3,
            }}
            onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.outlineColor = 'rgba(43,72,208,.4)'; }}
            onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.outlineColor = 'transparent'; }}
          >
            {el.text || 'Empty text'}
          </div>
        );
      })}

      <div style={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Company header */}
        {region(
          'header',
          <div style={{ textAlign: alignHeader }}>
            {logoSrc && (
              <div
                data-region="logo"
                onMouseDown={startLogoDrag}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  onSelect?.('logo', rect);
                }}
                title="Drag to reposition • click to edit size"
                style={{
                  display: 'inline-block',
                  width: logoSize,
                  height: logoSize,
                  transform: `translate(${logoX}px, ${logoY}px)`,
                  cursor: drag?.keyX === 'pdf_logo_x_offset' ? 'grabbing' : 'grab',
                  outline: selected === 'logo' ? `2px dashed ${brand}` : 'none',
                  outlineOffset: 3,
                  marginBottom: 6,
                  userSelect: 'none',
                }}
              >
                <img
                  src={logoSrc}
                  alt="Logo"
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />
              </div>
            )}
            {!logoSrc && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.('logo', e.currentTarget.getBoundingClientRect());
                }}
                style={{
                  width: logoSize,
                  height: logoSize / 1.5,
                  margin: '0 auto 6px',
                  border: `2px dashed ${muted}`,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: muted,
                  fontSize: xs,
                  fontStyle: 'italic',
                  cursor: 'pointer',
                }}
              >
                Upload logo
              </div>
            )}
            {F.companyName && field('field_company_name',
              <div style={{ fontSize: heading, fontWeight: 700, color: brandDark, letterSpacing: 0.5 }}>
                {s.company_name || 'Company Name'}
              </div>,
              {}
            )}
            {F.companyTagline && s.company_tagline && field('field_company_tagline',
              <div style={{ fontSize: fontCompany, color: muted, fontStyle: 'italic', marginTop: 2 }}>
                {s.company_tagline}
              </div>,
              {}
            )}
            {F.companyAddress && s.company_address && field('field_company_address',
              <div style={{ fontSize: fontCompany }}>{s.company_address}</div>,
              {}
            )}
            {F.companyLocation && field('field_company_location',
              <div style={{ fontSize: fontCompany }}>
                {[s.company_city, s.company_state, s.company_pincode].filter(Boolean).join(', ')}
              </div>,
              {}
            )}
            {F.companyContact && field('field_company_contact',
              <div style={{ fontSize: fontCompany }}>
                {[
                  s.company_phone && `Phone: ${s.company_phone}`,
                  s.company_email && `Email: ${s.company_email}`,
                  s.company_website && `Web: ${s.company_website}`,
                ].filter(Boolean).join('   |   ')}
              </div>,
              {}
            )}
          </div>
        )}

        <div style={{ height: 2, background: brand, margin: `${8 * PT}px 0 ${10 * PT}px` }} />

        {/* Title bar */}
        {region(
          'title',
          <div style={{ display: 'flex', gap: 0, overflow: 'hidden', borderRadius: 2 }}>
            <div style={{ flex: 1, background: brand, color: '#fff', padding: `${7 * PT}px ${12 * PT}px`, fontWeight: 700, fontSize: title, letterSpacing: 2 }}>
              {quoteTitle}
            </div>
            {F.quoteNo && (
              <div
                data-region="field_quote_no"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.('field_quote_no', e.currentTarget.getBoundingClientRect());
                }}
                onMouseEnter={(e) => {
                  if (selected !== 'field_quote_no') e.currentTarget.style.outlineColor = 'rgba(255,255,255,.7)';
                }}
                onMouseLeave={(e) => {
                  if (selected !== 'field_quote_no') e.currentTarget.style.outlineColor = 'transparent';
                }}
                style={{
                  background: brandDark,
                  color: '#fff',
                  padding: `${7 * PT}px ${12 * PT}px`,
                  fontWeight: 700,
                  fontSize: base,
                  cursor: 'pointer',
                  outline: selected === 'field_quote_no' ? '2px solid #fff' : '2px solid transparent',
                  outlineOffset: -3,
                }}
              >
                No: {q.quote_number}
              </div>
            )}
            {F.quoteDate && (
              <div
                data-region="field_quote_date"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.('field_quote_date', e.currentTarget.getBoundingClientRect());
                }}
                onMouseEnter={(e) => {
                  if (selected !== 'field_quote_date') e.currentTarget.style.outlineColor = 'rgba(255,255,255,.7)';
                }}
                onMouseLeave={(e) => {
                  if (selected !== 'field_quote_date') e.currentTarget.style.outlineColor = 'transparent';
                }}
                style={{
                  background: brandDark,
                  color: '#fff',
                  padding: `${7 * PT}px ${12 * PT}px`,
                  fontWeight: 700,
                  fontSize: base,
                  borderLeft: '1px solid rgba(255,255,255,.2)',
                  cursor: 'pointer',
                  outline: selected === 'field_quote_date' ? '2px solid #fff' : '2px solid transparent',
                  outlineOffset: -3,
                }}
              >
                Date: {q.quote_date}
              </div>
            )}
          </div>
        )}

        {/* Bill To */}
        <div style={{ margin: `${12 * PT}px 0` }}>
          {region(
            'billTo',
            <div style={{ textAlign: alignBillTo }}>
              <div style={{ fontSize: xs, fontWeight: 700, color: brandDark, letterSpacing: 0.6, marginBottom: 5 }}>
                QUOTE TO
              </div>
              <table style={{ borderCollapse: 'collapse', display: 'inline-table' }}>
                <tbody>
                  {(() => {
                    const rows = [];
                    const push = (key, lbl, val, opts = {}) => {
                      const isSel = selected === key;
                      rows.push(
                        <tr
                          key={key}
                          data-region={key}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect?.(key, e.currentTarget.getBoundingClientRect());
                          }}
                          onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'rgba(43,72,208,.06)'; }}
                          onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                          style={{
                            cursor: 'pointer',
                            background: isSel ? 'rgba(43,72,208,.1)' : 'transparent',
                            outline: isSel ? `1.5px dashed ${brand}` : 'none',
                          }}
                        >
                          <td style={{ fontSize: fontBillTo, color: muted, fontWeight: 700, padding: '2px 6px 2px 0', width: 60 }}>{lbl}</td>
                          <td style={{ fontSize: opts.bold ? fontBillTo + 1 : fontBillTo, color: ink, fontWeight: opts.bold ? 700 : 400, fontStyle: opts.italic ? 'italic' : 'normal', padding: '2px 0' }}>{val}</td>
                        </tr>
                      );
                    };
                    if (F.billName) push('field_bill_name', 'Name', customer.name || '—', { bold: true });
                    if (F.billAttn && customer.contact_person) push('field_bill_attn', 'Attn', customer.contact_person);
                    if (F.billAddress && customer.address) push('field_bill_address', 'Address', customer.address);
                    if (F.billLocation) push('field_bill_location', 'City', [customer.city, customer.state, customer.pincode].filter(Boolean).join(', '));
                    if (F.billPhone && customer.phone) push('field_bill_phone', 'Phone', customer.phone);
                    if (F.billEmail && customer.email) push('field_bill_email', 'Email', customer.email);
                    if (F.billGstin && customer.gstin) push('field_bill_gstin', 'GSTIN', customer.gstin, { bold: true });
                    if (F.billSubject && q.subject) push('field_bill_subject', 'Subject', q.subject, { italic: true });
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Items table — column headers and grand total are individually clickable */}
        {(() => {
          const colClick = (colKey) => (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onSelect?.(colKey, rect);
          };
          const thStyle = (colKey, extra = {}) => ({
            padding: cellPad,
            fontSize: sm,
            border: `0.5px solid ${border}`,
            fontWeight: 700,
            cursor: 'pointer',
            outline: selected === colKey ? `2px solid #fff` : 'none',
            outlineOffset: -3,
            boxShadow: selected === colKey ? `inset 0 0 0 2px ${brandDark}` : 'none',
            ...extra,
          });

          const grandTotalClick = (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onSelect?.('grandTotal', rect);
          };

          const tableClick = (e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onSelect?.('items', rect);
          };

          return (
            <div
              data-region="items"
              onClick={tableClick}
              style={{ ...outlineStyle('items'), cursor: 'pointer' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', border: `0.5px solid ${border}` }}>
                <thead>
                  <tr style={{ background: brand, color: '#fff' }}>
                    <th data-region="col_sno" onClick={colClick('col_sno')} style={thStyle('col_sno', { textAlign: 'center' })}>S.No</th>
                    <th data-region="col_desc" onClick={colClick('col_desc')} style={thStyle('col_desc', { textAlign: 'left' })}>Description</th>
                    {showHsn && <th data-region="col_hsn" onClick={colClick('col_hsn')} style={thStyle('col_hsn', { textAlign: 'center' })}>HSN/SAC</th>}
                    {showUnit && <th data-region="col_unit" onClick={colClick('col_unit')} style={thStyle('col_unit', { textAlign: 'center' })}>Unit</th>}
                    {anySize && <th data-region="col_size" onClick={colClick('col_size')} style={thStyle('col_size', { textAlign: 'center' })}>Size</th>}
                    <th data-region="col_qty" onClick={colClick('col_qty')} style={thStyle('col_qty', { textAlign: 'right' })}>Qty</th>
                    <th data-region="col_rate" onClick={colClick('col_rate')} style={thStyle('col_rate', { textAlign: 'right' })}>Rate</th>
                    {showTaxable && <th data-region="col_taxable" onClick={colClick('col_taxable')} style={thStyle('col_taxable', { textAlign: 'right' })}>Taxable</th>}
                    {effShowCgst && <th data-region="col_cgst" onClick={colClick('col_cgst')} style={thStyle('col_cgst', { textAlign: 'right' })}>CGST</th>}
                    {effShowSgst && <th data-region="col_sgst" onClick={colClick('col_sgst')} style={thStyle('col_sgst', { textAlign: 'right' })}>SGST</th>}
                    <th data-region="col_total" onClick={colClick('col_total')} style={thStyle('col_total', { textAlign: 'right' })}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {q.items.map((it, i) => {
                    const sizeMult = parseSize(it.size);
                    return (
                    <tr key={i}>
                      <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'center', border: `0.5px solid ${border}` }}>{i + 1}</td>
                      <td style={{ padding: cellPad, fontSize: fontItems, border: `0.5px solid ${border}` }}>
                        <div style={{ fontWeight: 700 }}>{it.name}</div>
                        {it.description && <div style={{ fontSize: fontItemsXs, color: muted, fontStyle: 'italic' }}>{it.description}</div>}
                      </td>
                      {showHsn && <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'center', border: `0.5px solid ${border}` }}>{it.hsn_code || '—'}</td>}
                      {showUnit && <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'center', border: `0.5px solid ${border}` }}>{it.unit}</td>}
                      {anySize && (
                        <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'center', border: `0.5px solid ${border}` }}>
                          {it.size ? (<>{it.size}{sizeMult !== 1 && (<div style={{ fontSize: fontItemsXs, color: muted }}>{'= ' + sizeMult}</div>)}</>) : '—'}
                        </td>
                      )}
                      <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}` }}>{money(it.quantity)}</td>
                      <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}` }}>{money(it.rate)}</td>
                      {showTaxable && <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}` }}>{money(it.amount)}</td>}
                      {effShowCgst && (
                        <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}` }}>
                          <div style={{ fontSize: fontItemsXs, color: muted }}>{(it.gst_rate / 2).toFixed(1)}%</div>
                          <div style={{ fontWeight: 700 }}>{money(it.gst_amount / 2)}</div>
                        </td>
                      )}
                      {effShowSgst && (
                        <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}` }}>
                          <div style={{ fontSize: fontItemsXs, color: muted }}>{(it.gst_rate / 2).toFixed(1)}%</div>
                          <div style={{ fontWeight: 700 }}>{money(it.gst_amount / 2)}</div>
                        </td>
                      )}
                      <td style={{ padding: cellPad, fontSize: fontItems, textAlign: 'right', border: `0.5px solid ${border}`, fontWeight: 700 }}>{money(it.total)}</td>
                    </tr>
                    );
                  })}
                  {/* GST breakdown rows above Grand Total */}
                  <tr>
                    <td colSpan={totalColSpan} style={{ padding: `${4 * PT}px ${cellPad}px`, fontSize: fontItems, textAlign: 'right', fontWeight: 700, border: `0.5px solid ${border}` }}>Subtotal</td>
                    <td style={{ padding: `${4 * PT}px ${cellPad}px`, fontSize: fontItems, textAlign: 'right', fontWeight: 700, border: `0.5px solid ${border}` }}>{money(q.subtotal)}</td>
                  </tr>
                  {(() => {
                    const breakdown = {};
                    if (flatMode) {
                      const r = Number(q.flat_gst_rate) || 0;
                      if (q.gst_total > 0) breakdown[r] = { taxable: q.subtotal, tax: q.gst_total };
                    } else {
                      for (const it of q.items) {
                        const r = Number(it.gst_rate) || 0;
                        if (!breakdown[r]) breakdown[r] = { taxable: 0, tax: 0 };
                        breakdown[r].taxable += Number(it.amount) || 0;
                        breakdown[r].tax += Number(it.gst_amount) || 0;
                      }
                    }
                    return Object.keys(breakdown).sort((a, b) => Number(a) - Number(b)).filter(r => breakdown[r].tax > 0).map(r => (
                      <tr key={'gst' + r}>
                        <td colSpan={totalColSpan} style={{ padding: `${3 * PT}px ${cellPad}px`, fontSize: fontItemsXs, textAlign: 'right', color: muted, border: `0.5px solid ${border}` }}>
                          {'GST @ ' + r + '% on ' + money(breakdown[r].taxable)}{!flatMode && (' (CGST ' + money(breakdown[r].tax / 2) + ' + SGST ' + money(breakdown[r].tax / 2) + ')')}
                        </td>
                        <td style={{ padding: `${3 * PT}px ${cellPad}px`, fontSize: fontItems, textAlign: 'right', fontWeight: 700, border: `0.5px solid ${border}` }}>{money(breakdown[r].tax)}</td>
                      </tr>
                    ));
                  })()}
                  <tr
                    data-region="grandTotal"
                    onClick={grandTotalClick}
                    style={{
                      background: grandTotalSolid ? brand : 'transparent',
                      color: grandTotalSolid ? '#fff' : ink,
                      cursor: 'pointer',
                      outline: selected === 'grandTotal' ? `2px dashed ${brand}` : 'none',
                      outlineOffset: -2,
                    }}
                  >
                    <td colSpan={totalColSpan} style={{ padding: `${6 * PT}px ${cellPad}px`, fontSize: grandTotalFont, textAlign: 'right', fontWeight: 700, letterSpacing: 0.5, borderTop: grandTotalSolid ? 'none' : `1.5px solid ${brand}`, whiteSpace: 'nowrap' }}>GRAND TOTAL</td>
                    <td style={{ padding: `${6 * PT}px ${cellPad}px`, fontSize: grandTotalFont, textAlign: 'right', fontWeight: 700, borderTop: grandTotalSolid ? 'none' : `1.5px solid ${brand}`, whiteSpace: 'nowrap' }}>{'Rs. '}{money(q.grand_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Amount in words */}
        {showAmt && (
          <div style={{ marginTop: 10 * PT }}>
            {region(
              'amountInWords',
              <div style={{ border: `1px solid ${brand}`, padding: `${6 * PT}px ${10 * PT}px`, fontStyle: 'italic', fontWeight: 700, color: brandDark, fontSize: fontAmountInWords }}>
                Amount in words: {inWordsSimple(q.grand_total)}
              </div>
            )}
          </div>
        )}

        {/* Bottom row (terms/notes/bank + signature) */}
        <div style={{ display: 'flex', gap: 20, marginTop: 14 * PT }}>
          <div style={{ flex: 1 }}>
            {showTerms && q.terms && region(
              'terms',
              <div style={{ marginBottom: 8, textAlign: alignTerms }}>
                <div style={{ fontSize: xs, fontWeight: 700, color: brandDark, letterSpacing: 0.6, marginBottom: 5 }}>TERMS & CONDITIONS</div>
                <div style={{ fontSize: fontTerms, whiteSpace: 'pre-line', lineHeight: 1.45 }}>{q.terms}</div>
              </div>
            )}
            {showNotes && q.notes && region(
              'notes',
              <div style={{ marginBottom: 8, textAlign: alignNotes }}>
                <div style={{ fontSize: xs, fontWeight: 700, color: brandDark, letterSpacing: 0.6, marginBottom: 5 }}>NOTES</div>
                <div style={{ fontSize: fontNotes, whiteSpace: 'pre-line' }}>{q.notes}</div>
              </div>
            )}
            {showBank && (s.bank_name || s.bank_account) && region(
              'bank',
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: xs, fontWeight: 700, color: brandDark, letterSpacing: 0.6, marginBottom: 5 }}>BANK DETAILS</div>
                <table style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    {[['Bank', s.bank_name], ['A/c No.', s.bank_account], ['IFSC', s.bank_ifsc], ['Branch', s.bank_branch]].map(([k, val]) => (
                      <tr key={k}>
                        <td style={{ fontSize: fontBank, color: muted, fontWeight: 700, padding: '2px 6px 2px 0', width: 60 }}>{k}</td>
                        <td style={{ fontSize: fontBank, padding: '2px 0' }}>{val || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {showBank && !(s.bank_name || s.bank_account) && region(
              'bank',
              <div style={{ marginBottom: 8, opacity: 0.6 }}>
                <div style={{ fontSize: xs, fontWeight: 700, color: brandDark, letterSpacing: 0.6, marginBottom: 5 }}>BANK DETAILS</div>
                <div style={{ fontSize: fontBank, color: muted, fontStyle: 'italic' }}>Fill bank details in Settings to display them here.</div>
              </div>
            )}
          </div>
          <div style={{ width: 220 }}>
            {showSig && region(
              'signature',
              <div style={{ textAlign: alignSignature, marginTop: 28 * PT }}>
                <div style={{ borderTop: `0.6px solid ${muted}`, marginBottom: 4 }} />
                <div style={{ fontSize: fontSignature, fontWeight: 700 }}>For {s.company_name}</div>
                <div style={{ fontSize: Math.max(6, Number(v.pdf_font_signature_size || 9) - 1) * PT, color: muted }}>Authorized Signatory</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer pinned to bottom via marginTop: auto */}
        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `0.5px solid ${border}` }}>
          {region(
            'footer',
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fontFooter, color: muted, paddingTop: 4, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {F.footerName && s.company_name && field('field_footer_name', <span>{s.company_name}</span>, { display: 'inline-block', padding: '0 2px' })}
                {F.footerGstin && s.company_gstin && (<>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  {field('field_footer_gstin', <span>GSTIN: {s.company_gstin}</span>, { display: 'inline-block', padding: '0 2px' })}
                </>)}
                {F.footerPan && s.company_pan && (<>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  {field('field_footer_pan', <span>PAN: {s.company_pan}</span>, { display: 'inline-block', padding: '0 2px' })}
                </>)}
                {F.footerPhone && s.company_phone && (<>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  {field('field_footer_phone', <span>Ph: {s.company_phone}</span>, { display: 'inline-block', padding: '0 2px' })}
                </>)}
                {F.footerEmail && s.company_email && (<>
                  <span style={{ color: '#cbd5e1' }}>|</span>
                  {field('field_footer_email', <span>{s.company_email}</span>, { display: 'inline-block', padding: '0 2px' })}
                </>)}
              </div>
              {F.footerPage && field('field_footer_page', <span>Page 1 of 1</span>, { display: 'inline-block', padding: '0 2px' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
