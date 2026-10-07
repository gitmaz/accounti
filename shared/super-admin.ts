/** Platform operators. Company admins do not see or change SMTP or the SES from address. */
export const SUPER_ADMIN_GROUP = "super-admins";

const SUPER_ADMIN_MEMBERS = ["mn.usyd@gmail.com"];

export function isSuperAdmin(user: { email?: string | null; groups?: readonly string[] | null } | null | undefined): boolean {
  const email = String(user?.email || "").trim().toLowerCase();
  if (SUPER_ADMIN_MEMBERS.includes(email)) return true;
  return Boolean(user?.groups?.includes(SUPER_ADMIN_GROUP));
}

export function withSuperAdminGroup(email: string, groups: readonly string[]): string[] {
  const next = [...new Set(groups)];
  if (isSuperAdmin({ email, groups: next }) && !next.includes(SUPER_ADMIN_GROUP)) next.push(SUPER_ADMIN_GROUP);
  return next;
}
