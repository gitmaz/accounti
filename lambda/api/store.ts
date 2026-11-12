import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

import { AUTOTEST_COMPANY_SLUG } from "../../lib/company";
import { groupsForRole } from "../../shared/access";
import { normalizeDialogFieldsConfig } from "../../shared/fields";
import {
  autotestAccountSpecs,
  autotestCompany,
  autotestTenant,
  demoCompany,
  demoMembers,
  demoTenant,
  emptySmtp,
  emptyTenant,
} from "../../shared/seed";
import { withSuperAdminGroup } from "../../shared/super-admin";
import type { Account, Company, TenantData } from "../../shared/types";
import { hashPassword, SAMPLE_PASSWORD } from "./passwords";

const SIGNIN_SLUG = "__signin";

type MemoryShape = {
  companies: Company[];
  accounts: Account[];
  tenants: Record<string, TenantData>;
  signin?: Record<string, string>;
};

export function hydrate(data: Partial<TenantData> | undefined): TenantData {
  const base = emptyTenant();
  if (!data) return base;
  return {
    ...base,
    ...data,
    fields: normalizeDialogFieldsConfig(data.fields ?? base.fields),
    smtp: { ...emptySmtp(), ...(data.smtp || {}) },
    sesFromEmail: data.sesFromEmail || "",
    smsEnabled: Boolean(data.smsEnabled),
    smsSenderId: data.smsSenderId || "",
    mailLog: data.mailLog ?? [],
    accounts: data.accounts?.length ? data.accounts : base.accounts,
    contacts: data.contacts ?? [],
    documents: (data.documents ?? []).map((doc) => ({
      ...doc,
      extra: doc.extra || {},
      lines: (doc.lines || []).map((line) => ({ ...line, extra: line.extra || {} })),
      comments: doc.comments || [],
    })),
    members: data.members ?? [],
    reconciliations: data.reconciliations ?? [],
  };
}

export interface Store {
  listCompanies(): Promise<Company[]>;
  getCompany(slug: string): Promise<Company | null>;
  putCompany(company: Company): Promise<void>;
  getAccount(email: string): Promise<Account | null>;
  putAccount(account: Account): Promise<void>;
  deleteAccount(email: string): Promise<void>;
  listAccounts(): Promise<Account[]>;
  load(slug: string): Promise<TenantData>;
  replaceTenant(slug: string, data: TenantData): Promise<void>;
  getSignIn(): Promise<Record<string, string> | null>;
  putSignIn(copy: Record<string, string>): Promise<void>;
}

function demoAccounts(): Account[] {
  return demoMembers().map((member) => ({
    email: member.email,
    name: member.name,
    passwordHash: hashPassword(SAMPLE_PASSWORD),
    groups: withSuperAdminGroup(member.email, groupsForRole(member.role)),
    companySlug: "harbour",
  }));
}

class MemoryStore implements Store {
  private data: MemoryShape;

  constructor(private readonly file?: string) {
    if (file && existsSync(file)) this.data = JSON.parse(readFileSync(file, "utf8")) as MemoryShape;
    else this.data = { companies: [], accounts: [], tenants: {} };
    if (!this.data.companies.length) {
      this.data.companies = [demoCompany()];
      this.data.accounts = demoAccounts();
      this.data.tenants.harbour = demoTenant();
      this.flush();
    }
  }

  private flush() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  async listCompanies() {
    return this.data.companies;
  }
  async getCompany(slug: string) {
    return this.data.companies.find((company) => company.slug === slug) ?? null;
  }
  async putCompany(company: Company) {
    const index = this.data.companies.findIndex((row) => row.slug === company.slug);
    if (index >= 0) this.data.companies[index] = company;
    else this.data.companies.push(company);
    this.flush();
  }
  async getAccount(email: string) {
    return this.data.accounts.find((account) => account.email === email) ?? null;
  }
  async putAccount(account: Account) {
    const index = this.data.accounts.findIndex((row) => row.email === account.email);
    if (index >= 0) this.data.accounts[index] = account;
    else this.data.accounts.push(account);
    this.flush();
  }
  async deleteAccount(email: string) {
    this.data.accounts = this.data.accounts.filter((account) => account.email !== email);
    this.flush();
  }
  async listAccounts() {
    return [...this.data.accounts];
  }
  async load(slug: string) {
    return hydrate(structuredClone(this.data.tenants[slug] || emptyTenant()));
  }
  async replaceTenant(slug: string, data: TenantData) {
    this.data.tenants[slug] = data;
    this.flush();
  }
  async getSignIn() {
    return this.data.signin ?? null;
  }
  async putSignIn(copy: Record<string, string>) {
    this.data.signin = copy;
    this.flush();
  }
}

class DynamoStore implements Store {
  private readonly doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

  private companies() {
    return process.env.COMPANIES_TABLE_NAME || "accounti-companies";
  }
  private accounts() {
    return process.env.ACCOUNTS_TABLE_NAME || "accounti-accounts";
  }
  private books() {
    return process.env.BOOKS_TABLE_NAME || "accounti-books";
  }

  async listCompanies() {
    const res = await this.doc.send(new ScanCommand({ TableName: this.companies() }));
    return ((res.Items || []) as Company[]).filter((company) => company.slug !== SIGNIN_SLUG);
  }
  async getCompany(slug: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.companies(), Key: { slug } }));
    return (res.Item as Company) || null;
  }
  async putCompany(company: Company) {
    await this.doc.send(new PutCommand({ TableName: this.companies(), Item: company }));
  }
  async getAccount(email: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.accounts(), Key: { email } }));
    return (res.Item as Account) || null;
  }
  async putAccount(account: Account) {
    await this.doc.send(new PutCommand({ TableName: this.accounts(), Item: account }));
  }
  async deleteAccount(email: string) {
    await this.doc.send(new DeleteCommand({ TableName: this.accounts(), Key: { email } }));
  }
  async listAccounts() {
    const res = await this.doc.send(new ScanCommand({ TableName: this.accounts() }));
    return (res.Items || []) as Account[];
  }
  async load(slug: string) {
    const res = await this.doc.send(new GetCommand({ TableName: this.books(), Key: { slug } }));
    return hydrate((res.Item as { tenant?: TenantData } | undefined)?.tenant);
  }
  async replaceTenant(slug: string, data: TenantData) {
    await this.doc.send(new PutCommand({ TableName: this.books(), Item: { slug, tenant: data } }));
  }
  async getSignIn() {
    const res = await this.doc.send(new GetCommand({ TableName: this.companies(), Key: { slug: SIGNIN_SLUG } }));
    const copy = (res.Item as { copy?: Record<string, string> } | undefined)?.copy;
    return copy ?? null;
  }
  async putSignIn(copy: Record<string, string>) {
    await this.doc.send(new PutCommand({ TableName: this.companies(), Item: { slug: SIGNIN_SLUG, copy } }));
  }
}

let cached: Store | null = null;

export function resetStoreForTests(): void {
  cached = null;
}

export function getStore(): Store {
  if (cached) return cached;
  if ((process.env.STORE || "memory") === "dynamo") cached = new DynamoStore();
  else cached = new MemoryStore(process.env.STORE_FILE);
  return cached;
}

async function ensureAccountSpecs(store: Store, specs: Array<Omit<Account, "passwordHash">>): Promise<void> {
  const passwordHash = hashPassword(SAMPLE_PASSWORD);
  for (const spec of specs) {
    const existing = await store.getAccount(spec.email);
    if (!existing) await store.putAccount({ ...spec, passwordHash });
    else if (existing.companySlug !== spec.companySlug) await store.putAccount({ ...existing, ...spec, passwordHash: existing.passwordHash });
  }
}

export async function ensureAutotestTenant(store: Store = getStore()): Promise<void> {
  if (process.env.DEMO_AUTH === "0") return;
  if (!(await store.getCompany(AUTOTEST_COMPANY_SLUG))) await store.putCompany(autotestCompany());
  await ensureAccountSpecs(store, autotestAccountSpecs());
  const tenant = await store.load(AUTOTEST_COMPANY_SLUG);
  if (tenant.members.length === 0) await store.replaceTenant(AUTOTEST_COMPANY_SLUG, autotestTenant());
}

/** Wipe Autotest Lab books and restore the seed roster for a clean browser run. */
export async function resetAutotestTenant(store: Store = getStore()): Promise<void> {
  if (process.env.DEMO_AUTH === "0") throw new Error("E2E reset is only available when DEMO_AUTH is on");
  await store.putCompany(autotestCompany());
  const passwordHash = hashPassword(SAMPLE_PASSWORD);
  const seedEmails = new Set(autotestAccountSpecs().map((spec) => spec.email));
  for (const account of await store.listAccounts()) {
    if (account.companySlug === AUTOTEST_COMPANY_SLUG && !seedEmails.has(account.email)) {
      await store.deleteAccount(account.email);
    }
  }
  for (const spec of autotestAccountSpecs()) {
    await store.putAccount({ ...spec, passwordHash });
  }
  await store.replaceTenant(AUTOTEST_COMPANY_SLUG, autotestTenant());
}

export async function ensureDemo(): Promise<void> {
  if (process.env.DEMO_AUTH === "0") return;
  const store = getStore();
  if (!(await store.getCompany("harbour"))) {
    await store.putCompany(demoCompany());
    await store.replaceTenant("harbour", demoTenant());
    for (const account of demoAccounts()) await store.putAccount(account);
  }
  await ensureAutotestTenant(store);
}
