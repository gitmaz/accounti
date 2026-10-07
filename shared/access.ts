import type { Role } from "./types";

const ALL: Role[] = ["admin", "accountant", "approver", "bookkeeper", "auditor"];

export function isRole(value: unknown): value is Role {
  return ALL.includes(value as Role);
}

export function canDraft(role: Role): boolean {
  return role === "admin" || role === "accountant" || role === "bookkeeper";
}

export function canApprove(role: Role): boolean {
  return role === "admin" || role === "accountant" || role === "approver";
}

export function canPost(role: Role): boolean {
  return role === "admin" || role === "accountant";
}

export function canManageBooks(role: Role): boolean {
  return role === "admin" || role === "accountant";
}

export function canManageSettings(role: Role): boolean {
  return role === "admin";
}

export function groupsForRole(role: Role): string[] {
  if (role === "admin") return ["admins"];
  if (role === "accountant") return ["accountants"];
  if (role === "approver") return ["approvers"];
  if (role === "auditor") return ["auditors"];
  return ["bookkeepers"];
}
