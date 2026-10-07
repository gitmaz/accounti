import { randomUUID } from "crypto";

import { canApprove, canDraft, canManageBooks, canPost, isRole } from "../../shared/access";
import { accountiHas } from "../../shared/accounti-features";
import type { FeatureSetId } from "../../shared/featureset";
import { isValidAbn, journalBalances } from "../../shared/ledger";
import type { BookDocument, DocKind, DocLine, GstCode, Member, Role, TenantData } from "../../shared/types";
import { sendMail } from "./mail";

const GST: GstCode[] = ["gst", "gst-free", "input-taxed", "bas-excluded"];

export function memberFor(tenant: TenantData, email: string): Member | null {
  return tenant.members.find((member) => member.email.toLowerCase() === email.toLowerCase()) ?? null;
}

export function roleOf(member: Member | null, groups: string[]): Role {
  if (member) return member.role;
  if (groups.includes("admins") || groups.includes("super-admins")) return "admin";
  if (groups.includes("accountants")) return "accountant";
  if (groups.includes("approvers")) return "approver";
  if (groups.includes("auditors")) return "auditor";
  return "bookkeeper";
}

function approvalOn(tenant: TenantData, set: FeatureSetId): boolean {
  return accountiHas(set, "approval") && tenant.approvalEnabled;
}

function fullyApproved(doc: BookDocument, set: FeatureSetId): boolean {
  if (!doc.approvedBy1) return false;
  if (accountiHas(set, "secondApproval") && doc.secondApproverId && !doc.approvedBy2) return false;
  return true;
}

export function nextNumber(tenant: TenantData, kind: DocKind): string {
  const prefix = kind === "invoice" ? "INV" : kind === "bill" ? "BILL" : "JNL";
  const nums = tenant.documents
    .filter((doc) => doc.kind === kind)
    .map((doc) => Number(doc.number.split("-")[1] || 0))
    .filter((value) => Number.isFinite(value));
  const next = (nums.length ? Math.max(...nums) : kind === "invoice" ? 1000 : kind === "bill" ? 2000 : 3000) + 1;
  return `${prefix}-${next}`;
}

function cleanLine(raw: Record<string, unknown>, kind: DocKind): DocLine | { error: string } {
  const amount = Math.round(Number(raw.amountExCents ?? raw.amountEx ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Each line needs an amount" };
  const gstCode = GST.includes(raw.gstCode as GstCode) ? (raw.gstCode as GstCode) : "gst";
  const side = raw.side === "credit" ? "credit" : "debit";
  return {
    id: String(raw.id || `line-${randomUUID().slice(0, 8)}`),
    accountId: String(raw.accountId || ""),
    description: String(raw.description || "").trim(),
    amountExCents: amount,
    gstCode: kind === "journal" ? "bas-excluded" : gstCode,
    side: kind === "journal" ? side : undefined,
    extra: extraMap(raw.extra),
  };
}

function extraMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) out[key] = String(value ?? "");
  return out;
}

export function parseDocument(body: Record<string, unknown>, current: BookDocument | null, tenant: TenantData): BookDocument | { error: string } {
  const kind = (body.kind || current?.kind) as DocKind;
  if (kind !== "invoice" && kind !== "bill" && kind !== "journal") return { error: "Choose an invoice, bill, or journal" };
  const linesRaw = Array.isArray(body.lines) ? body.lines : current?.lines || [];
  const lines: DocLine[] = [];
  for (const item of linesRaw) {
    if (!item || typeof item !== "object") continue;
    const line = cleanLine(item as Record<string, unknown>, kind);
    if ("error" in line) return line;
    if (!tenant.accounts.some((account) => account.id === line.accountId)) return { error: "Choose an account on every line" };
    lines.push(line);
  }
  if (!lines.length) return { error: "Add at least one line" };
  const draft: BookDocument = {
    id: current?.id || `doc-${randomUUID().slice(0, 8)}`,
    kind,
    number: current?.number || nextNumber(tenant, kind),
    contactId: String(body.contactId ?? current?.contactId ?? ""),
    date: String(body.date || current?.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    dueDate: String(body.dueDate ?? current?.dueDate ?? "").slice(0, 10),
    reference: String(body.reference ?? current?.reference ?? "").trim(),
    memo: String(body.memo ?? current?.memo ?? "").trim(),
    status: current?.status || "draft",
    ownerId: current?.ownerId || "",
    lines,
    extra: extraMap(body.extra ?? current?.extra),
    comments: current?.comments || [],
    approverId: String(body.approverId ?? current?.approverId ?? ""),
    secondApproverId: String(body.secondApproverId ?? current?.secondApproverId ?? ""),
    approvedBy1: current?.approvedBy1,
    approvedAt1: current?.approvedAt1,
    approvedBy2: current?.approvedBy2,
    approvedAt2: current?.approvedAt2,
    postedAt: current?.postedAt,
    paidAt: current?.paidAt,
    bankAccountId: current?.bankAccountId,
    version: current?.version || 1,
  };
  if (kind !== "journal" && !draft.contactId) return { error: kind === "invoice" ? "Choose a customer" : "Choose a supplier" };
  if (kind !== "journal" && draft.contactId && !tenant.contacts.some((contact) => contact.id === draft.contactId)) {
    return { error: "That contact is not in the books" };
  }
  if (kind === "journal" && !journalBalances(draft)) return { error: "A journal has to balance" };
  if (kind === "bill") {
    const contact = tenant.contacts.find((row) => row.id === draft.contactId);
    const claimsGst = draft.lines.some((line) => line.gstCode === "gst");
    if (claimsGst && contact && contact.abn && !isValidAbn(contact.abn)) return { error: "The supplier ABN does not look valid" };
  }
  return draft;
}

export async function transitionDocument(
  tenant: TenantData,
  doc: BookDocument,
  action: string,
  actor: Member,
  set: FeatureSetId,
): Promise<BookDocument | { error: string }> {
  const now = new Date().toISOString();
  const next = { ...doc, version: doc.version + 1 };
  const needsApproval = approvalOn(tenant, set) && doc.kind !== "invoice";

  if (action === "submit") {
    if (!canDraft(actor.role)) return { error: "You cannot submit this" };
    if (doc.status !== "draft" && doc.status !== "rejected") return { error: "Only a draft can be submitted" };
    if (!needsApproval) return { error: "Approval is off, so post this instead" };
    next.status = "submitted";
    next.approvedBy1 = undefined;
    next.approvedAt1 = undefined;
    next.approvedBy2 = undefined;
    next.approvedAt2 = undefined;
  } else if (action === "approve") {
    if (!canApprove(actor.role)) return { error: "You cannot approve this" };
    if (!needsApproval) return { error: "Approval is off for this company" };
    if (doc.status !== "submitted" && doc.status !== "approved") return { error: "This is not waiting for approval" };
    if (!doc.approvedBy1) {
      if (doc.approverId && actor.id !== doc.approverId && actor.role === "approver") return { error: "Another approver is named on this document" };
      next.approvedBy1 = actor.id;
      next.approvedAt1 = now;
      next.status = accountiHas(set, "secondApproval") && doc.secondApproverId ? "approved" : "approved";
    } else if (accountiHas(set, "secondApproval") && doc.secondApproverId && !doc.approvedBy2) {
      if (actor.id === doc.approvedBy1) return { error: "The second approval has to be a different person" };
      if (actor.id !== doc.secondApproverId && actor.role === "approver") return { error: "The second approver is named on this document" };
      next.approvedBy2 = actor.id;
      next.approvedAt2 = now;
      next.status = "approved";
    } else return { error: "This is already approved" };
  } else if (action === "reject") {
    if (!canApprove(actor.role)) return { error: "You cannot reject this" };
    if (doc.status !== "submitted" && doc.status !== "approved") return { error: "This is not waiting for approval" };
    next.status = "rejected";
  } else if (action === "withdraw") {
    if (actor.id !== doc.ownerId && !canManageBooks(actor.role)) return { error: "You cannot withdraw this" };
    if (doc.status === "posted" || doc.status === "paid") return { error: "A posted document stays in the books" };
    next.status = "draft";
  } else if (action === "post") {
    const bookkeeperMayPost = !needsApproval && canDraft(actor.role);
    if (!canPost(actor.role) && !bookkeeperMayPost) return { error: "An accountant posts to the books" };
    if (doc.status === "posted" || doc.status === "paid") return { error: "This is already posted" };
    if (needsApproval && !fullyApproved(doc, set)) return { error: "Approve this before it is posted" };
    if (!needsApproval && doc.status !== "draft" && doc.status !== "approved" && doc.status !== "submitted") {
      return { error: "This cannot be posted" };
    }
    next.status = "posted";
    next.postedAt = now;
  } else if (action === "pay") {
    if (!canPost(actor.role) && !canDraft(actor.role)) return { error: "You cannot mark this paid" };
    if (doc.kind === "journal") return { error: "Journals are not paid" };
    if (doc.status !== "posted") return { error: "Post it before marking it paid" };
    next.status = "paid";
    next.paidAt = now;
  } else return { error: "Unknown action" };

  if (accountiHas(set, "comments") && (action === "submit" || action === "approve" || action === "reject")) {
    await notify(tenant, next, actor, action);
  }
  return next;
}

async function notify(tenant: TenantData, doc: BookDocument, actor: Member, action: string) {
  const targets = tenant.members.filter((member) => member.notify && member.email !== actor.email);
  const subject = `Accounti ${doc.number} ${action}`;
  const body = `${actor.name} ${action} ${doc.kind} ${doc.number}.`;
  for (const member of targets) {
    const result = await sendMail(tenant.smtp, { to: member.email, subject, text: body });
    tenant.mailLog.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      to: member.email,
      subject,
      body,
      sent: result.sent,
    });
  }
}

export function parseContact(body: Record<string, unknown>, currentId?: string) {
  const name = String(body.name || "").trim();
  if (!name) return { error: "A contact needs a name" } as const;
  const abn = String(body.abn || "").replace(/\s/g, "");
  if (abn && !isValidAbn(abn)) return { error: "That ABN is not valid" } as const;
  const kind = body.kind === "supplier" || body.kind === "both" ? body.kind : "customer";
  return {
    id: currentId || `contact-${randomUUID().slice(0, 8)}`,
    name,
    abn,
    email: String(body.email || "").trim().toLowerCase(),
    kind,
    extra: extraMap(body.extra),
  } as const;
}

export function parseAccount(body: Record<string, unknown>, currentId?: string) {
  const name = String(body.name || "").trim();
  const code = String(body.code || "").trim();
  const type = body.type;
  if (!name || !code) return { error: "An account needs a code and a name" } as const;
  if (type !== "asset" && type !== "liability" && type !== "equity" && type !== "income" && type !== "expense") {
    return { error: "Choose an account type" } as const;
  }
  return { id: currentId || `acct-${randomUUID().slice(0, 8)}`, code, name, type } as const;
}

export { isRole };
