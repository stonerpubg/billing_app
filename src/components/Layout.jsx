import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Auto-close the mobile drawer on route change so tapping a sidebar link
  // navigates + closes in one gesture.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Lock body scroll while the drawer is open so the backdrop doesn't jitter.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  return (
    <div className="h-full flex bg-slate-100">
      {/* Desktop sidebar (visible ≥ md) + mobile drawer (visible when open) */}
      <div
        className={
          'md:relative md:translate-x-0 md:block ' +
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out ' +
          (mobileOpen ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 flex items-center gap-3 px-4 py-2.5">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-700"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="text-sm font-bold tracking-tight truncate">MRL GROUP OF COMPANIES</div>
        </div>

        {user?.mustChangePassword && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 sm:px-6 py-2.5 flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14a2 2 0 001.75-3l-7.07-12a2 2 0 00-3.5 0l-7.07 12a2 2 0 001.75 3z" />
            </svg>
            <span className="flex-1">
              You're signed in with the default password. This is unsafe if the app is on the internet.
            </span>
            {user?.role === 'admin' ? (
              <Link to="/admin/settings" className="btn-secondary text-xs py-1 px-2.5">
                Change password
              </Link>
            ) : (
              <span className="text-xs">Ask your admin to change it.</span>
            )}
          </div>
        )}
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
