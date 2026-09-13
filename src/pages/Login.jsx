import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState('user');
  const [username, setUsername] = useState('user');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error || 'Login failed');
      return;
    }
    if (res.user.role === 'admin' && role !== 'admin') {
      setErr('Use the User tab for user accounts, or select Admin above.');
      return;
    }
    if (res.user.role !== 'admin' && role === 'admin') {
      setErr('These credentials are not for an admin account.');
      return;
    }
    nav('/', { replace: true });
  };

  const chooseRole = (r) => {
    setRole(r);
    setUsername(r === 'admin' ? 'admin' : 'user');
    setPassword('');
    setErr('');
  };

  return (
    <div className="min-h-screen w-full flex items-stretch bg-gradient-to-br from-slate-900 to-brand-900 text-white">
      <div className="hidden lg:flex flex-1 flex-col justify-between p-14">
        <div>
          <div className="text-3xl font-extrabold tracking-tight">MRL Fabrications</div>
          <div className="text-brand-200 mt-1">Plumbing • Roofing • Electrical • Fabrication</div>
        </div>
        <div className="max-w-lg">
          <h2 className="text-4xl font-bold leading-tight">
            Professional quotations, generated in seconds.
          </h2>
          <p className="mt-4 text-brand-100">
            Create GST-compliant quotations, track statuses, manage customers and products,
            and export polished PDFs ready to send.
          </p>
          <ul className="mt-8 space-y-2 text-brand-100 text-sm">
            <li>✓ Automatic GST calculation per product</li>
            <li>✓ Sequential quotation numbering</li>
            <li>✓ PDF export with your branding</li>
            <li>✓ Admin controls for products & settings</li>
          </ul>
        </div>
        <div className="text-xs text-brand-200/70">© {new Date().getFullYear()} MRL Fabrications</div>
      </div>

      <div className="w-full lg:w-[440px] bg-white text-slate-900 flex flex-col justify-center p-10">
        <div className="max-w-sm w-full mx-auto">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">Choose your access level to continue.</p>

          <div className="mt-6 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => chooseRole('user')}
              className={
                'py-2 rounded text-sm font-semibold transition ' +
                (role === 'user' ? 'bg-white shadow text-brand-700' : 'text-slate-500')
              }
            >
              User
            </button>
            <button
              type="button"
              onClick={() => chooseRole('admin')}
              className={
                'py-2 rounded text-sm font-semibold transition ' +
                (role === 'admin' ? 'bg-white shadow text-brand-700' : 'text-slate-500')
              }
            >
              Admin
            </button>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {err && (
              <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
                {err}
              </div>
            )}
            <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
              {busy ? 'Signing in…' : `Sign in as ${role}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
