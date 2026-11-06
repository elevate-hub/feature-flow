import { useAuth } from "../auth/AuthContext";
import { WorkspaceLayout } from "../components/WorkspaceLayout";

export default function Settings() {
  const { user, signOut } = useAuth();

  return (
    <WorkspaceLayout
      title="Settings"
      description="Review the account and access level for this workspace."
    >
      <section className="panel-card settings-card">
        <div className="panel-heading">
          <div>
            <h2>Administrator account</h2>
            <p>Account details are managed by the authentication service.</p>
          </div>
          <span className="role-pill">{user?.role ?? "unknown"}</span>
        </div>
        <dl className="config-list">
          <div><dt>Name</dt><dd>{user?.name ?? "—"}</dd></div>
          <div><dt>Email</dt><dd>{user?.email ?? "—"}</dd></div>
          <div><dt>Access</dt><dd>{user?.role === "admin" ? "Administrator" : "Read-only account"}</dd></div>
          <div><dt>Account status</dt><dd>{user?.is_active ? "Active" : "Inactive"}</dd></div>
        </dl>
        <div className="settings-actions">
          <p>FeatureFlow does not expose or store your session token on this page.</p>
          <button className="button secondary" onClick={signOut}>Sign out</button>
        </div>
      </section>
    </WorkspaceLayout>
  );
}
