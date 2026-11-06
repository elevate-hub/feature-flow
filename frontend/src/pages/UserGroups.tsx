import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  WorkspaceLayout,
} from "../components/WorkspaceLayout";
import { userGroupApi, type UserGroup, type UserGroupPayload } from "../services/userGroups";

export default function UserGroups() {
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserGroup>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [userKeyByGroup, setUserKeyByGroup] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setGroups(await userGroupApi.list());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load user groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openForm(group?: UserGroup) {
    setEditing(group);
    setName(group?.name ?? "");
    setDescription(group?.description ?? "");
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const payload: UserGroupPayload = {
      name: name.trim(),
      description: description.trim() || null,
    };
    try {
      if (editing) await userGroupApi.update(editing.id, payload);
      else await userGroupApi.create(payload);
      setNotice(editing ? "User group updated." : "User group created.");
      setFormOpen(false);
      setEditing(undefined);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save this user group.");
    } finally {
      setSaving(false);
    }
  }

  async function removeGroup(group: UserGroup) {
    if (!window.confirm(`Delete “${group.name}”? Groups used by targeting rules cannot be deleted.`)) return;
    setError("");
    try {
      await userGroupApi.remove(group.id);
      setNotice(`User group “${group.name}” deleted.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete this user group.");
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>, group: UserGroup) {
    event.preventDefault();
    const userKey = userKeyByGroup[group.id]?.trim() ?? "";
    if (!userKey) return;
    setError("");
    try {
      await userGroupApi.addMember(group.id, userKey);
      setUserKeyByGroup((current) => ({ ...current, [group.id]: "" }));
      setNotice(`Added ${userKey} to ${group.name}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add this member.");
    }
  }

  async function removeMember(group: UserGroup, membershipId: number) {
    setError("");
    try {
      await userGroupApi.removeMember(group.id, membershipId);
      setNotice("Group member removed.");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove this member.");
    }
  }

  const visibleGroups = groups.filter((group) =>
    `${group.name} ${group.description ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <WorkspaceLayout
      title="User groups"
      description="Organize external end users into groups for targeted releases."
      actions={<button className="button primary" onClick={() => openForm()}>＋ New group</button>}
    >
      {notice && <Notice kind="success" onDismiss={() => setNotice("")}>{notice}</Notice>}
      {error && <ErrorState message={error} onRetry={() => void load()} />}
      <div className="group-search-toolbar">
        <label className="search-field">
          <span className="sr-only">Search user groups</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user groups" />
        </label>
      </div>
      {formOpen && <form className="panel-card user-group-form" onSubmit={(event) => void save(event)}>
        <div className="panel-heading"><div><h2>{editing ? "Edit user group" : "Create user group"}</h2><p>Group membership can be used in feature targeting rules.</p></div><button className="icon-button" type="button" aria-label="Close form" onClick={() => setFormOpen(false)}>×</button></div>
        <div className="form-grid">
          <label>Group name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={150} placeholder="Beta customers" /></label>
          <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Early access users" /></label>
        </div>
        <div className="modal-actions"><button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create group"}</button></div>
      </form>}
      {loading ? <LoadingState label="Loading user groups…" /> : groups.length === 0 ? (
        <section className="panel-card"><EmptyState title="No user groups yet">Create a group to target a release to a specific set of users.</EmptyState><button className="button primary empty-action" onClick={() => openForm()}>Create a user group</button></section>
      ) : visibleGroups.length === 0 ? (
        <section className="panel-card"><EmptyState title="No matching groups">Try a different search.</EmptyState></section>
      ) : (
        <section className="panel-card table-panel">
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Group name</th><th>Users</th><th>Description</th><th>Membership</th><th>Actions</th></tr></thead>
            <tbody>{visibleGroups.map((group) => (
              <tr key={group.id}>
                <td><strong className="group-table-name">{group.name}</strong></td>
                <td><span className="count-pill">{group.member_count}</span></td>
                <td>{group.description || "—"}</td>
                <td>
                  <details className="group-member-details">
                    <summary>Manage members</summary>
                    {group.members.length ? <ul className="group-member-list">
                      {group.members.map((member) => <li key={member.id}>
                        <span className="group-member-copy"><strong>{member.user_key}</strong><small>External user key</small></span>
                        <button className="icon-button danger" aria-label={`Remove ${member.user_key} from ${group.name}`} onClick={() => void removeMember(group, member.id)}>×</button>
                      </li>)}
                    </ul> : <p className="group-empty-members">No external users have been added to this group.</p>}
                    <form className="add-member-form" onSubmit={(event) => void addMember(event, group)}>
                      <label htmlFor={`member-key-${group.id}`}>Add external end user</label>
                      <div><input id={`member-key-${group.id}`} required maxLength={255} value={userKeyByGroup[group.id] ?? ""} onChange={(event) => setUserKeyByGroup((current) => ({ ...current, [group.id]: event.target.value }))} placeholder="demo-user-123" /><button className="button secondary" type="submit">Add</button></div>
                    </form>
                  </details>
                </td>
                <td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${group.name}`} onClick={() => openForm(group)}>✎</button><button className="icon-button danger" aria-label={`Delete ${group.name}`} onClick={() => void removeGroup(group)}>⌫</button></div></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </WorkspaceLayout>
  );
}
