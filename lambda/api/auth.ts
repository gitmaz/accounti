import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { groupsForRole } from "../../shared/access";
import type { Account, CompanyLogin, Role, SessionUser } from "../../shared/types";
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

function sameCompany(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function asLogin(account: Account): CompanyLogin {
  return { companySlug: account.companySlug, passwordHash: account.passwordHash, groups: account.groups, name: account.name };
}

/** The login record for the company in the page address, with that company's password. */
export function viewForCompany(account: Account, companySlug: string): Account | null {
  const slug = companySlug.trim().toLowerCase();
  if (!slug) return null;
  if (sameCompany(account.companySlug, slug)) {
    const view = { ...account };
    delete view.logins;
    return view;
  }
  const extra = (account.logins || []).find((row) => sameCompany(row.companySlug, slug));
  if (!extra) return null;
  return { email: account.email, name: extra.name, passwordHash: extra.passwordHash, groups: extra.groups, companySlug: extra.companySlug };
}

export function accountHasCompany(account: Account | null, companySlug: string): boolean {
  return Boolean(account && viewForCompany(account, companySlug));
}

export function accountsForCompany(accounts: Account[], companySlug: string): Account[] {
  return accounts.flatMap((account) => {
    const view = viewForCompany(account, companySlug);
    return view ? [view] : [];
  });
}

function mergeCompanyLogin(existing: Account, incoming: Account): Account {
  if (!incoming.companySlug || sameCompany(incoming.companySlug, existing.companySlug)) {
    return { ...existing, ...incoming, email: existing.email, logins: incoming.logins ?? existing.logins };
  }
  const logins = [...(existing.logins || [])];
  const entry = asLogin(incoming);
  const index = logins.findIndex((row) => sameCompany(row.companySlug, incoming.companySlug));
  if (index >= 0) logins[index] = { ...logins[index], ...entry };
  else logins.push(entry);
  return { ...existing, logins };
}

function accountForLogin(stored: Account, companySlug: string): Account | { error: string } | null {
  const slug = companySlug.trim().toLowerCase();
  if (slug) return viewForCompany(stored, slug);
  if ((stored.logins || []).length > 0) return { error: "Open the company page, then sign in" };
  return stored;
}

export async function loginWithPassword(
  email: string,
  password: string,
  companySlug = "",
): Promise<{ token: string; user: SessionUser } | { error: string } | null> {
  const stored = await getStore().getAccount(email.trim().toLowerCase());
  if (!stored) return null;
  const selected = accountForLogin(stored, companySlug);
  if (!selected) return null;
  if ("error" in selected) return selected;
  const account = selected;
  if (!verifyPassword(password, account.passwordHash)) return null;
  const groups = withSuperAdminGroup(account.email, account.groups);
  if (groups.length !== account.groups.length || groups.some((group) => !account.groups.includes(group))) {
    await saveAccount({ ...account, groups });
  }
  const user: SessionUser = { email: account.email, name: account.name, groups, companySlug: account.companySlug };
  return { token: signDemoToken(user), user };
}

export async function saveAccount(account: Account): Promise<void> {
  const store = getStore();
  const existing = await store.getAccount(account.email);
  await store.putAccount(existing ? mergeCompanyLogin(existing, account) : account);
}

export function accountGroups(email: string, role: Role): string[] {
  return withSuperAdminGroup(email, groupsForRole(role));
}
