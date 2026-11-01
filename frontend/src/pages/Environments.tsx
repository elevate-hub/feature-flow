import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { EnvironmentForm } from "../components/EnvironmentForm";
import { EmptyState, ErrorState, LoadingState, Notice, WorkspaceLayout } from "../components/WorkspaceLayout";
import { environmentApi, type Environment, type EnvironmentPayload } from "../services/environments";
import { flagApi, type FeatureFlag } from "../services/flags";

export default function Environments() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [flagsByEnvironment, setFlagsByEnvironment] = useState<Record<number, FeatureFlag[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Environment>();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextEnvironments = await environmentApi.list();
      const entries = await Promise.all(nextEnvironments.map(async (environment) => [
        environment.id,
        await flagApi.byEnvironment(environment.id),
      ] as const));
      setEnvironments(nextEnvironments);
      setFlagsByEnvironment(Object.fromEntries(entries));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load environments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(payload: EnvironmentPayload) {
    if (editing) await environmentApi.update(editing.id, payload);
    else await environmentApi.create(payload);
    setFormOpen(false);
    setEditing(undefined);
    setNotice(editing ? "Environment updated." : "Environment created.");
    await load();
  }

  async function remove(environment: Environment) {
    if (!window.confirm(`Delete the “${environment.name}” environment?`)) return;
    setError("");
    try {
      await environmentApi.remove(environment.id);
      setNotice(`Environment “${environment.name}” deleted.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete this environment.");
    }
  }

  return (
    <WorkspaceLayout
      title="Environments"
      description="Organize flags by development, staging, production, and more."
      actions={<button className="button primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>＋ New environment</button>}
    >
      {notice && <Notice kind="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? <LoadingState label="Loading environments…" /> : environments.length === 0 ? (
        <div className="panel-card"><EmptyState title="No environments found">Create an environment to get started.</EmptyState><button className="button primary empty-action" onClick={() => setFormOpen(true)}>Create environment</button></div>
      ) : (
        <section className="environment-card-grid">
          {environments.map((environment) => {
            const flags = flagsByEnvironment[environment.id] ?? [];
            return <article className="environment-card" key={environment.id}>
              <div className="environment-card-top"><span className="environment-icon large">▦</span><div className="row-actions"><button className="icon-button" aria-label={`Edit ${environment.name}`} onClick={() => { setEditing(environment); setFormOpen(true); }}>✎</button><button className="icon-button danger" aria-label={`Delete ${environment.name}`} onClick={() => void remove(environment)}>⌫</button></div></div>
              <Link to={`/environments/${environment.id}`} className="environment-title">{environment.name}<span aria-hidden="true"> ↗</span></Link>
              <p className="environment-description">{environment.description || "No description provided."}</p>
              <div className="environment-card-footer"><span>{flags.length} {flags.length === 1 ? "flag" : "flags"}</span><span>{flags.filter((flag) => flag.enabled).length} enabled</span></div>
              {flags.length > 0 && <div className="environment-flag-list">{flags.slice(0, 3).map((flag) => <span className="mini-flag" key={flag.id}><i className={flag.enabled ? "live" : ""} />{flag.key}</span>)}{flags.length > 3 && <span className="mini-flag more">+{flags.length - 3} more</span>}</div>}
            </article>;
          })}
        </section>
      )}
      {formOpen && <EnvironmentForm initial={editing} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} />}
    </WorkspaceLayout>
  );
}
