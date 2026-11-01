import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { FlagForm } from "../components/FlagForm";
import { EmptyState, ErrorState, LoadingState, Notice, WorkspaceLayout } from "../components/WorkspaceLayout";
import { environmentApi, type Environment } from "../services/environments";
import { flagApi, type FeatureFlag, type FlagPayload } from "../services/flags";

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function Flags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeatureFlag>();

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
      setError(cause instanceof ApiError ? cause.message : "Could not load feature flags.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(payload: FlagPayload) {
    if (editing) await flagApi.update(editing.id, payload);
    else await flagApi.create(payload);
    setFormOpen(false);
    setEditing(undefined);
    setNotice(editing ? "Feature flag updated." : "Feature flag created.");
    await load();
  }

  async function remove(flag: FeatureFlag) {
    if (!window.confirm(`Delete “${flag.key}”? This action cannot be undone.`)) return;
    setError("");
    try {
      await flagApi.remove(flag.id);
      setNotice(`Flag “${flag.key}” deleted.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete this flag.");
    }
  }

  async function toggle(flag: FeatureFlag) {
    const environment = environments.find((item) => item.id === flag.environment_id);
    setError("");
    try {
      await flagApi.update(flag.id, {
        key: flag.key,
        type: flag.type,
        default_value: flag.default_value,
        enabled: !flag.enabled,
        description: flag.description,
        environment_id: flag.environment_id,
      });
      setNotice(`Flag “${flag.key}” ${flag.enabled ? "disabled" : "enabled"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Could not update ${environment?.name ?? "flag"}.`);
    }
  }

  return (
    <WorkspaceLayout
      title="Feature flags"
      description="Create, configure, and control feature releases."
      actions={<button className="button primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>＋ New flag</button>}
    >
      {notice && <Notice kind="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? <LoadingState label="Loading feature flags…" /> : flags.length === 0 ? (
        <div className="panel-card"><EmptyState title="No feature flags found">Create your first flag to start managing a controlled release.</EmptyState><button className="button primary empty-action" onClick={() => setFormOpen(true)}>Create a flag</button></div>
      ) : (
        <section className="panel-card table-panel">
          <div className="table-toolbar"><div><h2>All flags <span className="count-pill">{flags.length}</span></h2><p>Manage flag configuration and rollout state.</p></div></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Flag</th><th>Type</th><th>Default value</th><th>Environment</th><th>Status</th><th>Description</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{flags.map((flag) => <tr key={flag.id}>
              <td><span className="table-key">{flag.key}</span><small className="table-sub">ID {flag.id}</small></td>
              <td><span className="type-pill">{flag.type}</span></td>
              <td><code className="value-code">{formatValue(flag.default_value)}</code></td>
              <td>{environments.find((environment) => environment.id === flag.environment_id)?.name ?? "Unknown"}</td>
              <td><button className={`status-badge ${flag.enabled ? "enabled" : "disabled"} status-toggle`} onClick={() => void toggle(flag)} aria-label={`${flag.enabled ? "Disable" : "Enable"} ${flag.key}`}>{flag.enabled ? "Enabled" : "Disabled"}</button></td>
              <td className="description-cell">{flag.description || "—"}</td>
              <td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${flag.key}`} onClick={() => { setEditing(flag); setFormOpen(true); }}>✎</button><button className="icon-button danger" aria-label={`Delete ${flag.key}`} onClick={() => void remove(flag)}>⌫</button></div></td>
            </tr>)}</tbody>
          </table></div>
        </section>
      )}
      {formOpen && <FlagForm environments={environments} initial={editing} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} />}
    </WorkspaceLayout>
  );
}
