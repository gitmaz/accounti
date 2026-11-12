import { expect, type Locator, type Page } from "@playwright/test";
import { announceAction, announceStage, isNarrating } from "./narrate";

export const COMPANY = "autotest";
export const PASSWORD = "accounti123";
export const COMPANY_NAME = "Autotest Lab";

export const users = {
  admin: { email: "admin@autotest.accounti", name: "Pat Admin" },
  accountant: { email: "accountant@autotest.accounti", name: "Alex Accountant" },
  approver: { email: "approver@autotest.accounti", name: "Avery Approver" },
  bookkeeper: { email: "bookkeeper@autotest.accounti", name: "Blair Bookkeeper" },
  auditor: { email: "auditor@autotest.accounti", name: "Audra Auditor" },
} as const;

export type RoleKey = keyof typeof users;

function apiRoot(): string {
  return (process.env.E2E_API_BASE_URL || process.env.VITE_API_BASE_URL || "http://127.0.0.1:3061").replace(/\/+$/, "");
}

export async function resetAutotestLab(): Promise<void> {
  const res = await fetch(`${apiRoot()}/auth/e2e/reset`, { method: "POST" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not reset Autotest Lab (${res.status}): ${body}`);
  }
}

export async function reveal(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
}

export async function clickNamed(page: Page, target: Locator, label: string): Promise<void> {
  await reveal(target);
  await announceAction(page, `Click “${label}”`);
  await target.click();
}

export async function fillNamed(page: Page, target: Locator, label: string, value: string): Promise<void> {
  const shown = label.toLowerCase().includes("password") ? "••••••••" : value;
  await reveal(target);
  await announceAction(page, `Fill “${label}” with “${shown}”`);
  await target.fill(value);
}

export async function selectNamed(page: Page, target: Locator, label: string, option: string): Promise<void> {
  await reveal(target);
  await announceAction(page, `Select “${option}” in “${label}”`);
  const byLabel = target.locator("option", { hasText: option }).first();
  const value = await byLabel.getAttribute("value");
  if (value) await target.selectOption(value);
  else await target.selectOption({ label: option });
}

export async function signIn(page: Page, role: RoleKey): Promise<void> {
  const user = users[role];
  await announceStage(page, `Sign in as ${user.name} (${role})`);
  await announceAction(page, `Open /${COMPANY}`);
  await page.goto(`/${COMPANY}`);
  await fillNamed(page, page.getByLabel("Email"), "Email", user.email);
  await fillNamed(page, page.getByLabel("Password"), "Password", PASSWORD);
  await clickNamed(page, page.getByRole("button", { name: "Sign in" }), "Sign in");
  await expect(page.getByRole("heading", { name: COMPANY_NAME })).toBeVisible();
  await expect(page.locator(".ac-who")).toContainText(user.name);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await announceStage(page, "Sign out");
  await clickNamed(page, page.getByRole("button", { name: "Sign out" }), "Sign out");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

export async function goToBooks(page: Page): Promise<void> {
  await announceStage(page, "Open Books");
  await clickNamed(page, page.getByRole("navigation").getByRole("link", { name: "Books" }), "Books");
  await expect(page.getByRole("heading", { name: COMPANY_NAME })).toBeVisible();
}

export async function openTab(page: Page, label: "Invoices" | "Bills" | "Journals" | "Contacts"): Promise<void> {
  await clickNamed(page, page.getByRole("tab", { name: label }), label);
}

export async function expectStatus(page: Page, status: string): Promise<void> {
  if (isNarrating()) await announceAction(page, `Expect status “${status}”`);
  await expect(page.locator(".ac-status")).toHaveText(status);
}

export async function createDocument(
  page: Page,
  input: {
    kind: "invoice" | "bill" | "journal";
    contact?: string;
    reference: string;
    description: string;
    amount: string;
    account?: string;
    side?: "Debit" | "Credit";
    secondLine?: { description: string; amount: string; account?: string; side?: "Debit" | "Credit" };
  },
): Promise<string> {
  await announceStage(page, `Create ${input.kind}: ${input.reference}`);
  const tab = input.kind === "invoice" ? "Invoices" : input.kind === "bill" ? "Bills" : "Journals";
  await openTab(page, tab);
  await clickNamed(page, page.getByRole("link", { name: `New ${input.kind}` }), `New ${input.kind}`);
  await expect(page.getByRole("heading", { name: "New document" })).toBeVisible();
  if (input.contact) {
    const contactLabel = input.kind === "invoice" ? "Customer" : "Supplier";
    // Prefer the select labelled Customer/Supplier — not "Supplier invoice" text inputs.
    const contactSelect = page.locator("label").filter({ has: page.locator("select") }).filter({ hasText: contactLabel }).locator("select");
    await selectNamed(page, contactSelect, contactLabel, input.contact);
  }
  const referenceLabel = input.kind === "invoice" ? "Reference" : input.kind === "bill" ? "Supplier invoice" : "Narration";
  await fillNamed(page, page.getByLabel(referenceLabel, { exact: true }), referenceLabel, input.reference);
  const desc = page.getByLabel("Description").first();
  await fillNamed(page, desc, "Description", input.description);
  if (input.account) await selectNamed(page, page.getByLabel("Account").first(), "Account", input.account);
  if (input.side) await selectNamed(page, page.getByLabel("Side").first(), "Side", input.side);
  await fillNamed(page, page.getByLabel("Amount").first(), "Amount", input.amount);
  if (input.secondLine) {
    await clickNamed(page, page.getByRole("button", { name: "Add line" }), "Add line");
    await fillNamed(page, page.getByLabel("Description").nth(1), "Description", input.secondLine.description);
    if (input.secondLine.account) await selectNamed(page, page.getByLabel("Account").nth(1), "Account", input.secondLine.account);
    if (input.secondLine.side) await selectNamed(page, page.getByLabel("Side").nth(1), "Side", input.secondLine.side);
    await fillNamed(page, page.getByLabel("Amount").nth(1), "Amount", input.secondLine.amount);
  }
  await clickNamed(page, page.getByRole("button", { name: "Save" }), "Save");
  await expect(page.getByRole("heading", { name: /^(INV|BILL|JNL)-\d+$/ })).toBeVisible();
  const number = (await page.getByRole("heading", { name: /^(INV|BILL|JNL)-\d+$/ }).textContent())?.trim() || "";
  if (!number) throw new Error("Saved document did not show a number");
  if (isNarrating()) await announceAction(page, `Created ${number}`);
  return number;
}

export { announceAction, announceStage };
