import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { randomUUID } from "crypto";

import { canDraft, canManageBooks, canManageSettings, isRole } from "../../shared/access";
import { accountiFeatures, accountiHas, companyFeatureSet } from "../../shared/accounti-features";
import { featureSetFromBundle, type FeatureSetId } from "../../shared/featureset";
import { isReservedCompanySlug, isValidCompanySlug, slugifyCompanyName } from "../../lib/company";
import { balanceSheet, bankLines, basWorksheet, profitAndLoss, reconciliationDifference } from "../../shared/ledger";
import { freshCompanyTenant } from "../../shared/seed";
import { normalizeLanguage } from "../../shared/language";
import { readSignInCopy } from "../../shared/signin-copy";
import { isSuperAdmin, withSuperAdminGroup } from "../../shared/super-admin";
import type { BookDocument, Company, Member, Reconciliation, Role, SmtpSettings, TenantData } from "../../shared/types";
import { accountGroups, demoAuthEnabled, identityFromEvent, loginWithPassword, saveAccount } from "./auth";
import { memberFor, parseAccount, parseContact, parseDocument, roleOf, transitionDocument } from "./books";
import { hashPassword } from "./passwords";
import { ensureDemo, getStore } from "./store";

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

function bodyOf(event: APIGatewayProxyEventV2): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function trialEnded(company: Company | null): boolean {
  if (!company?.trialExpiresAt) return false;
  const at = Date.parse(company.trialExpiresAt);
  return Number.isFinite(at) && at < Date.now();
}

function publicSmtp(smtp: SmtpSettings, reveal: boolean): SmtpSettings {
  if (!reveal) return { host: "", port: 587, username: "", password: "", encryption: "tls", from: "" };
  return { ...smtp, password: "" };
}

function workspace(company: Company, tenant: TenantData, role: Role, revealMail: boolean) {
  const set = companyFeatureSet(company);
  return {
    company: { ...company, featureSet: set },
    role,
    features: accountiFeatures(set),
    smtpAccess: revealMail,
    smtp: publicSmtp(tenant.smtp, revealMail),
    approvalEnabled: tenant.approvalEnabled,
    fields: tenant.fields,
    accounts: tenant.accounts,
    contacts: tenant.contacts,
    documents: tenant.documents,
    members: tenant.members,
    reconciliations: tenant.reconciliations,
    mailLog: revealMail ? tenant.mailLog.slice(-12) : [],
  };
}

async function activate(body: Record<string, unknown>): Promise<APIGatewayProxyResultV2> {
  const email = String(body.email || "").trim().toLowerCase();
  const activationCode = String(body.activationCode || body.activation_code || "").trim();
  const companySlug = slugifyCompanyName(String(body.companySlug || body.company || ""));
  const password = String(body.password || "");
  const given = String(body.firstname || body.givenName || "Office").trim() || "Office";
  const family = String(body.lastname || body.familyName || "Admin").trim();
  if (!email || !activationCode || !companySlug) return json(400, { error: "Email, company, and code are required" });
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters" });
  if (!isValidCompanySlug(companySlug) || isReservedCompanySlug(companySlug)) return json(400, { error: "Choose a different company name" });

  const handshake = (process.env.HANDSHAKE_SAAS_API_URL || "").trim().replace(/\/+$/, "");
  let companyName = String(body.companyName || companySlug);
  let adminGiven = given;
  let adminFamily = family;
  let featureSet: FeatureSetId = featureSetFromBundle(body.bundleSelector ?? body.bundle_selector ?? body.featureSet);
  let language = normalizeLanguage(body.language);
  if (handshake) {
    const res = await fetch(`${handshake}/verification/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, activation_code: activationCode, plugin_name: "accounti" }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      company?: string;
      company_slug?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      bundle_selector?: number | string;
      language?: string;
    };
    if (!res.ok || !data.ok) return json(403, { error: data.error || data.message || "Invalid activation code" });
    if (String(data.email || email).toLowerCase() !== email) return json(403, { error: "Email does not match this subscription" });
    if (String(data.company_slug || "") !== companySlug) return json(403, { error: "This activation is for a different company URL" });
    companyName = String(data.company || companyName);
    adminGiven = String(data.firstname || adminGiven);
    adminFamily = String(data.lastname || adminFamily);
    featureSet = featureSetFromBundle(data.bundle_selector);
    language = normalizeLanguage(data.language || language);
  } else if (demoAuthEnabled() && activationCode === "1234567890") {
    companyName = companyName || companySlug;
  } else return json(503, { error: "Handshake SaaS API is not configured" });

  const store = getStore();
  const existing = await store.getCompany(companySlug);
  if (existing && existing.subscriberEmail.toLowerCase() !== email) return json(409, { error: "That company name is already in use" });
  const adminName = `${adminGiven} ${adminFamily}`.trim();
  if (existing?.trialExpiresAt) {
    const kept = { ...existing, plan: "monthly" as const, featureSet, language };
    delete kept.trialExpiresAt;
    await store.putCompany(kept);
    await saveAccount({ email, name: adminName, passwordHash: hashPassword(password), groups: withSuperAdminGroup(email, ["admins"]), companySlug });
    return json(200, { ok: true, company: { slug: companySlug, name: existing.name } });
  }
  if (existing) return json(409, { error: "This company is already activated" });
  const admin = { id: `member-${randomUUID().slice(0, 8)}`, email, name: adminName };
  await store.putCompany({
    slug: companySlug,
    name: companyName,
    abn: "",
    plan: "monthly",
    featureSet,
    createdAt: new Date().toISOString(),
    subscriberEmail: email,
    language,
  });
  await store.replaceTenant(companySlug, freshCompanyTenant(admin));
  await saveAccount({ email, name: adminName, passwordHash: hashPassword(password), groups: withSuperAdminGroup(email, ["admins"]), companySlug });
  return json(200, { ok: true, company: { slug: companySlug, name: companyName } });
}

async function startTrial(body: Record<string, unknown>, adminKey: string): Promise<APIGatewayProxyResultV2> {
  const expected = (process.env.HANDSHAKE_ADMIN_SECRET || "").trim() || `handshake-admin-${process.env.STAGE || "dev"}`;
  if (adminKey !== expected) return json(401, { error: "Handshake admin key required" });
  const email = String(body.email || "").trim().toLowerCase();
  const given = String(body.firstname || body.firstName || "Trial").trim() || "Trial";
  const family = String(body.lastname || body.lastName || "User").trim() || "User";
  const companyName = String(body.company || "").trim();
  const slug = slugifyCompanyName(String(body.companySlug || body.company_slug || companyName));
  const password = String(body.password || "");
  const expiresAt = String(body.expiresAt || body.expires_at || "");
  const name = `${given} ${family}`.trim();
  if (!email.includes("@")) return json(400, { error: "A valid email is required" });
  if (!companyName || !isValidCompanySlug(slug) || isReservedCompanySlug(slug)) return json(400, { error: "Choose a different company name" });
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters" });
  if (!Number.isFinite(Date.parse(expiresAt))) return json(400, { error: "Trial expiry is required" });
  const store = getStore();
  const existing = await store.getCompany(slug);
  if (existing) {
    const same = existing.subscriberEmail.toLowerCase() === email;
    return json(409, { error: same ? "A trial was already started for this email" : "That company name is already in use", trial_used: same });
  }
  if (await store.getAccount(email)) return json(409, { error: "This email already has an Accounti login", trial_used: true });
  const admin = { id: `member-${randomUUID().slice(0, 8)}`, email, name };
  const company: Company = {
    slug,
    name: companyName,
    abn: "",
    plan: "free",
    featureSet: "c",
    createdAt: new Date().toISOString(),
    subscriberEmail: email,
    trialExpiresAt: expiresAt,
    language: normalizeLanguage(body.language),
  };
  const tenant = freshCompanyTenant(admin);
  tenant.documents = [];
  await store.putCompany(company);
  await store.replaceTenant(slug, tenant);
  await saveAccount({ email, name, passwordHash: hashPassword(password), groups: ["admins"], companySlug: slug });
  return json(200, { ok: true, company: { slug, name: companyName } });
}

function saveDoc(tenant: TenantData, doc: BookDocument) {
  const index = tenant.documents.findIndex((row) => row.id === doc.id);
  if (index >= 0) tenant.documents[index] = doc;
  else tenant.documents.push(doc);
}

async function signInCopy(method: string, event: APIGatewayProxyEventV2, body: Record<string, unknown>) {
  if (method === "GET") return json(200, { copy: readSignInCopy(await getStore().getSignIn()) });
  if (method !== "PUT") return json(405, { error: "Method not allowed" });
  const actor = identityFromEvent(event);
  if (!actor) return json(401, { error: "Sign in required" });
  if (!isSuperAdmin(actor)) return json(403, { error: "Only a super-admin edits the sign-in page" });
  const copy = readSignInCopy(body);
  await getStore().putSignIn(copy);
  return json(200, { copy });
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method.toUpperCase();
  const path = (event.rawPath || "/").split("?")[0] || "/";
  if (method === "OPTIONS") return json(200, { ok: true });
  try {
    await ensureDemo();
    if (method === "GET" && path === "/health") return json(200, { ok: true, service: "accounti", storage: process.env.STORE || "memory" });
    if (method === "GET" && path === "/config") {
      return json(200, { product: "accounti", handshake: Boolean(process.env.HANDSHAKE_SAAS_API_URL) });
    }
    const body = bodyOf(event);
    if (path === "/signin-copy") return signInCopy(method, event, body);
    if (method === "POST" && path === "/auth/login") {
      const result = await loginWithPassword(String(body.email || ""), String(body.password || ""));
      if (!result) return json(401, { error: "Email or password is wrong" });
      const home = await getStore().getCompany(result.user.companySlug);
      return json(200, { ...result, language: home?.language ? normalizeLanguage(home.language) : undefined });
    }
    if (method === "POST" && path === "/auth/activate") return activate(body);
    if (method === "POST" && path === "/auth/trial") {
      const key = event.headers?.["x-handshake-admin-key"] || event.headers?.["X-Handshake-Admin-Key"] || "";
      return startTrial(body, key);
    }

    const match = path.match(/^\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if (!match) return json(404, { error: "Not found" });
    const [, slug, section, id, action] = match;
    const user = identityFromEvent(event);
    if (!user) return json(401, { error: "Sign in required" });
    if (user.companySlug && user.companySlug !== slug && !isSuperAdmin(user)) return json(403, { error: "This is another company's books" });
    const store = getStore();
    const company = await store.getCompany(slug);
    if (!company) return json(404, { error: "Company not found" });
    if (trialEnded(company)) return json(402, { error: "This trial has ended" });
    const tenant = await store.load(slug);
    const member = memberFor(tenant, user.email);
    if (!member && !isSuperAdmin(user)) return json(403, { error: "You are not in this company" });
    const role = roleOf(member, user.groups);
    const set = companyFeatureSet(company);
    const revealMail = isSuperAdmin(user);
    const actor = member || { id: "super", email: user.email, name: user.name, role: "admin" as const, notify: false };

    if (method === "GET" && section === "workspace" && !id) return json(200, workspace(company, tenant, role, revealMail));

    if (method === "PUT" && section === "workspace" && !id) {
      if (!canManageSettings(role) && !isSuperAdmin(user)) return json(403, { error: "An admin changes company settings" });
      if (typeof body.approvalEnabled === "boolean" && accountiHas(set, "approval")) tenant.approvalEnabled = body.approvalEnabled;
      if (typeof body.abn === "string") {
        const { isValidAbn } = await import("../../shared/ledger");
        const abn = body.abn.replace(/\s/g, "");
        if (abn && !isValidAbn(abn)) return json(400, { error: "That ABN is not valid" });
        company.abn = abn;
        await store.putCompany(company);
      }
      if (body.fields && typeof body.fields === "object") {
        const { normalizeDialogFieldsConfig } = await import("../../shared/fields");
        tenant.fields = normalizeDialogFieldsConfig(body.fields);
      }
      if (revealMail && body.smtp && typeof body.smtp === "object") {
        const smtp = body.smtp as Partial<SmtpSettings>;
        tenant.smtp = {
          ...tenant.smtp,
          host: String(smtp.host ?? tenant.smtp.host).trim(),
          port: Number(smtp.port || tenant.smtp.port || 587) || 587,
          username: String(smtp.username ?? tenant.smtp.username).trim(),
          encryption: smtp.encryption === "ssl" || smtp.encryption === "" ? smtp.encryption : "tls",
          from: String(smtp.from ?? tenant.smtp.from).trim(),
          password: String(smtp.password || "").trim() ? String(smtp.password) : tenant.smtp.password,
        };
      }
      await store.replaceTenant(slug, tenant);
      return json(200, workspace(company, tenant, role, revealMail));
    }

    if (section === "contacts") {
      if (method === "POST" && !id) {
        if (!canDraft(role)) return json(403, { error: "You cannot add contacts" });
        const contact = parseContact(body);
        if ("error" in contact) return json(400, contact);
        tenant.contacts.push(contact);
        await store.replaceTenant(slug, tenant);
        return json(201, { contact });
      }
      if (method === "PUT" && id) {
        if (!canDraft(role)) return json(403, { error: "You cannot edit contacts" });
        const contact = parseContact(body, id);
        if ("error" in contact) return json(400, contact);
        const index = tenant.contacts.findIndex((row) => row.id === id);
        if (index < 0) return json(404, { error: "Contact not found" });
        tenant.contacts[index] = contact;
        await store.replaceTenant(slug, tenant);
        return json(200, { contact });
      }
    }

    if (section === "accounts") {
      if (method === "POST" && !id) {
        if (!canManageBooks(role)) return json(403, { error: "An accountant edits the chart of accounts" });
        const account = parseAccount(body);
        if ("error" in account) return json(400, account);
        tenant.accounts.push(account);
        await store.replaceTenant(slug, tenant);
        return json(201, { account });
      }
    }

    if (section === "documents") {
      if (method === "POST" && !id) {
        if (!accountiHas(set, "documents")) return json(403, { error: "This feature set does not include documents" });
        if (!canDraft(role)) return json(403, { error: "You cannot add documents" });
        const doc = parseDocument(body, null, tenant);
        if ("error" in doc) return json(400, doc);
        doc.ownerId = actor.id;
        saveDoc(tenant, doc);
        await store.replaceTenant(slug, tenant);
        return json(201, { document: doc });
      }
      if (method === "PUT" && id && !action) {
        const current = tenant.documents.find((row) => row.id === id);
        if (!current) return json(404, { error: "Document not found" });
        if (current.status === "posted" || current.status === "paid") return json(400, { error: "Posted documents stay as they are" });
        if (!canDraft(role) && current.ownerId !== actor.id) return json(403, { error: "You cannot edit this" });
        const doc = parseDocument(body, current, tenant);
        if ("error" in doc) return json(400, doc);
        doc.version = current.version + 1;
        saveDoc(tenant, doc);
        await store.replaceTenant(slug, tenant);
        return json(200, { document: doc });
      }
      if (method === "POST" && id && action === "transition") {
        const current = tenant.documents.find((row) => row.id === id);
        if (!current) return json(404, { error: "Document not found" });
        const doc = await transitionDocument(tenant, current, String(body.action || ""), actor, set);
        if ("error" in doc) return json(400, doc);
        saveDoc(tenant, doc);
        await store.replaceTenant(slug, tenant);
        return json(200, { document: doc });
      }
      if (method === "POST" && id && action === "comments") {
        if (!accountiHas(set, "comments")) return json(403, { error: "Comments are in feature set C" });
        const current = tenant.documents.find((row) => row.id === id);
        if (!current) return json(404, { error: "Document not found" });
        const text = String(body.text || "").trim();
        if (!text) return json(400, { error: "Write a comment" });
        current.comments.push({ id: randomUUID(), at: new Date().toISOString(), memberId: actor.id, text });
        await store.replaceTenant(slug, tenant);
        return json(200, { document: current });
      }
    }

    if (method === "GET" && section === "reports") {
      if (!accountiHas(set, "reports")) return json(403, { error: "Reports are in feature set B" });
      const on = String(event.queryStringParameters?.on || new Date().toISOString().slice(0, 10));
      const from = String(event.queryStringParameters?.from || `${on.slice(0, 4)}-07-01`);
      const to = String(event.queryStringParameters?.to || on);
      return json(200, {
        profitAndLoss: profitAndLoss(tenant, on),
        balanceSheet: balanceSheet(tenant, on),
        bas: basWorksheet(tenant, from, to),
      });
    }

    if (section === "reconcile") {
      if (!accountiHas(set, "reconcile")) return json(403, { error: "Bank reconciliation is in feature set C" });
      if (method === "GET") {
        const bankId = String(event.queryStringParameters?.accountId || tenant.accounts.find((account) => account.system === "bank")?.id || "");
        return json(200, { lines: bankLines(tenant, bankId), reconciliations: tenant.reconciliations });
      }
      if (method === "PUT") {
        if (!canManageBooks(role)) return json(403, { error: "An accountant reconciles the bank" });
        const rec: Reconciliation = {
          id: String(body.id || `rec-${randomUUID().slice(0, 8)}`),
          bankAccountId: String(body.bankAccountId || ""),
          statementDate: String(body.statementDate || "").slice(0, 10),
          closingCents: Math.round(Number(body.closingCents || 0)),
          matchedIds: Array.isArray(body.matchedIds) ? body.matchedIds.map(String) : [],
        };
        if (!rec.bankAccountId || !rec.statementDate) return json(400, { error: "Choose the bank account and statement date" });
        const index = tenant.reconciliations.findIndex((row) => row.id === rec.id);
        if (index >= 0) tenant.reconciliations[index] = rec;
        else tenant.reconciliations.push(rec);
        await store.replaceTenant(slug, tenant);
        return json(200, { reconciliation: rec, difference: reconciliationDifference(tenant, rec) });
      }
    }

    if (section === "members" && method === "POST" && !id) {
      if (!canManageSettings(role)) return json(403, { error: "An admin adds people" });
      const email = String(body.email || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      const personRole = isRole(body.role) ? body.role : "bookkeeper";
      if (!email.includes("@") || !name) return json(400, { error: "Name and email are required" });
      if (password.length < 8) return json(400, { error: "Password must be at least 8 characters" });
      if (await store.getAccount(email)) return json(409, { error: "That email already signs in" });
      const person: Member = { id: `member-${randomUUID().slice(0, 8)}`, email, name, role: personRole, notify: body.notify === true };
      tenant.members.push(person);
      await store.replaceTenant(slug, tenant);
      await saveAccount({ email, name, passwordHash: hashPassword(password), groups: accountGroups(email, personRole), companySlug: slug });
      return json(201, { member: person });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(500, { error: error instanceof Error ? error.message : "Something went wrong" });
  }
}
