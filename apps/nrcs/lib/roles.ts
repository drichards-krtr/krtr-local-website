export const NRCS_ROLES = ["admin", "editor", "contributor"] as const;

export type NrcsRole = (typeof NRCS_ROLES)[number];

export type NrcsStaffProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: NrcsRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export function isNrcsRole(value: string): value is NrcsRole {
  return NRCS_ROLES.includes(value as NrcsRole);
}

export function roleRank(role: NrcsRole) {
  if (role === "admin") return 3;
  if (role === "editor") return 2;
  return 1;
}

export function hasNrcsRoleAtLeast(role: NrcsRole, minimum: NrcsRole) {
  return roleRank(role) >= roleRank(minimum);
}
