import { useEffect, useState, type FormEvent } from "react";
import type { Environment } from "../services/environments";
import type { FeatureFlag, FlagPayload, FlagType } from "../services/flags";
import { Notice } from "./WorkspaceLayout";

export function FlagForm({
  environments,
  initial,
  defaultEnvironmentId,
  onSubmit,
  onCancel,
}: {
  environments: Environment[];
  initial?: FeatureFlag;
  defaultEnvironmentId?: number;
  onSubmit: (payload: FlagPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [type, setType] = useState<FlagType>(initial?.type ?? "boolean");
  const [value, setValue] = useState(
    initial ? JSON.stringify(initial.default_value, null, 2) : "false",
  );
  const [environmentId, setEnvironmentId] = useState(
    initial?.environment_id
      ? String(initial.environment_id)
      : defaultEnvironmentId
        ? String(defaultEnvironmentId)
        : "",
  );
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [rolloutPercentage, setRolloutPercentage] = useState(initial?.rollout_percentage ?? 0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!environmentId && environments.length) setEnvironmentId(String(environments[0].id));
  }, [environmentId, environments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    let defaultValue: unknown;
    try {
      if (type === "boolean") defaultValue = value === "true";
      else if (type === "number") {
        defaultValue = Number(value);
        if (!value.trim() || !Number.isFinite(defaultValue)) throw new Error("Enter a valid number.");
      } else if (type === "json") defaultValue = JSON.parse(value) as unknown;
      else defaultValue = value;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid default value.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        key: key.trim(),
        type,
        default_value: defaultValue,
        environment_id: Number(environmentId),
        enabled,
        rollout_percentage: rolloutPercentage,
        description: description.trim() || null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this flag.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="flag-form-title">
        <div className="modal-heading"><div><div className="page-eyebrow">{initial ? "UPDATE CONFIGURATION" : "NEW CONFIGURATION"}</div><h2 id="flag-form-title">{initial ? "Edit feature flag" : "Create feature flag"}</h2></div><button className="icon-button" onClick={onCancel} aria-label="Close">×</button></div>
        <form className="management-form" onSubmit={submit}>
          {error && <Notice kind="error">{error}</Notice>}
          <label>Flag key<input value={key} onChange={(event) => setKey(event.target.value)} required minLength={1} maxLength={255} placeholder="new_checkout" pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" /></label>
          <div className="form-grid">
            <label>Type<select value={type} onChange={(event) => {
              const next = event.target.value as FlagType;
              setType(next);
              setValue(next === "boolean" ? "false" : next === "number" ? "0" : next === "json" ? "{}" : "");
            }}><option value="boolean">Boolean</option><option value="string">String</option><option value="number">Number</option><option value="json">JSON</option></select></label>
            <label>Environment<select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} required>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
          </div>
          <label>Default value
            {type === "boolean" ? (
              <select value={value} onChange={(event) => setValue(event.target.value)}><option value="true">true</option><option value="false">false</option></select>
            ) : type === "json" ? (
              <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={4} required />
            ) : (
              <input type={type === "number" ? "number" : "text"} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => setValue(event.target.value)} required />
            )}
          </label>
          <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What does this flag control?" /></label>
          <label className="rollout-field">Percentage rollout <strong>{rolloutPercentage}%</strong>
            <input type="range" min="0" max="100" step="1" value={rolloutPercentage} onChange={(event) => setRolloutPercentage(Number(event.target.value))} />
          </label>
          <label className="checkbox-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enabled</label>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={saving || !environments.length}>{saving ? "Saving…" : initial ? "Save changes" : "Create flag"}</button></div>
        </form>
      </section>
    </div>
  );
}
