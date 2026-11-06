import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { environmentApi, type Environment } from "../services/environments";

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: "◫" },
  { to: "/flags", label: "Feature flags", icon: "⚑" },
  { to: "/environments", label: "Environments", icon: "▦" },
  { to: "/targeting-rules", label: "Targeting rules", icon: "⌘" },
  { to: "/user-groups", label: "User groups", icon: "◉" },
  { to: "/activity", label: "Activity", icon: "↗" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

const ENVIRONMENT_KEY = "featureflow.selected-environment";

export function getSelectedEnvironmentId(): number | null {
  const saved = sessionStorage.getItem(ENVIRONMENT_KEY);
  const id = saved ? Number(saved) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function selectEnvironment(id: number): void {
  sessionStorage.setItem(ENVIRONMENT_KEY, String(id));
  window.dispatchEvent(
    new CustomEvent("featureflow:environment-changed", { detail: id }),
  );
}

export function WorkspaceLayout({
  title,
  description,
  actions,
  children,
  variant = "standard",
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  variant?: "standard" | "dashboard";
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<number | null>(
    getSelectedEnvironmentId,
  );
  const [environmentError, setEnvironmentError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    environmentApi
      .list()
      .then((items) => {
        if (!active) return;
        setEnvironments(items);
        const saved = getSelectedEnvironmentId();
        const valid = items.some((item) => item.id === saved);
        const initial = valid ? saved : items[0]?.id ?? null;
        setSelectedEnvironment(initial);
        if (initial !== null && initial !== saved) selectEnvironment(initial);
      })
      .catch(() => {
        if (active) setEnvironmentError("Environment selector is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  function logout() {
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className={`workspace-shell${variant === "dashboard" ? " dashboard-shell" : ""}${menuOpen ? " mobile-menu-open" : ""}`}>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className="workspace-sidebar" id="workspace-navigation">
        <Link className="workspace-brand" to="/dashboard">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>feature<span className="brand-light">flow</span></span>
        </Link>
        <div className="sidebar-label">RELEASE WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="user-avatar small" aria-hidden="true">
              {user?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="sidebar-user-copy"><strong>{user?.name}</strong><small>{user?.role}</small></span>
          </div>
          <button className="sidebar-logout" onClick={logout}>Sign out <span aria-hidden="true">↗</span></button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? "×" : "☰"}
            </button>
            <div className="topbar-brand">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            FeatureFlow
            </div>
          </div>
          <div className="topbar-controls">
            <label className="environment-select">
              <span>Environment</span>
              <select
                value={selectedEnvironment ?? ""}
                onChange={(event) => {
                  const id = Number(event.target.value);
                  setSelectedEnvironment(id);
                  selectEnvironment(id);
                }}
                disabled={!environments.length}
                aria-label="Select active environment"
              >
                {!environments.length && <option value="">No environments</option>}
                {environments.map((environment) => (
                  <option key={environment.id} value={environment.id}>{environment.name}</option>
                ))}
              </select>
            </label>
            <div className="topbar-user">
              <span>{user?.name}</span>
              <span className="user-avatar small" aria-hidden="true">
                {user?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
              </span>
            </div>
          </div>
        </header>
        <section className="workspace-content">
          {environmentError && <div className="workspace-inline-error" role="status">{environmentError}</div>}
          <div className="page-heading">
            <div><div className="page-eyebrow">FEATURE MANAGEMENT</div><h1>{title}</h1><p>{description}</p></div>
            {actions && <div className="page-actions">{actions}</div>}
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}

export function Notice({
  kind,
  children,
  onDismiss,
}: {
  kind: "success" | "error";
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`notice ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span>{kind === "success" ? "✓" : "!"}</span>
      <div>{children}</div>
      {onDismiss && <button aria-label="Dismiss notification" onClick={onDismiss}>×</button>}
    </div>
  );
}

export function LoadingState({ label = "Loading workspace data…" }: { label?: string }) {
  return <div className="state-card"><span className="spinner dark" />{label}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">◌</span><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-state" role="alert"><span>{message}</span>{onRetry && <button className="button secondary" onClick={onRetry}>Try again</button>}</div>;
}
