import { useEffect, useMemo, useRef, useState } from 'react';

export const ELEMENT_MAP = {
  header: {
    title: 'Company Header',
    controls: [
      { type: 'align', key: 'pdf_align_header', label: 'Alignment' },
      { type: 'slider', key: 'pdf_font_heading_size', label: 'Company name size', min: 12, max: 24, step: 0.5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_font_company_lines_size', label: 'Address / contact lines size', min: 6, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_brand_dark_color', label: 'Name color' },
      { type: 'color', key: 'pdf_muted_color', label: 'Tagline / detail color' },
      { type: 'slider', key: 'pdf_pos_header_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_header_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  logo: {
    title: 'Logo',
    controls: [
      { type: 'slider', key: 'pdf_logo_size', label: 'Size', min: 30, max: 160, step: 2, suffix: 'pt' },
      { type: 'slider', key: 'pdf_logo_x_offset', label: 'Horizontal offset', min: -200, max: 200, step: 2, suffix: 'pt' },
      { type: 'slider', key: 'pdf_logo_y_offset', label: 'Vertical offset', min: -100, max: 100, step: 2, suffix: 'pt' },
    ],
  },
  title: {
    title: 'Title Bar',
    controls: [
      { type: 'text', key: 'pdf_quote_title', label: 'Title text' },
      { type: 'slider', key: 'pdf_font_title_size', label: 'Title size', min: 9, max: 20, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_brand_color', label: 'Title background' },
      { type: 'color', key: 'pdf_brand_dark_color', label: 'Meta background' },
      { type: 'slider', key: 'pdf_pos_title_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_title_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  billTo: {
    title: 'Quote To',
    controls: [
      { type: 'align', key: 'pdf_align_billTo', label: 'Alignment' },
      { type: 'slider', key: 'pdf_font_billTo_size', label: 'Font size', min: 7, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_text_color', label: 'Text color' },
      { type: 'color', key: 'pdf_muted_color', label: 'Label color' },
      { type: 'color', key: 'pdf_brand_dark_color', label: 'Section tag color' },
      { type: 'slider', key: 'pdf_pos_billTo_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_billTo_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  items: {
    title: 'Items Table',
    controls: [
      { type: 'slider', key: 'pdf_font_items_size', label: 'Row / header text size', min: 6, max: 12, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_brand_color', label: 'Header row color' },
      { type: 'color', key: 'pdf_text_color', label: 'Row text color' },
      { type: 'toggle', key: 'pdf_show_unit_column', label: 'Show Unit column' },
      { type: 'toggle', key: 'pdf_show_taxable_column', label: 'Show Taxable column' },
      { type: 'toggle', key: 'pdf_show_cgst_column', label: 'Show CGST column' },
      { type: 'toggle', key: 'pdf_show_sgst_column', label: 'Show SGST column' },
      { type: 'slider', key: 'pdf_pos_items_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_items_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  col_sno: { title: 'S.No Column', controls: [{ type: 'color', key: 'pdf_brand_color', label: 'Header background' }] },
  col_desc: {
    title: 'Description Column',
    controls: [
      { type: 'color', key: 'pdf_brand_color', label: 'Header background' },
      { type: 'slider', key: 'pdf_font_base_size', label: 'Body text size', min: 7, max: 12, step: 0.5, suffix: 'pt' },
    ],
  },
  col_qty: { title: 'Qty Column', controls: [{ type: 'color', key: 'pdf_brand_color', label: 'Header background' }] },
  col_unit: {
    title: 'Unit Column',
    controls: [
      { type: 'toggle', key: 'pdf_show_unit_column', label: 'Show this column' },
      { type: 'color', key: 'pdf_brand_color', label: 'Header background' },
    ],
  },
  col_rate: { title: 'Rate Column', controls: [{ type: 'color', key: 'pdf_brand_color', label: 'Header background' }] },
  col_taxable: {
    title: 'Taxable Column',
    controls: [
      { type: 'toggle', key: 'pdf_show_taxable_column', label: 'Show this column' },
      { type: 'color', key: 'pdf_brand_color', label: 'Header background' },
    ],
  },
  col_cgst: {
    title: 'CGST Column',
    controls: [
      { type: 'toggle', key: 'pdf_show_cgst_column', label: 'Show this column' },
      { type: 'color', key: 'pdf_brand_color', label: 'Header background' },
    ],
  },
  col_sgst: {
    title: 'SGST Column',
    controls: [
      { type: 'toggle', key: 'pdf_show_sgst_column', label: 'Show this column' },
      { type: 'color', key: 'pdf_brand_color', label: 'Header background' },
    ],
  },
  col_total: { title: 'Total Column', controls: [{ type: 'color', key: 'pdf_brand_color', label: 'Header background' }] },
  grandTotal: {
    title: 'Grand Total Row',
    controls: [
      { type: 'slider', key: 'pdf_grand_total_font_size', label: 'Font size', min: 8, max: 24, step: 0.5, suffix: 'pt' },
      { type: 'toggle', key: 'pdf_grand_total_solid_bg', label: 'Solid brand background' },
      { type: 'color', key: 'pdf_brand_color', label: 'Background (when solid)' },
      { type: 'color', key: 'pdf_text_color', label: 'Text color (when no bg)' },
    ],
  },
  amountInWords: {
    title: 'Amount in Words',
    controls: [
      { type: 'toggle', key: 'pdf_show_amount_in_words', label: 'Show this section' },
      { type: 'slider', key: 'pdf_font_amountInWords_size', label: 'Font size', min: 7, max: 16, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_brand_color', label: 'Border color' },
      { type: 'color', key: 'pdf_brand_dark_color', label: 'Text color' },
      { type: 'slider', key: 'pdf_pos_amountInWords_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_amountInWords_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  terms: {
    title: 'Terms & Conditions',
    controls: [
      { type: 'toggle', key: 'pdf_show_terms', label: 'Show terms' },
      { type: 'align', key: 'pdf_align_terms', label: 'Alignment' },
      { type: 'slider', key: 'pdf_font_terms_size', label: 'Text size', min: 6, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_terms_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_terms_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  notes: {
    title: 'Notes',
    controls: [
      { type: 'toggle', key: 'pdf_show_notes', label: 'Show notes' },
      { type: 'align', key: 'pdf_align_notes', label: 'Alignment' },
      { type: 'slider', key: 'pdf_font_notes_size', label: 'Text size', min: 6, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_notes_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_notes_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  bank: {
    title: 'Bank Details',
    controls: [
      { type: 'toggle', key: 'pdf_show_bank', label: 'Show bank details' },
      { type: 'slider', key: 'pdf_font_bank_size', label: 'Text size', min: 6, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_bank_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_bank_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  signature: {
    title: 'Signature',
    controls: [
      { type: 'toggle', key: 'pdf_show_signature', label: 'Show signature block' },
      { type: 'align', key: 'pdf_align_signature', label: 'Alignment' },
      { type: 'slider', key: 'pdf_font_signature_size', label: 'Text size', min: 6, max: 14, step: 0.5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_signature_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_signature_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },
  watermark: {
    title: 'Watermark',
    controls: [
      { type: 'toggle', key: 'pdf_show_watermark', label: 'Show watermark' },
      { type: 'slider', key: 'pdf_watermark_size', label: 'Size', min: 150, max: 600, step: 10, suffix: 'pt' },
      { type: 'slider', key: 'pdf_watermark_opacity', label: 'Opacity', min: 0.03, max: 0.5, step: 0.01 },
      { type: 'slider', key: 'pdf_watermark_x_offset', label: 'Horizontal offset', min: -200, max: 200, step: 5, suffix: 'pt' },
      { type: 'slider', key: 'pdf_watermark_y_offset', label: 'Vertical offset', min: -300, max: 300, step: 5, suffix: 'pt' },
    ],
  },
  footer: {
    title: 'Footer',
    controls: [
      { type: 'slider', key: 'pdf_font_footer_size', label: 'Text size', min: 5, max: 12, step: 0.5, suffix: 'pt' },
      { type: 'color', key: 'pdf_muted_color', label: 'Text color' },
      { type: 'slider', key: 'pdf_pos_footer_x', label: 'X offset', min: -200, max: 200, step: 1, suffix: 'pt' },
      { type: 'slider', key: 'pdf_pos_footer_y', label: 'Y offset', min: -100, max: 100, step: 1, suffix: 'pt' },
    ],
  },

  // ---- Per-field entries ----
  field_company_name: { title: 'Company Name field', controls: [{ type: 'toggle', key: 'pdf_show_company_name', label: 'Show field' }] },
  field_company_tagline: { title: 'Tagline field', controls: [{ type: 'toggle', key: 'pdf_show_company_tagline', label: 'Show field' }] },
  field_company_address: { title: 'Address field', controls: [{ type: 'toggle', key: 'pdf_show_company_address', label: 'Show field' }] },
  field_company_location: { title: 'City / State / Pincode', controls: [{ type: 'toggle', key: 'pdf_show_company_location', label: 'Show field' }] },
  field_company_contact: { title: 'Phone / Email / Web', controls: [{ type: 'toggle', key: 'pdf_show_company_contact', label: 'Show field' }] },

  field_quote_no: { title: 'Quote Number', controls: [{ type: 'toggle', key: 'pdf_show_quote_no', label: 'Show field' }, { type: 'color', key: 'pdf_brand_dark_color', label: 'Background color' }] },
  field_quote_date: { title: 'Quote Date', controls: [{ type: 'toggle', key: 'pdf_show_quote_date', label: 'Show field' }, { type: 'color', key: 'pdf_brand_dark_color', label: 'Background color' }] },

  field_bill_name: { title: 'Bill To — Name', controls: [{ type: 'toggle', key: 'pdf_show_bill_name', label: 'Show field' }] },
  field_bill_attn: { title: 'Bill To — Attn', controls: [{ type: 'toggle', key: 'pdf_show_bill_attn', label: 'Show field' }] },
  field_bill_address: { title: 'Bill To — Address', controls: [{ type: 'toggle', key: 'pdf_show_bill_address', label: 'Show field' }] },
  field_bill_location: { title: 'Bill To — City', controls: [{ type: 'toggle', key: 'pdf_show_bill_location', label: 'Show field' }] },
  field_bill_phone: { title: 'Bill To — Phone', controls: [{ type: 'toggle', key: 'pdf_show_bill_phone', label: 'Show field' }] },
  field_bill_email: { title: 'Bill To — Email', controls: [{ type: 'toggle', key: 'pdf_show_bill_email', label: 'Show field' }] },
  field_bill_gstin: { title: 'Bill To — GSTIN', controls: [{ type: 'toggle', key: 'pdf_show_bill_gstin', label: 'Show field' }] },
  field_bill_subject: { title: 'Bill To — Subject', controls: [{ type: 'toggle', key: 'pdf_show_bill_subject', label: 'Show field' }] },

  field_footer_name: { title: 'Footer — Company name', controls: [{ type: 'toggle', key: 'pdf_show_footer_name', label: 'Show field' }] },
  field_footer_gstin: { title: 'Footer — GSTIN', controls: [{ type: 'toggle', key: 'pdf_show_footer_gstin', label: 'Show field' }] },
  field_footer_pan: { title: 'Footer — PAN', controls: [{ type: 'toggle', key: 'pdf_show_footer_pan', label: 'Show field' }] },
  field_footer_phone: { title: 'Footer — Phone', controls: [{ type: 'toggle', key: 'pdf_show_footer_phone', label: 'Show field' }] },
  field_footer_email: { title: 'Footer — Email', controls: [{ type: 'toggle', key: 'pdf_show_footer_email', label: 'Show field' }] },
  field_footer_page: { title: 'Footer — Page number', controls: [{ type: 'toggle', key: 'pdf_show_footer_page', label: 'Show field' }] },
};

function ColorInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-10 h-8 rounded border border-slate-300 cursor-pointer"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="text"
        className="input py-1 text-xs"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Slider({ value, onChange, min, max, step = 1, suffix = '' }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <input
          type="number"
          className="input py-0.5 text-xs w-20"
          value={value ?? min}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-brand-600"
      />
    </div>
  );
}

function AlignPicker({ value, onChange }) {
  const opts = [
    { key: 'left', label: 'Left', d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
    { key: 'center', label: 'Center', d: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
    { key: 'right', label: 'Right', d: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  ];
  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-md">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          title={o.label}
          className={
            'flex-1 flex items-center justify-center py-1.5 rounded transition ' +
            (value === o.key ? 'bg-white shadow text-brand-700' : 'text-slate-500 hover:text-slate-700')
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d={o.d} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange, label }) {
  const on = String(value) === 'true';
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(on ? 'false' : 'true')}
        className={
          'relative inline-flex h-5 w-9 items-center rounded-full transition ' +
          (on ? 'bg-brand-600' : 'bg-slate-300')
        }
      >
        <span
          className={
            'inline-block h-4 w-4 transform rounded-full bg-white transition ' +
            (on ? 'translate-x-4' : 'translate-x-0.5')
          }
        />
      </button>
      <span className="text-xs text-slate-700">{label}</span>
    </label>
  );
}

export default function ElementInspector({
  elementKey,
  anchorRect,
  values,
  onChange,
  onClose,
  containerRef,
  customElement,      // if selected element is a custom text, this is the object
  onCustomChange,     // (id, patch) => void
  onCustomDelete,     // (id) => void
}) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const isCustom = Boolean(customElement);
  const config = isCustom
    ? {
        title: 'Custom Text',
        controls: [
          { type: 'text', key: 'text', label: 'Content' },
          { type: 'slider', key: 'fontSize', label: 'Font size', min: 6, max: 48, step: 0.5, suffix: 'pt' },
          { type: 'color', key: 'color', label: 'Text color' },
          { type: 'align', key: 'align', label: 'Alignment' },
          { type: 'toggle', key: 'bold', label: 'Bold' },
          { type: 'toggle', key: 'italic', label: 'Italic' },
          { type: 'slider', key: 'x', label: 'X position', min: 0, max: 560, step: 1, suffix: 'pt' },
          { type: 'slider', key: 'y', label: 'Y position', min: 0, max: 800, step: 1, suffix: 'pt' },
        ],
      }
    : ELEMENT_MAP[elementKey];

  // Position the popover next to the anchor rect, keeping it in the container's viewport
  useEffect(() => {
    if (!anchorRect || !popRef.current || !containerRef?.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pop = popRef.current.getBoundingClientRect();

    // Anchor relative to container
    const anchorX = anchorRect.left - containerRect.left;
    const anchorY = anchorRect.top - containerRect.top;
    const anchorRight = anchorRect.right - containerRect.left;

    let left = anchorRight + 12;
    if (left + pop.width > containerRect.width - 12) {
      left = Math.max(12, anchorX - pop.width - 12);
    }
    let top = anchorY;
    if (top + pop.height > containerRect.height - 12) {
      top = Math.max(12, containerRect.height - pop.height - 12);
    }
    setPos({ top, left });
  }, [anchorRect, containerRef]);

  const controls = useMemo(() => (config ? config.controls : []), [config]);
  if (!config || !anchorRect) return null;

  const renderControl = (c) => {
    // Custom text: value + setter come from the customElement object; toggles are booleans
    let v;
    let set;
    if (isCustom) {
      v = customElement[c.key];
      set = (val) => {
        let out = val;
        if (c.type === 'slider') out = Number(val);
        if (c.type === 'toggle') out = val === 'true' || val === true;
        onCustomChange(customElement.id, { [c.key]: out });
      };
    } else {
      v = values[c.key];
      set = (val) => onChange(c.key, String(val));
    }
    if (c.type === 'color') return <ColorInput value={v} onChange={set} />;
    if (c.type === 'slider') return <Slider value={v} onChange={set} min={c.min} max={c.max} step={c.step} suffix={c.suffix} />;
    if (c.type === 'toggle') return <Toggle value={v} onChange={set} label={c.label} />;
    if (c.type === 'align') return <AlignPicker value={v || 'left'} onChange={set} />;
    if (c.type === 'text')
      return (
        <input
          type="text"
          className="input py-1 text-xs"
          value={v || ''}
          onChange={(e) => set(e.target.value)}
        />
      );
    return null;
  };

  return (
    <div
      ref={popRef}
      className="absolute z-30 bg-white rounded-lg shadow-2xl border border-slate-200 w-72 overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
            Editing
          </div>
          <div className="text-sm font-semibold text-slate-800">{config.title}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:bg-slate-200"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
      <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
        {controls.map((c, i) => (
          <div key={c.key + '-' + i}>
            {c.type !== 'toggle' && (
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                {c.label}
              </label>
            )}
            {renderControl(c)}
          </div>
        ))}
        {isCustom && (
          <div className="pt-3 mt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this text element?')) {
                  onCustomDelete(customElement.id);
                  onClose();
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" />
              </svg>
              Delete text
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
