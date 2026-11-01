import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { WorkspaceLayout, EmptyState, ErrorState, LoadingState } from "../components/WorkspaceLayout";
import { environmentApi, type Environment } from "../services/environments";
import { flagApi, type FeatureFlag } from "../services/flags";

export default function Dashboard() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextFlags, nextEnvironments] = await Promise.all([
        flagApi.list(),
        environmentApi.list(),
      ]);
      setFlags(nextFlags);
      setEnvironments(nextEnvironments);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <WorkspaceLayout title="Dashboard" description="A live overview of your feature flag workspace.">
      {loading ? <LoadingState label="Loading dashboard…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <>
          <div className="stat-grid">
            <article className="stat-card"><span className="stat-icon violet">⚑</span><span className="stat-label">Total flags</span><strong>{flags.length}</strong><small>Across all environments</small></article>
            <article className="stat-card"><span className="stat-icon green">✓</span><span className="stat-label">Enabled flags</span><strong>{flags.filter((flag) => flag.enabled).length}</strong><small>Currently switched on</small></article>
            <article className="stat-card"><span className="stat-icon amber">Ⅱ</span><span className="stat-label">Disabled flags</span><strong>{flags.filter((flag) => !flag.enabled).length}</strong><small>Currently switched off</small></article>
            <article className="stat-card"><span className="stat-icon blue">▦</span><span className="stat-label">Environments</span><strong>{environments.length}</strong><small>Configured release targets</small></article>
          </div>
          <div className="dashboard-panels">
            <section className="panel-card">
              <div className="panel-heading"><div><h2>Recent flags</h2><p>Feature switches across your workspace</p></div><Link className="text-link" to="/flags">View all →</Link></div>
              {flags.length === 0 ? <EmptyState title="No feature flags yet">Create a flag to start managing releases.</EmptyState> : (
                <div className="recent-list">{flags.slice(0, 5).map((flag) => {
                  const environment = environments.find((item) => item.id === flag.environment_id);
                  return <div className="recent-row" key={flag.id}><span className={`flag-symbol ${flag.enabled ? "on" : ""}`}>⚑</span><span className="recent-copy"><strong>{flag.key}</strong><small>{environment?.name ?? "Unknown environment"} · {flag.type}</small></span><span className={`status-badge ${flag.enabled ? "enabled" : "disabled"}`}>{flag.enabled ? "Enabled" : "Disabled"}</span></div>;
                })}</div>
              )}
            </section>
            <section className="panel-card">
              <div className="panel-heading"><div><h2>Environments</h2><p>Where your flags are configured</p></div><Link className="text-link" to="/environments">Manage →</Link></div>
              {environments.length === 0 ? <EmptyState title="No environments yet">Create an environment to organize your flags.</EmptyState> : (
                <div className="environment-list">{environments.slice(0, 5).map((environment) => (
                  <Link className="environment-row" to={`/environments/${environment.id}`} key={environment.id}>
                    <span className="environment-icon">▦</span><span className="recent-copy"><strong>{environment.name}</strong><small>{environment.description || "No description"}</small></span><span className="row-arrow">↗</span>
                  </Link>
                ))}</div>
              )}
            </section>
          </div>
        </>
      )}
    </WorkspaceLayout>
  );
}
