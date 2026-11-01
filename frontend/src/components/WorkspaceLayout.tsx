import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: "◫" },
  { to: "/flags", label: "Feature flags", icon: "⚑" },
  { to: "/environments", label: "Environments", icon: "▦" },
];

export function WorkspaceLayout({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function logout() {
    signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" to="/dashboard">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>feature<span className="brand-light">flow</span></span>
        </Link>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
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
          <div className="topbar-brand">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            FeatureFlow
          </div>
          <div className="topbar-user">
            <span>{user?.name}</span>
            <span className="user-avatar small" aria-hidden="true">
              {user?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}
            </span>
          </div>
        </header>
        <section className="workspace-content">
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
