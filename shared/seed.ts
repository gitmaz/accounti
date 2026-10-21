import { emptyFields } from "./fields";
import type { BookDocument, Company, Contact, LedgerAccount, Member, TenantData } from "./types";

export function emptySmtp() {
  return { host: "", port: 587, username: "", password: "", encryption: "tls" as const, from: "" };
}

export const HARBOUR_ABN = "51824753556";

export function defaultAccounts(): LedgerAccount[] {
  return [
    { id: "acct-bank", code: "1100", name: "Business bank", type: "asset", system: "bank" },
    { id: "acct-ar", code: "1200", name: "Accounts receivable", type: "asset", system: "ar" },
    { id: "acct-gst-in", code: "1300", name: "GST paid", type: "asset", system: "gst-paid" },
    { id: "acct-ap", code: "2100", name: "Accounts payable", type: "liability", system: "ap" },
    { id: "acct-gst-out", code: "2200", name: "GST collected", type: "liability", system: "gst-collected" },
    { id: "acct-payg", code: "2300", name: "PAYG withholding payable", type: "liability" },
    { id: "acct-equity", code: "3000", name: "Owner's equity", type: "equity", system: "equity" },
    { id: "acct-sales", code: "4000", name: "Sales", type: "income", system: "sales" },
    { id: "acct-other", code: "4100", name: "Other income", type: "income" },
    { id: "acct-cogs", code: "5000", name: "Cost of sales", type: "expense" },
    { id: "acct-rent", code: "6100", name: "Rent", type: "expense", system: "expense" },
    { id: "acct-wages", code: "6200", name: "Wages", type: "expense" },
    { id: "acct-general", code: "6900", name: "General expenses", type: "expense" },
  ];
}

export function emptyTenant(): TenantData {
  return {
    fields: emptyFields(),
    smtp: emptySmtp(),
    sesFromEmail: "",
    smsEnabled: false,
    smsSenderId: "",
    mailLog: [],
    approvalEnabled: true,
    accounts: defaultAccounts(),
    contacts: [],
    documents: [],
    members: [],
    reconciliations: [],
  };
}

export function freshCompanyTenant(admin: { id: string; email: string; name: string }): TenantData {
  const tenant = emptyTenant();
  tenant.approvalEnabled = false;
  tenant.members = [{ id: admin.id, email: admin.email, name: admin.name, role: "admin", notify: true }];
  return tenant;
}

export function demoCompany(): Company {
  return {
    slug: "harbour",
    name: "Harbour Office",
    abn: HARBOUR_ABN,
    plan: "free",
    featureSet: "c",
    createdAt: "2026-07-01T00:00:00.000Z",
    subscriberEmail: "admin@accounti.demo",
  };
}

const customer: Contact = {
  id: "contact-wharf",
  name: "Wharf Roasters",
  abn: "53004085616",
  email: "accounts@wharfroasters.example",
  kind: "customer",
  extra: {},
};

const supplier: Contact = {
  id: "contact-lane",
  name: "Lane Realty",
  abn: "51824753556",
  email: "rent@lanerealty.example",
  kind: "supplier",
  extra: {},
};

function line(partial: Partial<BookDocument["lines"][number]>): BookDocument["lines"][number] {
  return {
    id: partial.id || "line",
    accountId: partial.accountId || "acct-sales",
    description: partial.description || "",
    amountExCents: partial.amountExCents || 0,
    gstCode: partial.gstCode || "gst",
    side: partial.side,
    extra: partial.extra || {},
  };
}

export function demoDocuments(): BookDocument[] {
  return [
    {
      id: "doc-inv-1",
      kind: "invoice",
      number: "INV-1001",
      contactId: customer.id,
      date: "2026-08-12",
      dueDate: "2026-08-26",
      reference: "August coffee",
      memo: "Tax invoice for the harbour counter.",
      status: "posted",
      ownerId: "member-book",
      lines: [line({ id: "l1", accountId: "acct-sales", description: "Retail coffee supply", amountExCents: 100000, gstCode: "gst" })],
      extra: {},
      comments: [],
      approverId: "member-approve",
      secondApproverId: "",
      postedAt: "2026-08-12T01:00:00.000Z",
      version: 1,
    },
    {
      id: "doc-bill-1",
      kind: "bill",
      number: "BILL-2001",
      contactId: supplier.id,
      date: "2026-08-01",
      dueDate: "2026-08-14",
      reference: "Shop lease",
      memo: "",
      status: "submitted",
      ownerId: "member-book",
      lines: [line({ id: "l2", accountId: "acct-rent", description: "August rent", amountExCents: 200000, gstCode: "gst" })],
      extra: {},
      comments: [],
      approverId: "member-approve",
      secondApproverId: "member-accountant",
      version: 1,
    },
    {
      id: "doc-jnl-1",
      kind: "journal",
      number: "JNL-3001",
      contactId: "",
      date: "2026-07-02",
      dueDate: "",
      reference: "Opening float",
      memo: "Owner funds the business bank account.",
      status: "posted",
      ownerId: "member-accountant",
      lines: [
        line({ id: "l3", accountId: "acct-bank", description: "Opening bank", amountExCents: 500000, gstCode: "bas-excluded", side: "debit" }),
        line({ id: "l4", accountId: "acct-equity", description: "Owner contribution", amountExCents: 500000, gstCode: "bas-excluded", side: "credit" }),
      ],
      extra: {},
      comments: [],
      approverId: "",
      secondApproverId: "",
      postedAt: "2026-07-02T00:00:00.000Z",
      version: 1,
    },
  ];
}

export function demoMembers(): Member[] {
  return [
    { id: "member-admin", email: "admin@accounti.demo", name: "Harbour Admin", role: "admin", notify: true },
    { id: "member-accountant", email: "accountant@accounti.demo", name: "Alex Accountant", role: "accountant", notify: true },
    { id: "member-approve", email: "approver@accounti.demo", name: "Avery Approver", role: "approver", notify: true },
    { id: "member-book", email: "bookkeeper@accounti.demo", name: "Blair Bookkeeper", role: "bookkeeper", notify: false },
    { id: "member-audit", email: "auditor@accounti.demo", name: "Audra Auditor", role: "auditor", notify: false },
  ];
}

export function demoTenant(): TenantData {
  return {
    ...emptyTenant(),
    approvalEnabled: true,
    contacts: [customer, supplier],
    documents: demoDocuments(),
    members: demoMembers(),
  };
}
