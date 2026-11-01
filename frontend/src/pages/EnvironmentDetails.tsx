import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { EmptyState, ErrorState, LoadingState, WorkspaceLayout } from "../components/WorkspaceLayout";
import { environmentApi, type Environment } from "../services/environments";
import { flagApi, type FeatureFlag } from "../services/flags";

export default function EnvironmentDetails() {
  const { environmentId } = useParams();
  const id = Number(environmentId);
  const [environment, setEnvironment] = useState<Environment>();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("Invalid environment ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextEnvironment, nextFlags] = await Promise.all([
        environmentApi.get(id),
        flagApi.byEnvironment(id),
      ]);
      setEnvironment(nextEnvironment);
      setFlags(nextFlags);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load this environment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <WorkspaceLayout title={environment?.name ?? "Environment details"} description="Environment configuration and associated feature flags." actions={<Link className="button secondary" to="/environments">← All environments</Link>}>
      {loading ? <LoadingState label="Loading environment…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : environment ? (
        <>
          <section className="panel-card detail-summary">
            <span className="environment-icon large">▦</span>
            <div><div className="page-eyebrow">ENVIRONMENT</div><h2>{environment.name}</h2><p>{environment.description || "No description provided."}</p></div>
            <span className="detail-count">{flags.length} {flags.length === 1 ? "flag" : "flags"}</span>
          </section>
          <section className="panel-card table-panel">
            <div className="table-toolbar"><div><h2>Feature flags <span className="count-pill">{flags.length}</span></h2><p>Flags configured for {environment.name}.</p></div></div>
            {flags.length === 0 ? <EmptyState title="No flags in this environment">Flags assigned to this environment will appear here.</EmptyState> : (
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Flag</th><th>Type</th><th>Default value</th><th>Status</th><th>Description</th></tr></thead><tbody>
                {flags.map((flag) => <tr key={flag.id}><td><span className="table-key">{flag.key}</span></td><td><span className="type-pill">{flag.type}</span></td><td><code className="value-code">{typeof flag.default_value === "string" ? flag.default_value : JSON.stringify(flag.default_value)}</code></td><td><span className={`status-badge ${flag.enabled ? "enabled" : "disabled"}`}>{flag.enabled ? "Enabled" : "Disabled"}</span></td><td className="description-cell">{flag.description || "—"}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
        </>
      ) : null}
    </WorkspaceLayout>
  );
}
