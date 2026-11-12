import { expect, test } from "@playwright/test";
import {
  clickNamed,
  COMPANY_NAME,
  createDocument,
  expectStatus,
  fillNamed,
  goToBooks,
  openTab,
  resetAutotestLab,
  selectNamed,
  signIn,
  signOut,
} from "./helpers";
import { announceAction, announceStage, announceTest, isNarrating } from "./narrate";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }, testInfo) => {
  await resetAutotestLab();
  if (isNarrating()) {
    await page.goto("/autotest");
    await announceTest(page, testInfo.title);
  }
});

test("bookkeeper signs in and sees empty invoices", async ({ page }) => {
  await signIn(page, "bookkeeper");
  await announceStage(page, "Confirm empty invoice list and no Settings");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("link", { name: /^INV-/ })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("create invoice, post, and mark paid", async ({ page }) => {
  await signIn(page, "bookkeeper");
  const number = await createDocument(page, {
    kind: "invoice",
    contact: "Northside Cafe",
    reference: "Counter sale",
    description: "Retail coffee supply",
    amount: "100.00",
    account: "Sales",
  });
  await expectStatus(page, "draft");
  await announceStage(page, "Post the invoice (no approval on invoices)");
  await clickNamed(page, page.getByRole("button", { name: "Post" }), "Post");
  await expectStatus(page, "posted");
  await clickNamed(page, page.getByRole("button", { name: "Mark paid" }), "Mark paid");
  await expectStatus(page, "paid");
  await goToBooks(page);
  await expect(page.getByRole("link", { name: number })).toBeVisible();
});

test("bill needs two-step approval before post", async ({ page }) => {
  await signIn(page, "bookkeeper");
  const number = await createDocument(page, {
    kind: "bill",
    contact: "Office Lane",
    reference: "August rent",
    description: "Office rent",
    amount: "2200.00",
    account: "Rent",
  });
  await announceStage(page, "Submit the bill for approval");
  await clickNamed(page, page.getByRole("button", { name: "Submit" }), "Submit");
  await expectStatus(page, "submitted");

  await signOut(page);
  await signIn(page, "approver");
  await announceStage(page, `First approver opens ${number}`);
  await openTab(page, "Bills");
  await clickNamed(page, page.getByRole("link", { name: number }), number);
  await fillNamed(page, page.getByLabel("Comment"), "Comment", "Looks fine for rent.");
  await clickNamed(page, page.getByRole("button", { name: "Add" }), "Add");
  await expect(page.getByText("Looks fine for rent.", { exact: true })).toBeVisible();
  await clickNamed(page, page.getByRole("button", { name: "Approve" }), "Approve");
  await expectStatus(page, "approved");

  await signOut(page);
  await signIn(page, "accountant");
  await announceStage(page, `Accountant second-approves and posts ${number}`);
  await openTab(page, "Bills");
  await clickNamed(page, page.getByRole("link", { name: number }), number);
  await clickNamed(page, page.getByRole("button", { name: "Approve" }), "Approve");
  await expectStatus(page, "approved");
  await clickNamed(page, page.getByRole("button", { name: "Post" }), "Post");
  await expectStatus(page, "posted");
  await clickNamed(page, page.getByRole("button", { name: "Mark paid" }), "Mark paid");
  await expectStatus(page, "paid");
});

test("journal balances, then approve and post", async ({ page }) => {
  await signIn(page, "accountant");
  const number = await createDocument(page, {
    kind: "journal",
    reference: "Owner draw",
    description: "Bank transfer",
    amount: "500.00",
    account: "Business bank",
    side: "Credit",
    secondLine: {
      description: "Equity offset",
      amount: "500.00",
      account: "Owner's equity",
      side: "Debit",
    },
  });
  await announceStage(page, "Submit journal for approval");
  await clickNamed(page, page.getByRole("button", { name: "Submit" }), "Submit");
  await expectStatus(page, "submitted");

  await signOut(page);
  await signIn(page, "approver");
  await openTab(page, "Journals");
  await clickNamed(page, page.getByRole("link", { name: number }), number);
  await clickNamed(page, page.getByRole("button", { name: "Approve" }), "Approve");

  await signOut(page);
  await signIn(page, "accountant");
  await openTab(page, "Journals");
  await clickNamed(page, page.getByRole("link", { name: number }), number);
  await clickNamed(page, page.getByRole("button", { name: "Approve" }), "Approve");
  await clickNamed(page, page.getByRole("button", { name: "Post" }), "Post");
  await expectStatus(page, "posted");
});

test("bookkeeper adds a contact with a valid ABN", async ({ page }) => {
  await signIn(page, "bookkeeper");
  await openTab(page, "Contacts");
  await announceStage(page, "Add a new customer contact");
  await fillNamed(page, page.getByLabel("Contact name"), "Contact name", "Harbour Roasters");
  await fillNamed(page, page.getByLabel("ABN"), "ABN", "51824753556");
  await fillNamed(page, page.getByLabel("Contact email"), "Contact email", "hello@harbourroasters.example");
  await selectNamed(page, page.getByLabel("Kind"), "Kind", "Customer");
  await clickNamed(page, page.getByRole("button", { name: "Add contact" }), "Add contact");
  await expect(page.getByRole("cell", { name: "Harbour Roasters" })).toBeVisible();
});

test("admin renames a label, adds a field, and saves settings", async ({ page }) => {
  await signIn(page, "admin");
  await announceStage(page, "Open Settings and customise invoice fields");
  await clickNamed(page, page.getByRole("navigation").getByRole("link", { name: "Settings" }), "Settings");
  await expect(page.getByRole("heading", { name: "How the books are labelled" })).toBeVisible();
  await fillNamed(page, page.getByLabel("Label for reference"), "Label for reference", "Job ref");
  await fillNamed(page, page.getByLabel("New field"), "New field", "Cost centre");
  await clickNamed(page, page.getByRole("button", { name: "Add field" }).first(), "Add field");
  await clickNamed(page, page.getByRole("button", { name: "Save settings" }), "Save settings");
  await expect(page.getByText("Saved.")).toBeVisible();

  await goToBooks(page);
  await openTab(page, "Invoices");
  await clickNamed(page, page.getByRole("link", { name: "New invoice" }), "New invoice");
  await expect(page.getByLabel("Job ref")).toBeVisible();
  await expect(page.getByLabel("Cost centre")).toBeVisible();
});

test("admin adds a person and that person can sign in", async ({ page }) => {
  await signIn(page, "admin");
  await announceStage(page, "Add a new bookkeeper in Settings");
  await clickNamed(page, page.getByRole("navigation").getByRole("link", { name: "Settings" }), "Settings");
  await fillNamed(page, page.getByLabel("Person name"), "Person name", "New Bookie");
  await fillNamed(page, page.getByLabel("Person email"), "Person email", "newbook@autotest.accounti");
  await fillNamed(page, page.getByLabel("Person password"), "Person password", "accounti123");
  await selectNamed(page, page.getByLabel("Role"), "Role", "Bookkeeper");
  const created = page.waitForResponse((response) => response.url().includes("/members") && response.request().method() === "POST");
  await clickNamed(page, page.getByRole("button", { name: "Add person" }), "Add person");
  const memberResponse = await created;
  expect(memberResponse.ok(), await memberResponse.text()).toBeTruthy();
  await expect(page.getByRole("cell", { name: "newbook@autotest.accounti" })).toBeVisible();

  await signOut(page);
  await announceStage(page, "Sign in as the new bookkeeper");
  await announceAction(page, "Open /autotest");
  await page.goto("/autotest");
  await fillNamed(page, page.getByLabel("Email"), "Email", "newbook@autotest.accounti");
  await fillNamed(page, page.getByLabel("Password"), "Password", "accounti123");
  await clickNamed(page, page.getByRole("button", { name: "Sign in" }), "Sign in");
  await expect(page.getByRole("heading", { name: COMPANY_NAME })).toBeVisible();
  await expect(page.locator(".ac-who")).toContainText("New Bookie");
});

test("approver and auditor cannot create documents", async ({ page }) => {
  await signIn(page, "approver");
  await announceStage(page, "Confirm approver cannot create or open Settings");
  await expect(page.getByRole("link", { name: "New invoice" })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" })).toHaveCount(0);

  await signOut(page);
  await signIn(page, "auditor");
  await announceStage(page, "Confirm auditor is read-only");
  await expect(page.getByRole("link", { name: "New invoice" })).toHaveCount(0);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" })).toHaveCount(0);
});

test("search finds a posted invoice and reports open", async ({ page }) => {
  await signIn(page, "bookkeeper");
  const number = await createDocument(page, {
    kind: "invoice",
    contact: "Northside Cafe",
    reference: "Searchable sale",
    description: "Beans",
    amount: "55.00",
    account: "Sales",
  });
  await clickNamed(page, page.getByRole("button", { name: "Post" }), "Post");
  await goToBooks(page);
  await announceStage(page, `Search for ${number}`);
  await fillNamed(page, page.getByLabel("Search"), "Search", number);
  await expect(page.getByRole("link", { name: number })).toBeVisible();
  await expect(page.getByRole("cell", { name: "posted" })).toBeVisible();

  await announceStage(page, "Open Reports");
  await clickNamed(page, page.getByRole("navigation").getByRole("link", { name: "Reports" }), "Reports");
  await expect(page.getByRole("heading", { name: "Profit, position, and BAS" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Profit and loss/ })).toBeVisible();
});
