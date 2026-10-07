import type { BookDocument, Company, Contact, DialogFieldsConfig, LedgerAccount, Member, Reconciliation, Role, SmtpSettings } from "@shared/types";

export type SessionUser = { email: string; name: string; groups: string[]; companySlug: string };
export type Session = { token: string; user: SessionUser };

const KEY = "accounti.session";

export function loadSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (!session) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(session));
}

export type Workspace = {
  company: Company & { featureSet: "a" | "b" | "c" };
  role: Role;
  features: string[];
  smtpAccess: boolean;
  smtp: SmtpSettings;
  approvalEnabled: boolean;
  fields: DialogFieldsConfig;
  accounts: LedgerAccount[];
  contacts: Contact[];
  documents: BookDocument[];
  members: Member[];
  reconciliations: Reconciliation[];
  mailLog: { id: string; to: string; subject: string; sent: boolean }[];
};

export type Reports = {
  profitAndLoss: { yearLabel: string; income: { account: LedgerAccount; cents: number }[]; expenses: { account: LedgerAccount; cents: number }[]; incomeTotal: number; expenseTotal: number; profit: number };
  balanceSheet: { to: string; assets: { account: LedgerAccount; cents: number }[]; liabilities: { account: LedgerAccount; cents: number }[]; equity: { account: LedgerAccount; cents: number }[]; currentEarnings: number; assetTotal: number; liabilityTotal: number; equityTotal: number };
  bas: { from: string; to: string; g1: number; gstOnSales: number; gstOnPurchases: number; netGst: number; missingSupplierAbn: number };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = loadSession()?.token;
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || "/api"}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  login: (email: string, password: string) => request<{ token: string; user: SessionUser }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  activate: (body: Record<string, string>) => request<{ ok: boolean; company: { slug: string; name: string } }>("/auth/activate", { method: "POST", body: JSON.stringify(body) }),
  workspace: (slug: string) => request<Workspace>(`/${slug}/workspace`),
  saveWorkspace: (slug: string, body: unknown) => request<Workspace>(`/${slug}/workspace`, { method: "PUT", body: JSON.stringify(body) }),
  saveContact: (slug: string, body: unknown, id?: string) => request<{ contact: Contact }>(id ? `/${slug}/contacts/${id}` : `/${slug}/contacts`, { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
  saveAccount: (slug: string, body: unknown) => request<{ account: LedgerAccount }>(`/${slug}/accounts`, { method: "POST", body: JSON.stringify(body) }),
  saveDocument: (slug: string, body: unknown, id?: string) => request<{ document: BookDocument }>(id ? `/${slug}/documents/${id}` : `/${slug}/documents`, { method: id ? "PUT" : "POST", body: JSON.stringify(body) }),
  transition: (slug: string, id: string, action: string) => request<{ document: BookDocument }>(`/${slug}/documents/${id}/transition`, { method: "POST", body: JSON.stringify({ action }) }),
  comment: (slug: string, id: string, text: string) => request<{ document: BookDocument }>(`/${slug}/documents/${id}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  reports: (slug: string, on: string, from: string, to: string) => request<Reports>(`/${slug}/reports?on=${on}&from=${from}&to=${to}`),
  reconcile: (slug: string, accountId: string) => request<{ lines: { id: string; date: string; label: string; cents: number }[] }>(`/${slug}/reconcile?accountId=${encodeURIComponent(accountId)}`),
  saveReconcile: (slug: string, body: unknown) => request<{ difference: { book: number; ticked: number; difference: number } }>(`/${slug}/reconcile`, { method: "PUT", body: JSON.stringify(body) }),
  addMember: (slug: string, body: unknown) => request<{ member: Member }>(`/${slug}/members`, { method: "POST", body: JSON.stringify(body) }),
};

export function aud(cents: number): string {
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function centsFromDollars(raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}
