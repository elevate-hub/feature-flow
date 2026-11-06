import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { FlagForm } from "../components/FlagForm";
import { EmptyState, ErrorState, LoadingState, Notice, WorkspaceLayout, getSelectedEnvironmentId } from "../components/WorkspaceLayout";
import { environmentApi, type Environment } from "../services/environments";
import { flagApi, type FeatureFlag, type FlagPayload } from "../services/flags";

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export default function Flags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FeatureFlag>();
  const [query, setQuery] = useState("");
  const [ruleCounts, setRuleCounts] = useState<Record<number, number>>({});
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<number | null>(getSelectedEnvironmentId);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextFlags, nextEnvironments] = await Promise.all([
        flagApi.list(),
        environmentApi.list(),
      ]);
      const ruleLists = await Promise.all(
        nextFlags.map((flag) => flagApi.targetingRules(flag.id)),
      );
      setFlags(nextFlags);
      setEnvironments(nextEnvironments);
      setRuleCounts(Object.fromEntries(
        nextFlags.map((flag, index) => [flag.id, ruleLists[index].length]),
      ));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load feature flags.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handleEnvironmentChange = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) setActiveEnvironmentId(id);
    };
    window.addEventListener("featureflow:environment-changed", handleEnvironmentChange);
    return () => window.removeEventListener("featureflow:environment-changed", handleEnvironmentChange);
  }, []);

  const groupedFlags = new Map<string, Map<number, FeatureFlag>>();
  for (const flag of flags) {
    const row = groupedFlags.get(flag.key) ?? new Map<number, FeatureFlag>();
    row.set(flag.environment_id, flag);
    groupedFlags.set(flag.key, row);
  }
  const visibleRows = [...groupedFlags.entries()].filter(([key]) =>
    key.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function save(payload: FlagPayload) {
    if (editing) await flagApi.update(editing.id, payload);
    else await flagApi.create(payload);
    setFormOpen(false);
    setEditing(undefined);
    setNotice(editing ? "Feature flag updated." : "Feature flag created.");
    await load();
  }

  async function toggle(flag: FeatureFlag) {
    setError("");
    try {
      await flagApi.update(flag.id, {
        key: flag.key,
        type: flag.type,
        default_value: flag.default_value,
        enabled: !flag.enabled,
        rollout_percentage: flag.rollout_percentage,
        description: flag.description,
        environment_id: flag.environment_id,
      });
      setNotice(`Flag “${flag.key}” ${flag.enabled ? "disabled" : "enabled"}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Could not update ${flag.key}.`);
    }
  }

  async function addEnvironmentFlag(template: FeatureFlag, environment: Environment) {
    setError("");
    try {
      await flagApi.create({
        key: template.key,
        type: template.type,
        default_value: template.default_value,
        enabled: false,
        rollout_percentage: 0,
        description: template.description,
        environment_id: environment.id,
      });
      setNotice(`Created ${template.key} in ${environment.name} (disabled, 0% rollout).`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Could not create ${template.key} in ${environment.name}.`);
    }
  }

  async function remove(flag: FeatureFlag) {
    if (!window.confirm(`Delete “${flag.key}” in ${environments.find((item) => item.id === flag.environment_id)?.name ?? "this environment"}?`)) return;
    setError("");
    try {
      await flagApi.remove(flag.id);
      setNotice(`Deleted ${flag.key} from its environment.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : `Could not delete ${flag.key}.`);
    }
  }

  return (
    <WorkspaceLayout
      title="Feature flags"
      description="Create, configure, and control feature releases."
      actions={<button className="button primary" onClick={() => { setEditing(undefined); setFormOpen(true); }}>＋ Add feature</button>}
    >
      {notice && <Notice kind="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading ? <LoadingState label="Loading feature flags…" /> : flags.length === 0 ? (
        <div className="panel-card"><EmptyState title="No feature flags found">Create your first flag to start managing a controlled release.</EmptyState><button className="button primary empty-action" onClick={() => setFormOpen(true)}>Create a flag</button></div>
      ) : (
        <section className="panel-card table-panel">
          <div className="table-toolbar">
            <div><h2>Feature flags <span className="count-pill">{visibleRows.length}</span></h2><p>Environment controls are independent and each change is persisted.</p></div>
            <label className="search-field"><span className="sr-only">Search feature flags</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search feature flags" /></label>
          </div>
          <div className="table-scroll"><table className="data-table flags-matrix"><thead><tr><th>Feature key</th>{environments.map((environment) => <th key={environment.id}>{environment.name}</th>)}<th>Value when enabled</th><th>Overrides / rules</th><th>Last updated</th><th>Actions</th></tr></thead>
            <tbody>{visibleRows.length ? visibleRows.map(([key, byEnvironment]) => {
              const rowFlags = [...byEnvironment.values()];
              const selectedFlag = (activeEnvironmentId ? byEnvironment.get(activeEnvironmentId) : undefined) ?? rowFlags[0];
              const updatedAt = rowFlags.reduce((latest, flag) => flag.updated_at > latest ? flag.updated_at : latest, rowFlags[0].updated_at);
              const ruleCount = rowFlags.reduce((sum, flag) => sum + (ruleCounts[flag.id] ?? 0), 0);
              return <tr key={key}>
                <td><Link className="table-key" to={`/flags/${selectedFlag.id}`}>{key}</Link><small className="table-sub">{selectedFlag.type}</small></td>
                {environments.map((environment) => {
                  const flag = byEnvironment.get(environment.id);
                  return <td key={environment.id} className="flag-environment-cell">
                    {flag ? <button className={`environment-toggle ${flag.enabled ? "on" : ""}`} role="switch" aria-checked={flag.enabled} aria-label={`${environment.name}: ${flag.enabled ? "disable" : "enable"} ${key}`} onClick={() => void toggle(flag)}><i />{flag.enabled ? "On" : "Off"}</button>
                      : <button className="environment-add-button" onClick={() => void addEnvironmentFlag(selectedFlag, environment)}>＋ Add</button>}
                  </td>;
                })}
                <td><code className="value-code">{formatValue(selectedFlag.default_value)}</code></td>
                <td><span className="count-pill">{ruleCount}</span></td>
                <td>{formatUpdatedAt(updatedAt)}</td>
                <td><div className="row-actions"><Link className="icon-button" aria-label={`Configure ${key}`} to={`/flags/${selectedFlag.id}`}>↗</Link><button className="icon-button" aria-label={`Edit ${key}`} onClick={() => { setEditing(selectedFlag); setFormOpen(true); }}>✎</button><button className="icon-button danger" aria-label={`Delete ${key} in selected environment`} onClick={() => void remove(selectedFlag)}>⌫</button></div></td>
              </tr>;
            }) : <tr><td colSpan={environments.length + 5} className="filtered-empty">No feature flags match this search.</td></tr>}</tbody>
          </table></div>
        </section>
      )}
      {formOpen && <FlagForm environments={environments} initial={editing} defaultEnvironmentId={activeEnvironmentId ?? undefined} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} />}
    </WorkspaceLayout>
  );
}
