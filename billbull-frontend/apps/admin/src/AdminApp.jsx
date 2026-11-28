import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { hasRole } from './auth/roles';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TenantsPage from './pages/TenantsPage';
import NewTenantPage from './pages/NewTenantPage';
import TenantDetailPage from './pages/TenantDetailPage';
import PlansPage from './pages/PlansPage';
import UsersPage from './pages/UsersPage';
import AuditPage from './pages/AuditPage';
import BackupsPage from './pages/BackupsPage';
import LiveClientsPage from './pages/LiveClientsPage';
import SupportPage from './pages/SupportPage';
import AccountPage from './pages/AccountPage';
import { Spinner } from './ui/kit';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/tenants', label: 'Clients' },
  { to: '/live', label: 'Live clients' },
  { to: '/backups', label: 'Backups' },
  { to: '/support', label: 'Support access' },
  { to: '/plans', label: 'Plans' },
  { to: '/audit', label: 'Audit log' },
  { to: '/users', label: 'Platform users', role: 'OWNER' },
];

function Shell({ children }) {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-800 bg-slate-900 text-slate-200 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F5C742] text-sm font-extrabold text-slate-900">BB</div>
          <div>
            <div className="text-sm font-semibold text-white">BillBull Platform</div>
            <div className="text-[11px] text-slate-400">Control Center</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-0.5 md:overflow-visible">
          {NAV.filter((n) => !n.role || hasRole(user, n.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block whitespace-nowrap rounded-md px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-800 px-5 py-4 text-xs md:block">
          <div className="truncate text-slate-300">{user?.email}</div>
          <div className="mt-0.5 text-slate-500">{user?.role}</div>
          <div className="mt-3 flex gap-3">
            <NavLink to="/account" className="text-slate-300 hover:text-white">Account</NavLink>
            <button type="button" onClick={signOut} className="text-slate-300 hover:text-white">Sign out</button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

export default function AdminApp() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (user.mustChangePassword) {
    return (
      <Shell>
        <AccountPage forced />
      </Shell>
    );
  }
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/tenants/new" element={hasRole(user, 'OPERATOR') ? <NewTenantPage /> : <Navigate to="/tenants" replace />} />
        <Route path="/tenants/:id/*" element={<TenantDetailPage />} />
        <Route path="/live" element={<LiveClientsPage />} />
        <Route path="/backups" element={<BackupsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/users" element={hasRole(user, 'OWNER') ? <UsersPage /> : <Navigate to="/" replace />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
