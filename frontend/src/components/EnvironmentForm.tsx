import { useState, type FormEvent } from "react";
import type { Environment, EnvironmentPayload } from "../services/environments";
import { Notice } from "./WorkspaceLayout";

export function EnvironmentForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Environment;
  onSubmit: (payload: EnvironmentPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this environment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="modal-card compact" role="dialog" aria-modal="true" aria-labelledby="environment-form-title">
        <div className="modal-heading"><div><div className="page-eyebrow">{initial ? "ENVIRONMENT SETTINGS" : "NEW ENVIRONMENT"}</div><h2 id="environment-form-title">{initial ? "Edit environment" : "Create environment"}</h2></div><button className="icon-button" onClick={onCancel} aria-label="Close">×</button></div>
        <form className="management-form" onSubmit={submit}>
          {error && <Notice kind="error">{error}</Notice>}
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={1} maxLength={100} placeholder="Development" /></label>
          <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="Purpose of this environment" /></label>
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create environment"}</button></div>
        </form>
      </section>
    </div>
  );
}
