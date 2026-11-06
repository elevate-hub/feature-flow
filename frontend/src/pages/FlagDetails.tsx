import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  EmptyState,
  ErrorState,
  getSelectedEnvironmentId,
  LoadingState,
  Notice,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import { FlagForm } from "../components/FlagForm";
import { environmentApi, type Environment } from "../services/environments";
import {
  evaluationApi,
  flagApi,
  type EvaluationResult,
  type FeatureFlag,
  type RuleOperator,
  type TargetingRule,
  type TargetingRulePayload,
} from "../services/flags";
import { userGroupApi, type UserGroup } from "../services/userGroups";
import { workspaceApi, type FlagVersion } from "../services/workspace";

const attributeOperators: RuleOperator[] = [
  "equals",
  "not_equals",
  "contains",
  "in",
  "greater_than",
  "less_than",
  "is_set",
  "is_not_set",
];

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

export default function FlagDetails() {
  const { flagId } = useParams();
  const id = Number(flagId);
  const [flag, setFlag] = useState<FeatureFlag>();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [rules, setRules] = useState<TargetingRule[]>([]);
  const [versions, setVersions] = useState<FlagVersion[]>([]);
  const [editingRule, setEditingRule] = useState<TargetingRule>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rollout, setRollout] = useState(100);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [ruleType, setRuleType] = useState<"user" | "attribute" | "user_group">("attribute");
  const [ruleOperator, setRuleOperator] = useState<RuleOperator>("equals");
  const [ruleAttribute, setRuleAttribute] = useState("country");
  const [ruleValue, setRuleValue] = useState('"US"');
  const [ruleResult, setRuleResult] = useState("true");
  const [ruleGroupId, setRuleGroupId] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [ruleActive, setRuleActive] = useState(true);
  const [ruleError, setRuleError] = useState("");
  const [ruleSaving, setRuleSaving] = useState(false);
  const [evaluationEnvironment, setEvaluationEnvironment] = useState(
    () => {
      const selected = getSelectedEnvironmentId();
      return selected === null ? "" : String(selected);
    },
  );
  const [evaluationUserKey, setEvaluationUserKey] = useState("test-user-1");
  const [evaluationAttributes, setEvaluationAttributes] = useState('{\n  "country": "US",\n  "plan": "pro"\n}');
  const [evaluation, setEvaluation] = useState<EvaluationResult>();
  const [evaluationError, setEvaluationError] = useState("");
  const [evaluating, setEvaluating] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) {
      setError("Invalid feature flag ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextFlag, nextEnvironments, nextRules, nextGroups, nextVersions] = await Promise.all([
        flagApi.get(id),
        environmentApi.list(),
        flagApi.targetingRules(id),
        userGroupApi.list(),
        workspaceApi.versions(id),
      ]);
      setFlag(nextFlag);
      setRollout(nextFlag.rollout_percentage);
      setEnvironments(nextEnvironments);
      setRules(nextRules);
      setGroups(nextGroups);
      setVersions(nextVersions);
      setEvaluationEnvironment((previous) =>
        previous || String(nextFlag.environment_id),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load this feature flag.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleEnvironmentChange = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "number" && Number.isInteger(id) && id > 0) {
        setEvaluationEnvironment(String(id));
      }
    };
    window.addEventListener("featureflow:environment-changed", handleEnvironmentChange);
    return () => window.removeEventListener("featureflow:environment-changed", handleEnvironmentChange);
  }, []);

  async function saveFlag(updates: Partial<FeatureFlag>, successMessage: string) {
    if (!flag) return;
    setSaving(true);
    setError("");
    try {
      const updated = await flagApi.update(flag.id, {
        key: flag.key,
        type: flag.type,
        default_value: flag.default_value,
        enabled: updates.enabled ?? flag.enabled,
        rollout_percentage: updates.rollout_percentage ?? flag.rollout_percentage,
        description: flag.description,
        environment_id: flag.environment_id,
      });
      setFlag(updated);
      setRollout(updated.rollout_percentage);
      setVersions(await workspaceApi.versions(flag.id));
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update this feature flag.");
    } finally {
      setSaving(false);
    }
  }

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRuleError("");
    if (!flag) return;
    let value: unknown;
    let result: unknown;
    try {
      value = ruleType === "user_group"
        ? Number(ruleGroupId)
        : ruleType === "user"
          ? ruleValue.trim()
          : parseJson(ruleValue, "Condition value");
      result = parseJson(ruleResult, "Result");
      if (ruleType === "user_group" && (!Number.isInteger(value) || Number(value) <= 0)) {
        throw new Error("Choose a user group for this rule.");
      }
      if (ruleType === "user" && typeof value === "string" && !value) {
        throw new Error("Enter an external user key for this rule.");
      }
      const payload: TargetingRulePayload = {
        rule_type: ruleType,
        operator: ruleType === "user_group" ? "in_group" : ruleType === "user" ? "equals" : ruleOperator,
        attribute: ruleType === "attribute" ? ruleAttribute.trim() : null,
        value,
        result,
        priority: Number(rulePriority),
        is_active: ruleActive,
      };
      setRuleSaving(true);
      if (editingRule) await flagApi.updateTargetingRule(editingRule.id, payload);
      else await flagApi.createTargetingRule(flag.id, payload);
      setNotice(editingRule ? "Targeting rule updated." : "Targeting rule added.");
      resetRuleForm();
      await load();
    } catch (cause) {
      setRuleError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not save this targeting rule.");
    } finally {
      setRuleSaving(false);
    }
  }

  function editRule(rule: TargetingRule) {
    setEditingRule(rule);
    setRuleType(rule.rule_type);
    setRuleOperator(rule.operator);
    setRuleAttribute(rule.attribute ?? "");
    setRuleValue(rule.rule_type === "user" ? String(rule.value) : JSON.stringify(rule.value));
    setRuleResult(JSON.stringify(rule.result));
    setRuleGroupId(rule.rule_type === "user_group" ? String(rule.value) : "");
    setRulePriority(String(rule.priority));
    setRuleActive(rule.is_active);
    setRuleError("");
  }

  function resetRuleForm() {
    setEditingRule(undefined);
    setRuleType("attribute");
    setRuleOperator("equals");
    setRuleAttribute("country");
    setRuleValue('"US"');
    setRuleResult(flag ? JSON.stringify(flag.default_value) : "true");
    setRuleGroupId("");
    setRulePriority("100");
    setRuleActive(true);
    setRuleError("");
  }

  async function removeRule(rule: TargetingRule) {
    if (!window.confirm("Delete this targeting rule?")) return;
    setRuleError("");
    try {
      await flagApi.deleteTargetingRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setNotice("Targeting rule deleted.");
    } catch (cause) {
      setRuleError(cause instanceof ApiError ? cause.message : "Could not delete this targeting rule.");
    }
  }

  async function runEvaluation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvaluationError("");
    setEvaluation(undefined);
    if (!flag) return;
    try {
      const attributes = parseJson(evaluationAttributes, "Attributes");
      if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
        throw new Error("Attributes must be a JSON object.");
      }
      setEvaluating(true);
      const result = await evaluationApi.evaluate({
        flag_key: flag.key,
        environment: environments.find((item) => String(item.id) === evaluationEnvironment)?.name ?? "",
        ...(evaluationUserKey.trim() ? { user_key: evaluationUserKey.trim() } : {}),
        attributes: attributes as Record<string, unknown>,
      });
      setEvaluation(result);
    } catch (cause) {
      setEvaluationError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not evaluate this flag.");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <WorkspaceLayout
      title={flag?.key ?? "Feature flag details"}
      description="Configure release behavior, targeting rules, and evaluate a test context."
      actions={<Link className="button secondary" to="/flags">← All flags</Link>}
    >
      {notice && <Notice kind="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {loading ? <LoadingState label="Loading feature flag…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : flag ? (
        <div className="flag-detail-layout">
          <section className={`kill-switch-card ${flag.enabled ? "" : "is-off"}`}>
            <div className="kill-switch-copy">
              <span className="page-eyebrow">RELEASE CONTROL</span>
              <h2>{flag.enabled ? "Flag is live" : "Flag is paused"}</h2>
              <p>{flag.enabled ? "The flag can serve its configured value to eligible users." : "This kill switch overrides targeting and rollout rules."}</p>
            </div>
            <button
              className={`kill-switch-button ${flag.enabled ? "danger" : "restore"}`}
              disabled={saving}
              onClick={() => void saveFlag({ enabled: !flag.enabled }, flag.enabled ? "Kill switch engaged." : "Feature flag enabled.")}
            >
              <span className="kill-switch-indicator" />
              {flag.enabled ? "Turn off flag" : "Re-enable flag"}
            </button>
          </section>

          <div className="flag-detail-grid">
            <section className="panel-card rollout-card">
              <div className="panel-heading"><div><h2>Percentage rollout</h2><p>Gradually expose this flag to a stable share of users.</p></div><span className="rollout-big">{rollout}%</span></div>
              <label className="rollout-slider">
                <span className="sr-only">Rollout percentage</span>
                <input type="range" min="0" max="100" step="1" value={rollout} onChange={(event) => setRollout(Number(event.target.value))} />
              </label>
              <div className="rollout-scale"><span>0% · Nobody</span><span>100% · Everyone</span></div>
              <div className="rollout-preview"><span className="progress-track"><i style={{ width: `${rollout}%` }} /></span><strong>{rollout}%</strong><small>of identified users</small></div>
              {flag.type === "boolean" && (
                <div className="variation-split" aria-label="Boolean rollout variations">
                  <div><span><i className="variation-true" />True variation</span><strong>{flag.default_value === true ? rollout : 0}%</strong></div>
                  <div><span><i className="variation-false" />False variation</span><strong>{flag.default_value === true ? 100 - rollout : 100}%</strong></div>
                </div>
              )}
              <button className="button primary" disabled={saving || rollout === flag.rollout_percentage} onClick={() => void saveFlag({ rollout_percentage: rollout }, "Rollout percentage saved.")}>Save rollout</button>
              <p className="helper-text">Stable assignment uses the external end-user key, never a dashboard account.</p>
            </section>

            <section className="panel-card config-summary-card">
              <div className="panel-heading"><div><h2>Configuration</h2><p>Current flag settings.</p></div><button className="button secondary" onClick={() => setFormOpen(true)}>Edit flag</button></div>
              <dl className="config-list">
                <div><dt>Environment</dt><dd>{environments.find((item) => item.id === flag.environment_id)?.name ?? "Unknown"}</dd></div>
                <div><dt>Type</dt><dd><span className="type-pill">{flag.type}</span></dd></div>
                <div><dt>Default value</dt><dd><code className="value-code">{displayValue(flag.default_value)}</code></dd></div>
                <div><dt>Description</dt><dd>{flag.description || "No description"}</dd></div>
                <div><dt>Targeting rules</dt><dd>{rules.length}</dd></div>
              </dl>
            </section>
          </div>

          <section className="panel-card targeting-panel">
            <div className="panel-heading"><div><h2>Targeting rules <span className="count-pill">{rules.length}</span></h2><p>Rules are evaluated in priority order, before percentage rollout.</p></div></div>
            {rules.length === 0 ? <EmptyState title="No targeting rules yet">Add a rule to return a specific value for a matching user context.</EmptyState> : (
              <div className="targeting-rule-list">
                {rules.map((rule) => {
                  const group = rule.rule_type === "user_group" ? groups.find((item) => item.id === Number(rule.value)) : undefined;
                  return <article className="targeting-rule-card" key={rule.id}>
                    <span className="rule-priority">{rule.priority}</span>
                    <div className="targeting-rule-copy">
                      <strong>{rule.rule_type === "user_group" ? `Member of ${group?.name ?? `group ${String(rule.value)}`}` : rule.rule_type === "user" ? `External user key is ${String(rule.value)}` : `${rule.attribute} ${rule.operator.replaceAll("_", " ")} ${displayValue(rule.value)}`}</strong>
                      <small>Return <code>{displayValue(rule.result)}</code> · {rule.is_active ? "Active" : "Inactive"}</small>
                    </div>
                    <button className="icon-button" aria-label="Edit targeting rule" onClick={() => editRule(rule)}>✎</button>
                    <button className="icon-button danger" aria-label="Delete targeting rule" onClick={() => void removeRule(rule)}>⌫</button>
                  </article>;
                })}
              </div>
            )}
            <form className="rule-form" onSubmit={(event) => void createRule(event)}>
              <div className="rule-form-heading"><strong>{editingRule ? "Edit targeting rule" : "Add a rule"}</strong><span>Lower priority numbers run first.</span></div>
              {ruleError && <Notice kind="error">{ruleError}</Notice>}
              <div className="rule-form-grid">
                <label>Rule kind<select value={ruleType} onChange={(event) => {
                  const next = event.target.value as "user" | "attribute" | "user_group";
                  setRuleType(next);
                  setRuleOperator(next === "user_group" ? "in_group" : "equals");
                }}><option value="user">Specific user</option><option value="attribute">User attribute</option><option value="user_group">User group</option></select></label>
                {ruleType === "attribute" ? <>
                  <label>Attribute<input required value={ruleAttribute} onChange={(event) => setRuleAttribute(event.target.value)} placeholder="country" /></label>
                  <label>Operator<select value={ruleOperator} onChange={(event) => setRuleOperator(event.target.value as RuleOperator)}>{attributeOperators.map((operator) => <option key={operator} value={operator}>{operator.replaceAll("_", " ")}</option>)}</select></label>
                  <label>Value (JSON)<input value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} placeholder={'"US"'} disabled={ruleOperator === "is_set" || ruleOperator === "is_not_set"} /></label>
                </> : ruleType === "user" ? <label>External user key<input required maxLength={255} value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} placeholder="customer-123" /></label> : <label>User group<select required value={ruleGroupId} onChange={(event) => setRuleGroupId(event.target.value)}><option value="">Select a group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
                <label>Return value (JSON)<input required value={ruleResult} onChange={(event) => setRuleResult(event.target.value)} placeholder="true" /></label>
                <label>Priority<input type="number" min="0" max="2147483647" value={rulePriority} onChange={(event) => setRulePriority(event.target.value)} required /></label>
              </div>
              <label className="rule-active-field"><input type="checkbox" checked={ruleActive} onChange={(event) => setRuleActive(event.target.checked)} /> Active rule</label>
              <div className="rule-form-footer"><span className="helper-text">{ruleType === "user" ? "Use a stable external end-user key, never a dashboard account ID." : 'Use JSON values, e.g. "US", 18, or true.'}</span><div className="rule-form-actions">{editingRule && <button className="button secondary" type="button" onClick={resetRuleForm}>Cancel</button>}<button className="button primary" type="submit" disabled={ruleSaving || (ruleType === "user_group" && !groups.length)}>{ruleSaving ? "Saving…" : editingRule ? "Save rule" : "＋ Add rule"}</button></div></div>
            </form>
          </section>

          <section className="panel-card evaluation-panel">
            <div className="panel-heading"><div><h2>Evaluate a test user</h2><p>Preview the result and the rule that determines it.</p></div><span className="evaluation-badge">LIVE EVALUATION</span></div>
            <form className="evaluation-form" onSubmit={(event) => void runEvaluation(event)}>
              {evaluationError && <Notice kind="error">{evaluationError}</Notice>}
              <div className="evaluation-fields">
                <label>Environment<select required value={evaluationEnvironment} onChange={(event) => setEvaluationEnvironment(event.target.value)}>{environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
                <label>External user key <span className="optional-label">stable rollout and group identity</span><input value={evaluationUserKey} onChange={(event) => setEvaluationUserKey(event.target.value)} placeholder="customer-123" /></label>
              </div>
              <label className="attributes-field">Attributes (JSON)<textarea value={evaluationAttributes} onChange={(event) => setEvaluationAttributes(event.target.value)} rows={4} spellCheck={false} /></label>
              <div className="evaluation-actions"><button className="button primary" type="submit" disabled={evaluating || !environments.length}>{evaluating ? "Evaluating…" : "Run evaluation →"}</button><span className="helper-text">User and group rules use the external key; attribute rules use this JSON context.</span></div>
            </form>
            {evaluation && <div className="evaluation-result" role="status">
              <div className="evaluation-result-main"><span className="result-label">RESULT</span><code>{displayValue(evaluation.value)}</code><span className={`result-reason ${evaluation.reason === "FLAG_DISABLED" ? "muted" : ""}`}>{evaluation.reason.replaceAll("_", " ")}</span></div>
              <div className="evaluation-result-meta"><span>Flag <strong>{evaluation.flag_key}</strong></span><span>Environment <strong>{evaluation.environment}</strong></span>{evaluation.rule_id != null && <span>Rule <strong>#{evaluation.rule_id}</strong></span>}{evaluation.rollout_bucket != null && <span>Rollout bucket <strong>{evaluation.rollout_bucket}%</strong></span>}</div>
            </div>}
          </section>

          <section className="panel-card version-history-panel">
            <div className="panel-heading">
              <div><h2>Version history <span className="count-pill">{versions.length}</span></h2><p>Saved flag configurations and their timestamps.</p></div>
            </div>
            {versions.length === 0 ? <EmptyState title="No versions recorded">The next configuration change will create a version.</EmptyState> : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Version</th><th>Configuration</th><th>Saved</th></tr></thead>
                  <tbody>{versions.map((version) => (
                    <tr key={version.id}>
                      <td><span className="count-pill">v{version.version_number}</span></td>
                      <td><code className="version-code">{JSON.stringify(version.configuration)}</code></td>
                      <td>{new Date(version.created_at).toLocaleString()}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
      {formOpen && flag && <FlagForm
        environments={environments}
        initial={flag}
        onSubmit={async (payload) => {
          const updated = await flagApi.update(flag.id, payload);
          setFlag(updated);
          setRollout(updated.rollout_percentage);
          setFormOpen(false);
          setNotice("Feature flag configuration updated.");
        }}
        onCancel={() => setFormOpen(false)}
      />}
    </WorkspaceLayout>
  );
}
