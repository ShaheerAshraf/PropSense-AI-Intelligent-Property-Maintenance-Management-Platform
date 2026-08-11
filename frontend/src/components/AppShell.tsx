import { Link, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { labelize } from '../lib/constants';

type NavItem = { to: string; label: string };

function navForRole(role: string): NavItem[] {
  if (role === 'ADMIN') {
    return [
      { to: '/app/overview', label: 'Overview' },
      { to: '/app/notifications', label: 'Notifications' },
    ];
  }
  if (role === 'OWNER') {
    return [
      { to: '/app/overview', label: 'Overview' },
      { to: '/app/properties', label: 'Properties' },
      { to: '/app/maintenance', label: 'Maintenance' },
      { to: '/app/tenants', label: 'Tenants' },
      { to: '/app/technicians', label: 'Technicians' },
      { to: '/app/expenses', label: 'Expenses' },
      { to: '/app/ai', label: 'AI Insights' },
      { to: '/app/notifications', label: 'Notifications' },
    ];
  }
  if (role === 'TENANT') {
    return [
      { to: '/app/overview', label: 'Overview' },
      { to: '/app/requests', label: 'My Requests' },
      { to: '/app/requests/new', label: 'New Request' },
      { to: '/app/notifications', label: 'Notifications' },
    ];
  }
  return [
    { to: '/app/overview', label: 'Overview' },
    { to: '/app/assignments', label: 'Assignments' },
    { to: '/app/notifications', label: 'Notifications' },
  ];
}

export function AppShell() {
  const { user, token, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await api.unreadCount(token!);
        if (!cancelled) setUnread(res.count);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  if (!user) return null;
  const items = navForRole(user.role);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Link to="/app/overview" className="brand-mark" onClick={() => setMenuOpen(false)}>
          MaintainAI
        </Link>
        <p className="role-pill">{labelize(user.role)}</p>
        <nav className="side-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
              {item.to.includes('notifications') && unread > 0 ? (
                <span className="nav-badge">{unread}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="user-email">{user.email}</p>
          <button type="button" className="ghost-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="mobile-bar">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
          <span className="brand-mark compact">MaintainAI</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}
