import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { getLogoUrl, uploadLogo } from "../api/studioApi";
import { useAuth } from "../context/AuthContext";

/* â”€â”€ SVG nav icons (inline â€” no library needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/>
      <rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>
    </svg>
  ),
  members: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      <polyline points="9 16 11 18 15 14"/>
    </svg>
  ),
  notifications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  auditLogs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  dataManagement: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
};

/* â”€â”€ Nav definition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const ALL_NAV = [
  { to: "/",                icon: Icons.dashboard,      label: "Dashboard",       adminOnly: false },
  { to: "/members",         icon: Icons.members,        label: "Members",          adminOnly: false },
  { to: "/payments",        icon: Icons.payments,       label: "Payments",         adminOnly: false },
  { to: "/attendance",      icon: Icons.attendance,     label: "Attendance",       adminOnly: false },
  { to: "/notifications",   icon: Icons.notifications,  label: "Notifications",    adminOnly: false },
  { to: "/users",           icon: Icons.users,          label: "Users",            adminOnly: true  },
  { to: "/audit-logs",      icon: Icons.auditLogs,      label: "Audit Logs",       adminOnly: true  },
  { to: "/data-management", icon: Icons.dataManagement, label: "Data Management",  adminOnly: true  },
];

/* Bottom nav shows 4 primary items + "More" drawer for the rest */
const BOTTOM_NAV_PRIMARY = ["/", "/members", "/payments", "/attendance"];

export default function Layout() {
  const { user, setUser, isAdmin } = useAuth();
  const [logoUrl, setLogoUrl]      = useState(null);
  const [logoError, setLogoError]  = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const fileRef  = useRef();
  const navigate = useNavigate();
  const location = useLocation();

  const username = user?.username || localStorage.getItem("username") || "user";
  const NAV      = ALL_NAV.filter((item) => !item.adminOnly || isAdmin);

  /* Items shown in bottom nav primary slots */
  const primaryNav  = NAV.filter((n) => BOTTOM_NAV_PRIMARY.includes(n.to));
  /* Items that overflow into the "More" drawer */
  const drawerNav   = NAV.filter((n) => !BOTTOM_NAV_PRIMARY.includes(n.to));

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setUser(null);
    navigate("/login", { replace: true });
  }

  /* Load studio logo */
  useEffect(() => {
    const url = getLogoUrl();
    fetch(url)
      .then((r) => { if (r.ok) setLogoUrl(url + "?t=" + Date.now()); })
      .catch(() => {});
  }, []);

  /* 30-minute inactivity logout */
  useEffect(() => {
    const LIMIT = 30 * 60 * 1000;
    let timer;
    function reset() {
      clearTimeout(timer);
      if (localStorage.getItem("token")) {
        timer = setTimeout(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("username");
          window.location.href = "/login";
        }, LIMIT);
      }
    }
    const EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    EVENTS.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { clearTimeout(timer); EVENTS.forEach((e) => window.removeEventListener(e, reset)); };
  }, []);

  async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadLogo(file);
      setLogoError(false);
      setLogoUrl(getLogoUrl() + "?t=" + Date.now());
    } catch {
      alert("Logo upload failed.");
    }
  }

  /* Close drawer when route changes */
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">

      {/* â•â• DESKTOP SIDEBAR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <aside className="sidebar">

        {/* Brand / logo */}
        <div className="sidebar-brand" onClick={() => fileRef.current.click()} title="Click to upload logo">
          <div className="sidebar-logo-wrap">
            {!logoError && logoUrl ? (
              <img src={logoUrl} alt="Logo" onError={() => setLogoError(true)} />
            ) : (
              <img
                src="/logo.jpg"
                alt="Jeeva Fitness"
                className="sidebar-logo-img"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleLogoUpload}
          />
          <div className="sidebar-app-name">JEEVA FITNESS</div>
          <div className="sidebar-app-sub">Gym Management</div>
        </div>

        {/* Navigation */}
        <nav>
          {NAV.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => isActive ? "active" : ""}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User / logout */}
        <div className="sidebar-footer">
          {user?.role && (
            <span className={`sidebar-role-badge ${user.role}`}>{user.role}</span>
          )}
          <div className="sidebar-username">
            Signed in as <strong>{username}</strong>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <span className="nav-icon" style={{ width: 15, height: 15 }}>{Icons.logout}</span>
            Sign Out
          </button>
        </div>

        {/* â”€â”€ Unalome decorative artwork â€” below Sign Out, in flow â”€â”€ */}
        <div className="sidebar-art-wrap" aria-hidden="true">
          <img
            
            alt=""
            className="sidebar-art"
            onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
          />
        </div>

      </aside>

      {/* â•â• PAGE CONTENT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* â•â• MOBILE BOTTOM NAV â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <nav className="mobile-nav">
        {primaryNav.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              ["mobile-nav-item", isActive ? "active" : ""].join(" ").trim()
            }
          >
            {icon}
            <span>{label}</span>
          </NavLink>
        ))}

        {/* More button â€” only show if there are drawer items */}
        {drawerNav.length > 0 && (
          <button
            className={`mobile-nav-item${drawerOpen ? " active" : ""}`}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="More"
          >
            {Icons.more}
            <span>More</span>
          </button>
        )}
      </nav>

      {/* â•â• MOBILE MORE DRAWER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {drawerOpen && (
        <>
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="mobile-drawer">
            {drawerNav.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  ["mobile-drawer-item", isActive ? "active" : ""].join(" ").trim()
                }
                onClick={() => setDrawerOpen(false)}
              >
                <span className="nav-icon">{icon}</span>
                {label}
              </NavLink>
            ))}

            <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "8px 0" }} />

            {/* Username + logout in drawer */}
            <div style={{ padding: "6px 24px 4px", fontSize: "0.75rem", color: "var(--sidebar-muted)" }}>
              Signed in as <strong style={{ color: "var(--sidebar-text)" }}>{username}</strong>
            </div>
            <button
              className="mobile-drawer-item"
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: "#f08080", fontFamily: "var(--font-sans)", fontSize: "0.9rem", fontWeight: 400 }}
              onClick={handleLogout}
            >
              <span className="nav-icon">{Icons.logout}</span>
              Sign Out
            </button>
          </div>
        </>
      )}

    </div>
  );
}

