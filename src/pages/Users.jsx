import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PAGE_PERMISSIONS } from '../utils/pagePermissions.js';

const emptyForm = () => ({
  id: null,
  username: '',
  password: '',
  role: 'user',
  allowed_pages: [],
});

export default function Users() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ id: null, username: '', newPassword: '' });

  const load = () => window.api.adminUsers.list().then(setRows).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(emptyForm()); setOpen(true); };
  const openEdit = (u) => {
    setForm({
      id: u.id,
      username: u.username,
      password: '',
      role: u.role,
      allowed_pages: Array.isArray(u.allowed_pages) ? u.allowed_pages : [],
    });
    setOpen(true);
  };

  const togglePage = (key) => {
    setForm((f) => {
      const set = new Set(f.allowed_pages || []);
      if (set.has(key)) set.delete(key); else set.add(key);
      return { ...f, allowed_pages: [...set] };
    });
  };
  const allowAll = () => setForm((f) => ({ ...f, allowed_pages: PAGE_PERMISSIONS.map((p) => p.key) }));
  const allowNone = () => setForm((f) => ({ ...f, allowed_pages: [] }));

  const save = async () => {
    const uname = (form.username || '').trim();
    if (!uname && !form.id) return toast.error('Username is required');
    if (!form.id && (!form.password || form.password.length < 6)) {
      return toast.error('Password must be at least 6 characters');
    }
    try {
      if (form.id) {
        await window.api.adminUsers.update({
          id: form.id,
          role: form.role,
          allowed_pages: form.allowed_pages,
        });
        toast.success('User updated');
      } else {
        await window.api.adminUsers.create({
          username: uname,
          password: form.password,
          role: form.role,
          allowed_pages: form.allowed_pages,
        });
        toast.success('User created');
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (u) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    try {
      await window.api.adminUsers.remove(u.id);
      toast.success('User deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const openResetPw = (u) => { setPwForm({ id: u.id, username: u.username, newPassword: '' }); setPwOpen(true); };
  const saveResetPw = async () => {
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }
    try {
      await window.api.adminUsers.resetPassword(pwForm.id, pwForm.newPassword);
      toast.success(`Password reset for ${pwForm.username}`);
      setPwOpen(false);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <>
      <PageHeader
        title="User management"
        subtitle="Add and manage users, roles, and page permissions"
        right={
          <button className="btn-primary" onClick={openNew}>+ Add user</button>
        }
      />

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Username</th>
                <th className="th">Role</th>
                <th className="th">Page access</th>
                <th className="th">Created</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td className="td text-sm text-slate-500" colSpan={5}>No users yet</td></tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{u.username}</td>
                  <td className="td">
                    <span className={
                      'px-2 py-0.5 rounded text-xs font-semibold ' +
                      (u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-700')
                    }>{u.role}</span>
                  </td>
                  <td className="td text-xs text-slate-600">
                    {u.role === 'admin'
                      ? 'All pages (admin)'
                      : (u.allowed_pages?.length
                          ? `${u.allowed_pages.length} page${u.allowed_pages.length > 1 ? 's' : ''}`
                          : 'None')}
                  </td>
                  <td className="td text-xs text-slate-500">{u.created_at?.slice(0, 10) || '—'}</td>
                  <td className="td text-right whitespace-nowrap">
                    <button className="btn-ghost text-xs" onClick={() => openEdit(u)}>Edit</button>
                    <button className="btn-ghost text-xs" onClick={() => openResetPw(u)}>Reset password</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit user' : 'Add user'} size="lg">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">Username</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={!!form.id}
              placeholder="e.g. rajesh"
            />
          </div>
          {!form.id && (
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="min 6 characters"
              />
            </div>
          )}
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">user</option>
              <option value="admin">admin (full access)</option>
            </select>
          </div>
          {form.role !== 'admin' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Page access</label>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="btn-ghost text-xs" onClick={allowAll}>Allow all</button>
                  <button type="button" className="btn-ghost text-xs" onClick={allowNone}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-64 overflow-y-auto border rounded p-2">
                {PAGE_PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm py-1 px-2 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowed_pages.includes(p.key)}
                      onChange={() => togglePage(p.key)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Non-admin users only see pages checked here. Admin pages (Products, Vendors, PDF Designer, Settings, Users) are always admin-only.
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button className="btn-primary flex-1" onClick={save}>Save</button>
            <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title={`Reset password — ${pwForm.username}`} size="sm">
        <div className="p-5 space-y-4">
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
              placeholder="min 6 characters"
              autoFocus
            />
          </div>
          <p className="text-xs text-slate-500">
            The user will be able to log in with this password immediately. Ask them to change it in Settings.
          </p>
          <div className="flex gap-2 pt-2">
            <button className="btn-primary flex-1" onClick={saveResetPw}>Reset password</button>
            <button className="btn-secondary flex-1" onClick={() => setPwOpen(false)}>Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
