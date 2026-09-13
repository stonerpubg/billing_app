import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { assetUrl } from '../utils/asset.js';

const Field = ({ label, children }) => (
  <div>
    <label className="label">{label}</label>
    {children}
  </div>
);

export default function Settings() {
  const toast = useToast();
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  const [pw, setPw] = useState({ old: '', next: '', confirm: '' });

  useEffect(() => {
    window.api.settings.get().then(setS);
  }, []);

  if (!s) return <div className="text-slate-500">Loading…</div>;

  const set = (patch) => setS({ ...s, ...patch });

  const save = async () => {
    setSaving(true);
    const updated = await window.api.settings.update(s);
    setS(updated);
    setSaving(false);
    toast.success('Settings saved');
  };

  const uploadLogo = async () => {
    const path = await window.api.dialog.pickLogo();
    if (path) {
      const updated = await window.api.settings.update({ logo_path: path });
      setS(updated);
      toast.success('Logo updated');
    }
  };

  const removeLogo = async () => {
    const updated = await window.api.settings.update({ logo_path: '' });
    setS(updated);
    toast.success('Logo removed');
  };

  const uploadWatermark = async () => {
    const path = await window.api.dialog.pickWatermark();
    if (path) {
      const updated = await window.api.settings.update({ watermark_path: path });
      setS(updated);
      toast.success('Watermark updated');
    }
  };

  const removeWatermark = async () => {
    const updated = await window.api.settings.update({ watermark_path: '' });
    setS(updated);
    toast.success('Watermark removed');
  };

  const changePassword = async () => {
    if (!pw.old || !pw.next) {
      toast.error('All fields required');
      return;
    }
    if (pw.next.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    const res = await window.api.auth.changePassword({
      username: user.username,
      oldPassword: pw.old,
      newPassword: pw.next,
    });
    if (!res.ok) {
      toast.error(res.error || 'Failed');
      return;
    }
    setPw({ old: '', next: '', confirm: '' });
    toast.success('Password changed');
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Admin only — configure company details, quotation numbering, and branding."
        right={
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="card-title">Company details</div>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Company name">
              <input className="input" value={s.company_name || ''} onChange={(e) => set({ company_name: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <input className="input" value={s.company_tagline || ''} onChange={(e) => set({ company_tagline: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={s.company_phone || ''} onChange={(e) => set({ company_phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" value={s.company_email || ''} onChange={(e) => set({ company_email: e.target.value })} />
            </Field>
            <Field label="Website">
              <input className="input" value={s.company_website || ''} onChange={(e) => set({ company_website: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <input className="input" value={s.company_gstin || ''} onChange={(e) => set({ company_gstin: e.target.value })} />
            </Field>
            <Field label="PAN">
              <input className="input" value={s.company_pan || ''} onChange={(e) => set({ company_pan: e.target.value })} />
            </Field>
            <Field label="Pincode">
              <input className="input" value={s.company_pincode || ''} onChange={(e) => set({ company_pincode: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Address">
                <textarea className="input min-h-[70px]" value={s.company_address || ''} onChange={(e) => set({ company_address: e.target.value })} />
              </Field>
            </div>
            <Field label="City">
              <input className="input" value={s.company_city || ''} onChange={(e) => set({ company_city: e.target.value })} />
            </Field>
            <Field label="State">
              <input className="input" value={s.company_state || ''} onChange={(e) => set({ company_state: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Logo & Watermark</div>
          </div>
          <div className="card-body space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                Logo (header)
              </div>
              <div className="rounded-md border border-dashed border-slate-300 p-4 flex items-center justify-center bg-slate-50 min-h-[120px]">
                {s.logo_path ? (
                  <img
                    src={assetUrl(s.logo_path)}
                    alt="Logo"
                    className="max-h-24 object-contain"
                  />
                ) : (
                  <div className="text-slate-400 text-xs text-center">
                    No logo yet.
                    <br />
                    PNG/JPG. Transparent PNG recommended.
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary flex-1 text-xs" onClick={uploadLogo}>
                  {s.logo_path ? 'Change logo' : 'Upload logo'}
                </button>
                {s.logo_path && (
                  <button className="btn-secondary text-xs" onClick={removeLogo}>Remove</button>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
                Watermark (page center, faded)
              </div>
              <div className="rounded-md border border-dashed border-slate-300 p-4 flex items-center justify-center bg-slate-50 min-h-[120px] relative overflow-hidden">
                {s.watermark_path ? (
                  <img
                    src={assetUrl(s.watermark_path)}
                    alt="Watermark"
                    className="max-h-24 object-contain opacity-30"
                  />
                ) : (
                  <div className="text-slate-400 text-xs text-center">
                    No watermark yet.
                    <br />
                    Prints faded at page center on every page.
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button className="btn-primary flex-1 text-xs" onClick={uploadWatermark}>
                  {s.watermark_path ? 'Change watermark' : 'Upload watermark'}
                </button>
                {s.watermark_path && (
                  <button className="btn-secondary text-xs" onClick={removeWatermark}>Remove</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="card-title">Quotation numbering</div>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Prefix">
              <input className="input" value={s.quote_prefix || ''} onChange={(e) => set({ quote_prefix: e.target.value })} />
            </Field>
            <Field label="Padding (digits)">
              <input
                type="number"
                min="1"
                max="8"
                className="input"
                value={s.quote_number_padding || 4}
                onChange={(e) => set({ quote_number_padding: e.target.value })}
              />
            </Field>
            <Field label="Next number">
              <input
                type="number"
                min="1"
                className="input"
                value={s.quote_next_number || 1}
                onChange={(e) => set({ quote_next_number: e.target.value })}
              />
            </Field>
            <div className="md:col-span-3 text-xs text-slate-500">
              Preview: <code className="bg-slate-100 px-2 py-0.5 rounded">
                {(s.quote_prefix || '')}{String(s.quote_next_number || 1).padStart(Number(s.quote_number_padding || 4), '0')}
              </code>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Change password</div>
          </div>
          <div className="card-body space-y-3">
            <Field label="Current password">
              <input type="password" className="input" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
            </Field>
            <Field label="New password">
              <input type="password" className="input" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" className="input" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            <button className="btn-secondary w-full" onClick={changePassword}>
              Update password
            </button>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="card-header">
            <div className="card-title">Bank details (for PDF)</div>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Bank name">
              <input className="input" value={s.bank_name || ''} onChange={(e) => set({ bank_name: e.target.value })} />
            </Field>
            <Field label="Account number">
              <input className="input" value={s.bank_account || ''} onChange={(e) => set({ bank_account: e.target.value })} />
            </Field>
            <Field label="IFSC">
              <input className="input" value={s.bank_ifsc || ''} onChange={(e) => set({ bank_ifsc: e.target.value })} />
            </Field>
            <Field label="Branch">
              <input className="input" value={s.bank_branch || ''} onChange={(e) => set({ bank_branch: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="card lg:col-span-3">
          <div className="card-header">
            <div className="card-title">Default terms & conditions</div>
          </div>
          <div className="card-body">
            <textarea
              className="input min-h-[140px] font-mono text-xs"
              value={s.default_terms || ''}
              onChange={(e) => set({ default_terms: e.target.value })}
            />
            <p className="text-xs text-slate-500 mt-2">
              These are pre-filled into every new quotation. You can override per-quotation in the editor.
            </p>
          </div>
        </div>

        {/* Danger zone: data seeding / wiping */}
        <div className="card lg:col-span-3 border-red-200">
          <div className="card-header">
            <div className="card-title text-red-700">Sample data / Danger zone</div>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border border-slate-200 rounded-md bg-slate-50">
              <div className="font-semibold text-slate-800 mb-1">Seed sample data</div>
              <div className="text-xs text-slate-500 mb-3">
                Add ~5 customers, 4 vendors, 9 products, 4 employees with shifts, 60 days of attendance,
                12 quotations (mix of pending/billed/lost), 4 invoices, ~15 payments, 40 expenses, 2 payroll runs.
                Great for previewing reports & charts.
              </div>
              <button
                className="btn-secondary text-sm"
                onClick={async () => {
                  if (!confirm('Add sample data on top of existing? Safe to run multiple times but will pile up entries.')) return;
                  try {
                    await window.api.admin.seedSampleData();
                    toast.success('Sample data seeded — refresh pages to see it');
                  } catch (e) { toast.error(e.message); }
                }}
              >
                Seed sample data
              </button>
            </div>
            <div className="p-4 border border-red-200 rounded-md bg-red-50">
              <div className="font-semibold text-red-800 mb-1">Wipe all data</div>
              <div className="text-xs text-slate-600 mb-3">
                Deletes every quotation, invoice, payment, expense, employee, attendance, payroll run, customer, product, vendor.
                Keeps only your login users and settings. <strong>Cannot be undone.</strong>
              </div>
              <button
                className="text-sm px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  if (!confirm('DELETE ALL BUSINESS DATA? This cannot be undone.')) return;
                  if (!confirm('Really? Final confirmation.')) return;
                  try {
                    await window.api.admin.wipeAllData();
                    toast.success('All data wiped — refresh the app');
                  } catch (e) { toast.error(e.message); }
                }}
              >
                Wipe all data
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
