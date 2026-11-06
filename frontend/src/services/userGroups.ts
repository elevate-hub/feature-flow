import { apiRequest } from "../api/client";

export interface GroupMember {
  id: number;
  user_key: string;
}

export interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  members: GroupMember[];
}

export interface UserGroupPayload {
  name: string;
  description: string | null;
}

export const userGroupApi = {
  list: () => apiRequest<UserGroup[]>("/api/v1/user-groups"),
  create: (payload: UserGroupPayload) =>
    apiRequest<UserGroup>("/api/v1/user-groups", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: UserGroupPayload) =>
    apiRequest<UserGroup>(`/api/v1/user-groups/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<void>(`/api/v1/user-groups/${id}`, { method: "DELETE" }),
  addMember: (id: number, user_key: string) =>
    apiRequest<UserGroup>(`/api/v1/user-groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ user_key }),
    }),
  removeMember: (groupId: number, membershipId: number) =>
    apiRequest<UserGroup>(`/api/v1/user-groups/${groupId}/members/${membershipId}`, {
      method: "DELETE",
    }),
};
