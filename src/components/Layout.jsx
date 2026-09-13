import { Link } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout({ children }) {
  const { user } = useAuth();
  return (
    <div className="h-full flex bg-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {user?.mustChangePassword && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-6 py-2.5 flex items-center gap-3">
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
        <div className="max-w-[1400px] mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
