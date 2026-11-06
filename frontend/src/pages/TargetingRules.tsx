import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import {
  flagApi,
  type FeatureFlag,
  type TargetingRule,
} from "../services/flags";
import { environmentApi, type Environment } from "../services/environments";

interface RuleRow {
  flag: FeatureFlag;
  environment: Environment | undefined;
  rule: TargetingRule;
}

function ruleDescription(rule: TargetingRule): string {
  if (rule.rule_type === "user") return `User key is ${String(rule.value)}`;
  if (rule.rule_type === "user_group") return `User is in group #${String(rule.value)}`;
  return `${rule.attribute ?? "attribute"} ${rule.operator.replaceAll("_", " ")} ${JSON.stringify(rule.value)}`;
}

export default function TargetingRules() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [flags, environments] = await Promise.all([
        flagApi.list(),
        environmentApi.list(),
      ]);
      const rulesByFlag = await Promise.all(
        flags.map(async (flag) => ({
          flag,
          rules: await flagApi.targetingRules(flag.id),
        })),
      );
      setRows(
        rulesByFlag.flatMap(({ flag, rules }) =>
          rules.map((rule) => ({
            flag,
            rule,
            environment: environments.find(
              (item) => item.id === flag.environment_id,
            ),
          })),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not load targeting rules.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter(({ flag, rule, environment }) =>
      [
        flag.key,
        environment?.name,
        rule.rule_type,
        rule.attribute,
        ruleDescription(rule),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [query, rows]);

  return (
    <WorkspaceLayout
      title="Targeting rules"
      description="Review user, attribute, and group conditions across feature flags."
    >
      <section className="panel-card table-panel">
        <div className="table-toolbar">
          <div>
            <h2>All rules <span className="count-pill">{visibleRows.length}</span></h2>
            <p>Specific user and attribute rules are evaluated before group rules.</p>
          </div>
          <label className="search-field">
            <span className="sr-only">Search targeting rules</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search rules or flags"
            />
          </label>
        </div>
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {loading ? <LoadingState label="Loading targeting rules…" /> : rows.length === 0 ? (
          <EmptyState title="No targeting rules yet">
            Create a rule from a flag’s configuration page.
          </EmptyState>
        ) : visibleRows.length === 0 ? (
          <EmptyState title="No matching rules">Try a different search.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Feature flag</th>
                  <th>Environment</th>
                  <th>Condition</th>
                  <th>Result</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ flag, environment, rule }) => (
                  <tr key={rule.id}>
                    <td><Link className="table-key" to={`/flags/${flag.id}`}>{flag.key}</Link></td>
                    <td>{environment?.name ?? "Unknown"}</td>
                    <td>{ruleDescription(rule)}</td>
                    <td><code className="value-code">{JSON.stringify(rule.result)}</code></td>
                    <td>{rule.priority}</td>
                    <td><span className={`status-badge ${rule.is_active ? "enabled" : "disabled"}`}>{rule.is_active ? "Active" : "Paused"}</span></td>
                    <td><Link className="text-link" to={`/flags/${flag.id}`}>Configure →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </WorkspaceLayout>
  );
}
