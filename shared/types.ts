export type Role = "admin" | "accountant" | "approver" | "bookkeeper" | "auditor";

export type GstCode = "gst" | "gst-free" | "input-taxed" | "bas-excluded";

export type DocKind = "invoice" | "bill" | "journal";

export type DocStatus = "draft" | "submitted" | "approved" | "posted" | "paid" | "rejected";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type SystemAccount = "bank" | "ar" | "ap" | "gst-collected" | "gst-paid" | "equity" | "sales" | "expense";

export type Company = {
  slug: string;
  name: string;
  abn: string;
  plan: "free" | "monthly";
  createdAt: string;
  subscriberEmail: string;
  trialExpiresAt?: string;
  language?: string;
  featureSet?: "a" | "b" | "c";
};

/** One email can sign in to several companies. Each company keeps its own password. */
export type CompanyLogin = {
  companySlug: string;
  passwordHash: string;
  groups: string[];
  name: string;
};

export type Account = {
  email: string;
  name: string;
  passwordHash: string;
  groups: string[];
  companySlug: string;
  /** Further companies for this email. The fields above stay the first company. */
  logins?: CompanyLogin[];
};

export type SessionUser = {
  email: string;
  name: string;
  groups: string[];
  companySlug: string;
};

export type FieldOverride = { key: string; label: string; hidden: boolean };
export type ExtraFieldDef = { id: string; label: string };
export type DialogFieldConfig = { fields: FieldOverride[]; extra: ExtraFieldDef[] };
export type DialogFieldsConfig = {
  invoice: DialogFieldConfig;
  bill: DialogFieldConfig;
  journal: DialogFieldConfig;
  contact: DialogFieldConfig;
  line: DialogFieldConfig;
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  system?: SystemAccount;
};

export type Contact = {
  id: string;
  name: string;
  abn: string;
  email: string;
  kind: "customer" | "supplier" | "both";
  extra: Record<string, string>;
};

export type DocLine = {
  id: string;
  accountId: string;
  description: string;
  amountExCents: number;
  gstCode: GstCode;
  /** Journals name the side. Invoices and bills infer it. */
  side?: "debit" | "credit";
  extra: Record<string, string>;
};

export type Comment = {
  id: string;
  at: string;
  memberId: string;
  text: string;
};

export type BookDocument = {
  id: string;
  kind: DocKind;
  number: string;
  contactId: string;
  date: string;
  dueDate: string;
  reference: string;
  memo: string;
  status: DocStatus;
  ownerId: string;
  lines: DocLine[];
  extra: Record<string, string>;
  comments: Comment[];
  approverId: string;
  secondApproverId: string;
  approvedBy1?: string;
  approvedAt1?: string;
  approvedBy2?: string;
  approvedAt2?: string;
  postedAt?: string;
  paidAt?: string;
  bankAccountId?: string;
  version: number;
};

export type Member = {
  id: string;
  email: string;
  name: string;
  role: Role;
  notify: boolean;
};

export type Reconciliation = {
  id: string;
  bankAccountId: string;
  statementDate: string;
  closingCents: number;
  matchedIds: string[];
};

export type SmtpSettings = {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: "" | "tls" | "ssl";
  from: string;
};

export type MailNote = {
  id: string;
  at: string;
  to: string;
  subject: string;
  body: string;
  sent: boolean;
};

export type TenantData = {
  fields: DialogFieldsConfig;
  smtp: SmtpSettings;
  /** Amazon SES from address. Super-admin only. */
  sesFromEmail: string;
  /** Saved even when this product does not send texts yet. */
  smsEnabled: boolean;
  smsSenderId: string;
  mailLog: MailNote[];
  approvalEnabled: boolean;
  accounts: LedgerAccount[];
  contacts: Contact[];
  documents: BookDocument[];
  members: Member[];
  reconciliations: Reconciliation[];
};
