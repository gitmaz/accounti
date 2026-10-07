import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { groupsForRole } from "../../shared/access";
import type { Account, Role, SessionUser } from "../../shared/types";
import { withSuperAdminGroup } from "../../shared/super-admin";
import { readDemoToken, signDemoToken, verifyPassword } from "./passwords";
import { getStore } from "./store";

export function demoAuthEnabled(): boolean {
  return process.env.DEMO_AUTH !== "0";
}

function bearer(event: APIGatewayProxyEventV2): string {
  const raw = event.headers?.authorization || event.headers?.Authorization || "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

export function identityFromEvent(event: APIGatewayProxyEventV2): SessionUser | null {
  const token = bearer(event);
  if (token.startsWith("demo.")) return readDemoToken(token);
  const claims = (
    event.requestContext as { authorizer?: { jwt?: { claims?: Record<string, unknown> } } }
  ).authorizer?.jwt?.claims;
  if (!claims) return null;
  const groupsRaw = claims["cognito:groups"];
  const groups = Array.isArray(groupsRaw)
    ? groupsRaw.map(String)
    : typeof groupsRaw === "string"
      ? groupsRaw.split(",").map((group) => group.trim()).filter(Boolean)
      : [];
  return {
    email: String(claims.email || "").toLowerCase(),
    name: String(claims.name || claims.email || ""),
    groups,
    companySlug: String(claims["custom:company"] || ""),
  };
}

export async function loginWithPassword(email: string, password: string): Promise<{ token: string; user: SessionUser } | null> {
  const account = await getStore().getAccount(email.trim().toLowerCase());
  if (!account || !verifyPassword(password, account.passwordHash)) return null;
  const groups = withSuperAdminGroup(account.email, account.groups);
  if (groups.length !== account.groups.length || groups.some((group) => !account.groups.includes(group))) {
    await saveAccount({ ...account, groups });
  }
  const user: SessionUser = { email: account.email, name: account.name, groups, companySlug: account.companySlug };
  return { token: signDemoToken(user), user };
}

export async function saveAccount(account: Account): Promise<void> {
  await getStore().putAccount(account);
}

export function accountGroups(email: string, role: Role): string[] {
  return withSuperAdminGroup(email, groupsForRole(role));
}
