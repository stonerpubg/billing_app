import { useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import PdfHtmlMock from '../components/PdfHtmlMock.jsx';
import ElementInspector from '../components/ElementInspector.jsx';
import PdfPreviewModal from '../components/PdfPreviewModal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { assetUrl } from '../utils/asset.js';

const DESIGN_KEYS = [
  'pdf_brand_color',
  'pdf_brand_dark_color',
  'pdf_text_color',
  'pdf_muted_color',
  'pdf_font_base_size',
  'pdf_font_heading_size',
  'pdf_font_title_size',
  'pdf_logo_size',
  'pdf_logo_x_offset',
  'pdf_logo_y_offset',
  'pdf_quote_title',
  'pdf_show_watermark',
  'pdf_watermark_size',
  'pdf_watermark_opacity',
  'pdf_watermark_x_offset',
  'pdf_watermark_y_offset',
  'pdf_show_bank',
  'pdf_show_signature',
  'pdf_show_terms',
  'pdf_show_notes',
  'pdf_show_amount_in_words',
  'pdf_show_unit_column',
  'pdf_show_taxable_column',
  'pdf_show_cgst_column',
  'pdf_show_sgst_column',
  'pdf_grand_total_solid_bg',
  'pdf_grand_total_font_size',
  'pdf_font_company_lines_size',
  'pdf_font_billTo_size',
  'pdf_font_items_size',
  'pdf_font_amountInWords_size',
  'pdf_font_terms_size',
  'pdf_font_notes_size',
  'pdf_font_bank_size',
  'pdf_font_signature_size',
  'pdf_font_footer_size',
  'pdf_custom_elements',
  // Per-field toggles
  'pdf_show_company_name',
  'pdf_show_company_tagline',
  'pdf_show_company_address',
  'pdf_show_company_location',
  'pdf_show_company_contact',
  'pdf_show_quote_no',
  'pdf_show_quote_date',
  'pdf_show_bill_name',
  'pdf_show_bill_attn',
  'pdf_show_bill_address',
  'pdf_show_bill_location',
  'pdf_show_bill_phone',
  'pdf_show_bill_email',
  'pdf_show_bill_gstin',
  'pdf_show_bill_subject',
  'pdf_show_footer_name',
  'pdf_show_footer_gstin',
  'pdf_show_footer_pan',
  'pdf_show_footer_phone',
  'pdf_show_footer_email',
  'pdf_show_footer_page',
  // Alignments
  'pdf_align_header',
  'pdf_align_billTo',
  'pdf_align_terms',
  'pdf_align_notes',
  'pdf_align_signature',
  // Block position offsets (X/Y)
  'pdf_pos_header_x', 'pdf_pos_header_y',
  'pdf_pos_title_x', 'pdf_pos_title_y',
  'pdf_pos_billTo_x', 'pdf_pos_billTo_y',
  'pdf_pos_items_x', 'pdf_pos_items_y',
  'pdf_pos_amountInWords_x', 'pdf_pos_amountInWords_y',
  'pdf_pos_terms_x', 'pdf_pos_terms_y',
  'pdf_pos_notes_x', 'pdf_pos_notes_y',
  'pdf_pos_bank_x', 'pdf_pos_bank_y',
  'pdf_pos_signature_x', 'pdf_pos_signature_y',
  'pdf_pos_footer_x', 'pdf_pos_footer_y',
];

const DEFAULTS = {
  pdf_brand_color: '#2b48d0',
  pdf_brand_dark_color: '#1a2766',
  pdf_text_color: '#0f172a',
  pdf_muted_color: '#64748b',
  pdf_font_base_size: '9.5',
  pdf_font_heading_size: '16',
  pdf_font_title_size: '12',
  pdf_logo_size: '60',
  pdf_logo_x_offset: '0',
  pdf_logo_y_offset: '0',
  pdf_quote_title: 'QUOTATION',
  pdf_show_watermark: 'true',
  pdf_watermark_size: '420',
  pdf_watermark_opacity: '0.14',
  pdf_watermark_x_offset: '0',
  pdf_watermark_y_offset: '0',
  pdf_show_bank: 'true',
  pdf_show_signature: 'true',
  pdf_show_terms: 'true',
  pdf_show_notes: 'true',
  pdf_show_amount_in_words: 'true',
  pdf_show_unit_column: 'true',
  pdf_show_taxable_column: 'true',
  pdf_show_cgst_column: 'true',
  pdf_show_sgst_column: 'true',
  pdf_grand_total_solid_bg: 'true',
  pdf_grand_total_font_size: '12',
  pdf_font_company_lines_size: '9',
  pdf_font_billTo_size: '9.5',
  pdf_font_items_size: '8.5',
  pdf_font_amountInWords_size: '10',
  pdf_font_terms_size: '8.5',
  pdf_font_notes_size: '8.5',
  pdf_font_bank_size: '9',
  pdf_font_signature_size: '9',
  pdf_font_footer_size: '8',
  pdf_custom_elements: '[]',
  pdf_show_company_name: 'true',
  pdf_show_company_tagline: 'true',
  pdf_show_company_address: 'true',
  pdf_show_company_location: 'true',
  pdf_show_company_contact: 'true',
  pdf_show_quote_no: 'true',
  pdf_show_quote_date: 'true',
  pdf_show_bill_name: 'true',
  pdf_show_bill_attn: 'true',
  pdf_show_bill_address: 'true',
  pdf_show_bill_location: 'true',
  pdf_show_bill_phone: 'true',
  pdf_show_bill_email: 'true',
  pdf_show_bill_gstin: 'true',
  pdf_show_bill_subject: 'true',
  pdf_show_footer_name: 'true',
  pdf_show_footer_gstin: 'true',
  pdf_show_footer_pan: 'true',
  pdf_show_footer_phone: 'true',
  pdf_show_footer_email: 'true',
  pdf_show_footer_page: 'true',
  pdf_align_header: 'center',
  pdf_align_billTo: 'left',
  pdf_align_terms: 'left',
  pdf_align_notes: 'left',
  pdf_align_signature: 'center',
  pdf_pos_header_x: '0', pdf_pos_header_y: '0',
  pdf_pos_title_x: '0', pdf_pos_title_y: '0',
  pdf_pos_billTo_x: '0', pdf_pos_billTo_y: '0',
  pdf_pos_items_x: '0', pdf_pos_items_y: '0',
  pdf_pos_amountInWords_x: '0', pdf_pos_amountInWords_y: '0',
  pdf_pos_terms_x: '0', pdf_pos_terms_y: '0',
  pdf_pos_notes_x: '0', pdf_pos_notes_y: '0',
  pdf_pos_bank_x: '0', pdf_pos_bank_y: '0',
  pdf_pos_signature_x: '0', pdf_pos_signature_y: '0',
  pdf_pos_footer_x: '0', pdf_pos_footer_y: '0',
};

const PRESETS = [
  { name: 'Blue', values: { pdf_brand_color: '#2b48d0', pdf_brand_dark_color: '#1a2766' } },
  { name: 'Green', values: { pdf_brand_color: '#15803d', pdf_brand_dark_color: '#14532d' } },
  { name: 'Orange', values: { pdf_brand_color: '#ea580c', pdf_brand_dark_color: '#9a3412' } },
  { name: 'Slate', values: { pdf_brand_color: '#475569', pdf_brand_dark_color: '#1e293b' } },
  { name: 'Purple', values: { pdf_brand_color: '#7c3aed', pdf_brand_dark_color: '#4c1d95' } },
  { name: 'Red', values: { pdf_brand_color: '#dc2626', pdf_brand_dark_color: '#7f1d1d' } },
];

// Map element key → its X/Y offset setting keys (used by arrow-key nudging)
const OFFSET_KEYS = {
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
  logo: ['pdf_logo_x_offset', 'pdf_logo_y_offset'],
  watermark: ['pdf_watermark_x_offset', 'pdf_watermark_y_offset'],
};

const CLICKABLE_LEGEND = [
  { key: 'header', label: 'Company header' },
  { key: 'logo', label: 'Logo' },
  { key: 'title', label: 'Title bar' },
  { key: 'billTo', label: 'Quote To' },
  { key: 'items', label: 'Items table' },
  { key: 'grandTotal', label: 'Grand Total row' },
  { key: 'amountInWords', label: 'Amount in words' },
  { key: 'terms', label: 'Terms' },
  { key: 'notes', label: 'Notes' },
  { key: 'bank', label: 'Bank details' },
  { key: 'signature', label: 'Signature' },
  { key: 'watermark', label: 'Watermark' },
  { key: 'footer', label: 'Footer' },
];

function ImageCard({ title, path, hint, onUpload, onRemove, faded }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title text-sm">{title}</div>
      </div>
      <div className="card-body space-y-2">
        <div className="rounded-md border border-dashed border-slate-300 p-3 flex items-center justify-center bg-slate-50 min-h-[100px]">
          {path ? (
            <img
              src={assetUrl(path)}
              alt={title}
              className={'max-h-20 object-contain ' + (faded ? 'opacity-40' : '')}
            />
          ) : (
            <div className="text-slate-400 text-[10px] text-center leading-snug">{hint}</div>
          )}
        </div>
        <div className="flex gap-1">
          <button className="btn-primary flex-1 text-xs py-1.5" onClick={onUpload}>
            {path ? 'Change' : 'Upload'}
          </button>
          {path && (
            <button className="btn-secondary text-xs py-1.5" onClick={onRemove}>Remove</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PdfDesigner() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState(DEFAULTS);
  const [savedValues, setSavedValues] = useState(DEFAULTS);
  const [settings, setSettings] = useState({});
  const [quotation, setQuotation] = useState(null);
  const [selected, setSelected] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const stageRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [s, q] = await Promise.all([
        window.api.settings.get(),
        window.api.quotations.latestOrDemo(),
      ]);
      setSettings(s);
      setQuotation(q);
      const loaded = {};
      for (const k of DESIGN_KEYS) loaded[k] = s[k] ?? DEFAULTS[k];
      setValues(loaded);
      setSavedValues(loaded);
      setLoaded(true);
    })();
  }, []);

  const dirty = useMemo(
    () => DESIGN_KEYS.some((k) => String(values[k] ?? '') !== String(savedValues[k] ?? '')),
    [values, savedValues]
  );

  const set = (k, v) => setValues((prev) => ({ ...prev, [k]: String(v) }));

  // Custom text elements — parsed from JSON in values.pdf_custom_elements
  const customElements = useMemo(() => {
    try {
      const arr = JSON.parse(values.pdf_custom_elements || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (_e) {
      return [];
    }
  }, [values.pdf_custom_elements]);

  const selectedCustom = useMemo(
    () => (selected ? customElements.find((el) => el.id === selected) : null),
    [selected, customElements]
  );

  const writeCustom = (next) => {
    set('pdf_custom_elements', JSON.stringify(next));
  };

  const updateCustom = (id, patch) => {
    writeCustom(customElements.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  };

  const deleteCustom = (id) => {
    writeCustom(customElements.filter((el) => el.id !== id));
  };

  const addCustomText = () => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const el = {
      id,
      text: 'New text',
      x: 40,
      y: 400,
      fontSize: 10,
      color: '#0f172a',
      align: 'left',
      bold: false,
      italic: false,
    };
    writeCustom([...customElements, el]);
    setSelected(id);
    setAnchorRect(null);
    // Give the mock a beat to render, then find & anchor the inspector to it
    setTimeout(() => {
      const domEl = stageRef.current?.querySelector(`[data-region="${id}"]`);
      if (domEl) setAnchorRect(domEl.getBoundingClientRect());
    }, 30);
  };

  // Arrow-key nudging when a positionable element (or custom text) is selected
  useEffect(() => {
    if (!selected) return;
    const keys = OFFSET_KEYS[selected];
    const isCustom = selected.startsWith('custom_');
    if (!keys && !isCustom) return;
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else if (e.key === 'ArrowUp') dy = -1;
      else if (e.key === 'ArrowDown') dy = 1;
      else return;
      if (e.shiftKey) { dx *= 10; dy *= 10; }
      e.preventDefault();
      if (isCustom) {
        const el = customElements.find((c) => c.id === selected);
        if (!el) return;
        updateCustom(selected, { x: Math.round((el.x || 0) + dx), y: Math.round((el.y || 0) + dy) });
      } else {
        setValues((prev) => ({
          ...prev,
          [keys[0]]: String(Math.round(Number(prev[keys[0]] || 0) + dx)),
          [keys[1]]: String(Math.round(Number(prev[keys[1]] || 0) + dy)),
        }));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, customElements]);

  const handleSelect = (key, rect) => {
    setSelected(key);
    setAnchorRect(rect);
  };

  const refreshSettings = async () => {
    const s = await window.api.settings.get();
    setSettings(s);
  };

  const uploadLogo = async () => {
    const p = await window.api.dialog.pickLogo();
    if (p) {
      await window.api.settings.update({ logo_path: p });
      await refreshSettings();
      toast.success('Logo updated');
    }
  };
  const removeLogo = async () => {
    await window.api.settings.update({ logo_path: '' });
    await refreshSettings();
    toast.success('Logo removed');
  };
  const uploadWatermark = async () => {
    const p = await window.api.dialog.pickWatermark();
    if (p) {
      await window.api.settings.update({ watermark_path: p });
      await refreshSettings();
      toast.success('Watermark updated');
    }
  };
  const removeWatermark = async () => {
    await window.api.settings.update({ watermark_path: '' });
    await refreshSettings();
    toast.success('Watermark removed');
  };

  const save = async () => {
    const patch = {};
    for (const k of DESIGN_KEYS) patch[k] = values[k];
    await window.api.settings.update(patch);
    setSavedValues(values);
    toast.success('Design saved — all future PDFs will use it');
  };

  const reset = () => {
    setValues(savedValues);
    setSelected(null);
    toast.info('Unsaved changes discarded');
  };

  const restoreDefaults = () => {
    if (!confirm('Reset design to factory defaults?')) return;
    setValues(DEFAULTS);
    setSelected(null);
  };

  const applyPreset = (preset) => {
    setValues((prev) => ({ ...prev, ...preset.values }));
    toast.info(`Applied preset: ${preset.name}`);
  };

  const openActualPreview = async () => {
    try {
      const res = await window.api.pdf.designerPreview(values);
      setPreviewData(res);
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (!loaded) return <div className="text-slate-500">Loading designer…</div>;

  return (
    <>
      <PageHeader
        title="PDF Designer"
        subtitle="Click any block to edit. Drag the logo or watermark to reposition. Save to publish your design."
        right={
          <>
            <button className="btn-ghost" onClick={restoreDefaults}>Restore defaults</button>
            <button className="btn-secondary" onClick={openActualPreview}>Preview actual PDF</button>
            <button className="btn-secondary" onClick={reset} disabled={!dirty}>Discard</button>
            <button className="btn-primary" onClick={save} disabled={!dirty}>Save design</button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
        {/* Left toolbar */}
        <div className="space-y-4 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <ImageCard
            title="Logo"
            path={settings.logo_path}
            hint="PNG/JPG. Transparent PNG recommended."
            onUpload={uploadLogo}
            onRemove={removeLogo}
          />

          <ImageCard
            title="Watermark"
            path={settings.watermark_path}
            hint="Faded image centered on every page. Drag in preview to reposition."
            onUpload={uploadWatermark}
            onRemove={removeWatermark}
            faded
          />

          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Custom text</div>
            </div>
            <div className="card-body space-y-2">
              <button
                onClick={addCustomText}
                className="w-full btn-primary text-xs py-1.5 flex items-center justify-center gap-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Text
              </button>
              {customElements.length === 0 && (
                <div className="text-[10px] text-slate-500 leading-snug px-1">
                  Add freeform text anywhere on the page. Drag to position, click to edit or delete.
                </div>
              )}
              {customElements.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {customElements.map((el) => (
                    <div
                      key={el.id}
                      onClick={() => {
                        const domEl = stageRef.current?.querySelector(`[data-region="${el.id}"]`);
                        if (domEl) {
                          domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setSelected(el.id);
                          setAnchorRect(domEl.getBoundingClientRect());
                        }
                      }}
                      className={
                        'flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer transition ' +
                        (selected === el.id
                          ? 'bg-brand-100 text-brand-800'
                          : 'text-slate-600 hover:bg-slate-100')
                      }
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 shrink-0 opacity-60">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
                      </svg>
                      <span className="truncate flex-1">{el.text || '(empty)'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this text element?')) deleteCustom(el.id);
                        }}
                        className="opacity-40 hover:opacity-100 hover:text-red-600 shrink-0"
                        title="Delete"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Color presets</div>
            </div>
            <div className="card-body grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p)}
                  className="flex items-center gap-2 border border-slate-200 rounded-md p-2 hover:border-brand-400 hover:bg-brand-50 transition text-left"
                >
                  <div className="flex gap-1">
                    <div className="w-3 h-5 rounded-sm" style={{ background: p.values.pdf_brand_color }} />
                    <div className="w-3 h-5 rounded-sm" style={{ background: p.values.pdf_brand_dark_color }} />
                  </div>
                  <div className="text-xs font-medium text-slate-700">{p.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Blocks</div>
            </div>
            <div className="card-body space-y-1 max-h-64 overflow-y-auto">
              {CLICKABLE_LEGEND.map((l) => (
                <button
                  key={l.key}
                  onClick={() => {
                    const el = stageRef.current?.querySelector(`[data-region="${l.key}"]`);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      const rect = el.getBoundingClientRect();
                      handleSelect(l.key, rect);
                    }
                  }}
                  className={
                    'w-full text-left px-2 py-1.5 rounded text-xs font-medium transition ' +
                    (selected === l.key
                      ? 'bg-brand-100 text-brand-800'
                      : 'text-slate-600 hover:bg-slate-100')
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-body text-xs text-slate-500 leading-relaxed">
              <div className="font-semibold text-slate-700 mb-1">Tips</div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Click any block or field to open its inspector.</li>
                <li>Every field has a <strong>Show field</strong> toggle in its inspector — turn off to hide.</li>
                <li><strong>Add Text</strong> to drop freeform text anywhere. Drag to move. Delete from its inspector.</li>
                <li><strong>Drag</strong> any block, logo, or watermark to reposition.</li>
                <li>With something selected, use <strong>← → ↑ ↓</strong> to nudge 1pt (hold <strong>Shift</strong> for 10pt).</li>
                <li>Nothing is saved until you click <strong>Save design</strong>.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Stage */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="card-title">Live mock — click to edit, drag to move logo/watermark</div>
            <div className="text-xs text-slate-500">
              {quotation?.quote_number ? `Using: ${quotation.quote_number}` : 'Loading…'}
            </div>
          </div>
          <div
            className="relative bg-slate-200 overflow-auto"
            style={{ maxHeight: 'calc(100vh - 220px)', minHeight: '70vh' }}
            ref={stageRef}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelected(null);
                setAnchorRect(null);
              }
            }}
          >
            <div className="py-6">
              <PdfHtmlMock
                values={values}
                settings={settings}
                quotation={quotation}
                selected={selected}
                onSelect={handleSelect}
                onDragValue={set}
                onCustomChange={updateCustom}
              />
            </div>

            <ElementInspector
              elementKey={selected}
              anchorRect={anchorRect}
              values={values}
              onChange={set}
              onClose={() => {
                setSelected(null);
                setAnchorRect(null);
              }}
              containerRef={stageRef}
              customElement={selectedCustom}
              onCustomChange={updateCustom}
              onCustomDelete={deleteCustom}
            />
          </div>
        </div>
      </div>

      <PdfPreviewModal
        data={previewOpen ? previewData : null}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
