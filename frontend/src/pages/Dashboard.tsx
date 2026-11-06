import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { WorkspaceLayout, EmptyState, ErrorState, LoadingState } from "../components/WorkspaceLayout";
import { environmentApi, type Environment } from "../services/environments";
import { flagApi, type FeatureFlag } from "../services/flags";
import { getSelectedEnvironmentId } from "../components/WorkspaceLayout";
import { workspaceApi, type ActivityEntry, type DashboardAnalytics } from "../services/workspace";

export default function Dashboard() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics>();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<number | null>(getSelectedEnvironmentId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextFlags, nextEnvironments, nextAnalytics, nextActivity] = await Promise.all([
        flagApi.list(),
        environmentApi.list(),
        workspaceApi.analytics(selectedEnvironment ?? undefined),
        workspaceApi.activity(8),
      ]);
      setFlags(selectedEnvironment === null
        ? nextFlags
        : nextFlags.filter((flag) => flag.environment_id === selectedEnvironment));
      setEnvironments(nextEnvironments);
      setAnalytics(nextAnalytics);
      setActivity(nextActivity);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [selectedEnvironment]);

  useEffect(() => {
    void load();
    const handleEnvironmentChange = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) {
        setSelectedEnvironment(id);
      }
    };
    window.addEventListener("featureflow:environment-changed", handleEnvironmentChange);
    return () => window.removeEventListener("featureflow:environment-changed", handleEnvironmentChange);
  }, [load]);

  const activeEnvironment = environments.find((item) => item.id === selectedEnvironment);
  const chartMaximum = Math.max(
    1,
    ...(analytics?.series.map((point) => point.true + point.false) ?? []),
  );

  return (
    <WorkspaceLayout
      title="Dashboard"
      description="Release health and evaluation activity for your workspace."
      variant="dashboard"
    >
      {loading ? <LoadingState label="Loading dashboard…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <>
          <div className="stat-grid">
            <article className="stat-card"><span className="stat-icon violet">⚑</span><span className="stat-label">Total flags</span><strong>{analytics?.total_flags ?? 0}</strong><small>{activeEnvironment?.name ?? "All environments"}</small></article>
            <article className="stat-card"><span className="stat-icon blue">↗</span><span className="stat-label">Evaluations</span><strong>{analytics?.evaluations ?? 0}</strong><small>Last 7 days</small></article>
            <article className="stat-card"><span className="stat-icon green">✓</span><span className="stat-label">True rate</span><strong>{analytics?.true_rate == null ? "—" : `${analytics.true_rate.toFixed(1)}%`}</strong><small>{analytics?.true_rate == null ? "No boolean evaluation data" : "Of boolean evaluations"}</small></article>
            <article className="stat-card"><span className="stat-icon amber">●</span><span className="stat-label">Enabled</span><strong>{analytics?.enabled_flags ?? 0}</strong><small>Currently switched on</small></article>
          </div>
          <div className="dashboard-analytics-grid">
            <section className="panel-card analytics-panel">
              <div className="panel-heading">
                <div><h2>Evaluation analytics</h2><p>True and false evaluations over the last 7 days</p></div>
                <span className="chart-period">LAST 7 DAYS</span>
              </div>
              {!analytics?.series.length ? <EmptyState title="No evaluation data yet">Evaluation activity will appear here as requests are recorded.</EmptyState> : <>
                <div className="chart-legend"><span><i className="legend-true" />True</span><span><i className="legend-false" />False</span></div>
                <div className="evaluation-chart" role="img" aria-label="True and false flag evaluations by day">
                  {analytics.series.map((point) => {
                    const total = point.true + point.false;
                    return <div className="chart-column" key={point.date} title={`${point.date}: ${point.true} true, ${point.false} false`}>
                      <div className="chart-bars">
                        <i className="chart-true" style={{ height: `${point.true / chartMaximum * 100}%` }} />
                        <i className="chart-false" style={{ height: `${point.false / chartMaximum * 100}%` }} />
                      </div>
                      <small>{new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</small>
                      <span>{total}</span>
                    </div>;
                  })}
                </div>
              </>}
            </section>
            <section className="panel-card activity-panel">
              <div className="panel-heading"><div><h2>Recent activity</h2><p>Latest configuration events</p></div><Link className="text-link" to="/activity">View all →</Link></div>
              {activity.length === 0 ? <EmptyState title="No recent activity">Changes will appear when configuration is updated.</EmptyState> : (
                <div className="recent-activity-list">{activity.slice(0, 5).map((entry) => (
                  <article className="recent-activity-row" key={entry.id}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div className="recent-copy"><strong>{entry.action.replaceAll(".", " ").replaceAll("_", " ")}</strong><small>{entry.actor}{entry.flag_key ? ` · ${entry.flag_key}` : ""}</small></div>
                  </article>
                ))}</div>
              )}
            </section>
          </div>
          <section className="panel-card flags-overview-panel">
            <div className="panel-heading"><div><h2>Flags overview</h2><p>{activeEnvironment?.name ?? "All environments"} flag configuration</p></div><Link className="text-link" to="/flags">Manage flags →</Link></div>
            {flags.length === 0 ? <EmptyState title="No flags in this environment">Choose another environment or create your first feature flag.</EmptyState> : (
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Feature key</th><th>Type</th><th>Value when enabled</th><th>Rollout</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
                {flags.slice(0, 8).map((flag) => <tr key={flag.id}>
                  <td><Link className="table-key" to={`/flags/${flag.id}`}>{flag.key}</Link></td>
                  <td><span className="type-pill">{flag.type}</span></td>
                  <td><code className="value-code">{typeof flag.default_value === "string" ? flag.default_value : JSON.stringify(flag.default_value)}</code></td>
                  <td><span className="rollout-value">{flag.rollout_percentage}%</span><span className="mini-progress"><i style={{ width: `${flag.rollout_percentage}%` }} /></span></td>
                  <td><span className={`status-badge ${flag.enabled ? "enabled" : "disabled"}`}>{flag.enabled ? "Enabled" : "Disabled"}</span></td>
                  <td><Link className="text-link" to={`/flags/${flag.id}`}>Details →</Link></td>
                </tr>)}
              </tbody></table></div>
            )}
          </section>
          <div className="dashboard-panels">
            <section className="panel-card">
              <div className="panel-heading"><div><h2>Environments</h2><p>Configured release targets</p></div><Link className="text-link" to="/environments">Manage →</Link></div>
              {environments.length === 0 ? <EmptyState title="No environments yet">Create an environment to organize your flags.</EmptyState> : (
                <div className="environment-list">{environments.slice(0, 5).map((environment) => (
                  <Link className="environment-row" to={`/environments/${environment.id}`} key={environment.id}>
                    <span className="environment-icon">▦</span><span className="recent-copy"><strong>{environment.name}</strong><small>{environment.description || "No description"}</small></span><span className="row-arrow">↗</span>
                  </Link>
                ))}</div>
              )}
            </section>
            <section className="panel-card"><div className="panel-heading"><div><h2>Rollout health</h2><p>Current switches for the selected environment</p></div><Link className="text-link" to="/targeting-rules">Review rules →</Link></div>
              <div className="rollout-health">
                <div><span>Enabled</span><strong>{flags.filter((flag) => flag.enabled).length}</strong></div>
                <div><span>Paused</span><strong>{flags.filter((flag) => !flag.enabled).length}</strong></div>
              </div>
            </section>
          </div>
        </>
      )}
    </WorkspaceLayout>
  );
}
