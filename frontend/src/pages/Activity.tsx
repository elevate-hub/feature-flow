import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api/client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import { workspaceApi, type ActivityEntry } from "../services/workspace";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Activity() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setEntries(await workspaceApi.activity());
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not load the activity log.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEntries = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? entries.filter((entry) =>
          [entry.action, entry.actor, entry.flag_key]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : entries;
  }, [entries, query]);

  return (
    <WorkspaceLayout
      title="Activity"
      description="An audit trail of configuration changes made in this workspace."
    >
      <section className="panel-card table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Recent activity <span className="count-pill">{visibleEntries.length}</span></h2>
            <p>Events are recorded from the configuration APIs.</p>
          </div>
          <label className="search-field">
            <span className="sr-only">Search activity</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search activity"
            />
          </label>
        </div>
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {loading ? <LoadingState label="Loading audit history…" /> : visibleEntries.length === 0 ? (
          <EmptyState title={entries.length ? "No matching events" : "No activity recorded"}>
            {entries.length
              ? "Try a different search."
              : "Configuration changes will appear here as they are made."}
          </EmptyState>
        ) : (
          <div className="activity-list">
            {visibleEntries.map((entry) => (
              <article className="activity-row" key={entry.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div className="activity-copy">
                  <strong>{entry.action.replaceAll(".", " ").replaceAll("_", " ")}</strong>
                  <small>
                    {entry.actor}
                    {entry.flag_key ? ` · ${entry.flag_key}` : ""}
                  </small>
                </div>
                <time dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
