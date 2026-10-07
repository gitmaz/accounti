import type { BookDocument, DocLine, GstCode, LedgerAccount, Reconciliation, TenantData } from "./types";

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Australian Business Number checksum. */
export function isValidAbn(raw: string): boolean {
  const digits = digitsOnly(raw);
  if (digits.length !== 11) return false;
  const nums = digits.split("").map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((total, digit, index) => total + digit * ABN_WEIGHTS[index], 0);
  return sum % 89 === 0;
}

export function formatAbn(raw: string): string {
  const digits = digitsOnly(raw).slice(0, 11);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8), digits.slice(8, 11)].filter(Boolean).join(" ");
}

export function gstCents(amountExCents: number, code: GstCode): number {
  if (code !== "gst") return 0;
  return Math.round(amountExCents * 10 / 100);
}

export function lineGst(line: DocLine): number {
  return gstCents(Math.abs(line.amountExCents), line.gstCode);
}

export function lineGross(line: DocLine): number {
  return Math.abs(line.amountExCents) + lineGst(line);
}

export function documentTotals(doc: Pick<BookDocument, "kind" | "lines">): { ex: number; gst: number; gross: number } {
  if (doc.kind === "journal") {
    const debit = doc.lines.filter((line) => line.side !== "credit").reduce((sum, line) => sum + Math.abs(line.amountExCents), 0);
    const credit = doc.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + Math.abs(line.amountExCents), 0);
    return { ex: debit, gst: 0, gross: credit };
  }
  const ex = doc.lines.reduce((sum, line) => sum + Math.abs(line.amountExCents), 0);
  const gst = doc.lines.reduce((sum, line) => sum + lineGst(line), 0);
  return { ex, gst, gross: ex + gst };
}

export function journalBalances(doc: Pick<BookDocument, "lines">): boolean {
  const debit = doc.lines.filter((line) => line.side !== "credit").reduce((sum, line) => sum + Math.abs(line.amountExCents), 0);
  const credit = doc.lines.filter((line) => line.side === "credit").reduce((sum, line) => sum + Math.abs(line.amountExCents), 0);
  return debit > 0 && debit === credit;
}

/** Australian financial year containing the date. Starts 1 July. */
export function financialYear(date: string): { from: string; to: string; label: string } {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return { from: `${startYear}-07-01`, to: `${startYear + 1}-06-30`, label: `${startYear}–${startYear + 1}` };
}

export function inRange(date: string, from: string, to: string): boolean {
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}

export type AccountBalance = { account: LedgerAccount; cents: number };

function signed(account: LedgerAccount, debit: number, credit: number): number {
  const debitNatural = account.type === "asset" || account.type === "expense";
  return debitNatural ? debit - credit : credit - debit;
}

/** Posted activity. Invoices and bills hit AR/AP and GST. Paid documents also hit the bank. */
export function movements(tenant: TenantData, from?: string, to?: string): Map<string, { debit: number; credit: number }> {
  const totals = new Map<string, { debit: number; credit: number }>();
  const add = (accountId: string, debit: number, credit: number) => {
    if (!accountId || (debit === 0 && credit === 0)) return;
    const current = totals.get(accountId) || { debit: 0, credit: 0 };
    current.debit += debit;
    current.credit += credit;
    totals.set(accountId, current);
  };
  const bank = tenant.accounts.find((account) => account.system === "bank");
  const ar = tenant.accounts.find((account) => account.system === "ar");
  const ap = tenant.accounts.find((account) => account.system === "ap");
  const gstOut = tenant.accounts.find((account) => account.system === "gst-collected");
  const gstIn = tenant.accounts.find((account) => account.system === "gst-paid");

  for (const doc of tenant.documents) {
    if (doc.status !== "posted" && doc.status !== "paid") continue;
    if (from && to && !inRange(doc.date, from, to)) continue;
    if (doc.kind === "journal") {
      for (const line of doc.lines) {
        const amount = Math.abs(line.amountExCents);
        if (line.side === "credit") add(line.accountId, 0, amount);
        else add(line.accountId, amount, 0);
      }
      continue;
    }
    const totalsForDoc = documentTotals(doc);
    if (doc.kind === "invoice" && ar && gstOut) {
      add(ar.id, totalsForDoc.gross, 0);
      add(gstOut.id, 0, totalsForDoc.gst);
      for (const line of doc.lines) add(line.accountId, 0, Math.abs(line.amountExCents));
      if (doc.status === "paid" && bank) {
        add(bank.id, totalsForDoc.gross, 0);
        add(ar.id, 0, totalsForDoc.gross);
      }
    }
    if (doc.kind === "bill" && ap && gstIn) {
      add(ap.id, 0, totalsForDoc.gross);
      add(gstIn.id, totalsForDoc.gst, 0);
      for (const line of doc.lines) add(line.accountId, Math.abs(line.amountExCents), 0);
      if (doc.status === "paid" && bank) {
        add(ap.id, totalsForDoc.gross, 0);
        add(bank.id, 0, totalsForDoc.gross);
      }
    }
  }
  return totals;
}

export function balances(tenant: TenantData, from?: string, to?: string): AccountBalance[] {
  const activity = movements(tenant, from, to);
  return tenant.accounts.map((account) => {
    const row = activity.get(account.id) || { debit: 0, credit: 0 };
    return { account, cents: signed(account, row.debit, row.credit) };
  });
}

export type ProfitAndLoss = {
  from: string;
  to: string;
  yearLabel: string;
  income: AccountBalance[];
  expenses: AccountBalance[];
  incomeTotal: number;
  expenseTotal: number;
  profit: number;
};

export function profitAndLoss(tenant: TenantData, on: string): ProfitAndLoss {
  const year = financialYear(on);
  const rows = balances(tenant, year.from, year.to);
  const income = rows.filter((row) => row.account.type === "income" && row.cents !== 0);
  const expenses = rows.filter((row) => row.account.type === "expense" && row.cents !== 0);
  const incomeTotal = income.reduce((sum, row) => sum + row.cents, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.cents, 0);
  return { ...year, yearLabel: year.label, income, expenses, incomeTotal, expenseTotal, profit: incomeTotal - expenseTotal };
}

export type BalanceSheet = {
  to: string;
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  currentEarnings: number;
  assetTotal: number;
  liabilityTotal: number;
  equityTotal: number;
};

export function balanceSheet(tenant: TenantData, on: string): BalanceSheet {
  const rows = balances(tenant, "1970-01-01", on.slice(0, 10));
  const assets = rows.filter((row) => row.account.type === "asset" && row.cents !== 0);
  const liabilities = rows.filter((row) => row.account.type === "liability" && row.cents !== 0);
  const equity = rows.filter((row) => row.account.type === "equity" && row.cents !== 0);
  const earnings = profitAndLoss(tenant, on);
  const assetTotal = assets.reduce((sum, row) => sum + row.cents, 0);
  const liabilityTotal = liabilities.reduce((sum, row) => sum + row.cents, 0);
  const equityTotal = equity.reduce((sum, row) => sum + row.cents, 0) + earnings.profit;
  return { to: on.slice(0, 10), assets, liabilities, equity, currentEarnings: earnings.profit, assetTotal, liabilityTotal, equityTotal };
}

export type BasWorksheet = {
  from: string;
  to: string;
  g1: number;
  gstOnSales: number;
  gstOnPurchases: number;
  netGst: number;
  missingSupplierAbn: number;
};

/** Activity statement figures for a date range. G1 is GST and GST-free sales, including GST. */
export function basWorksheet(tenant: TenantData, from: string, to: string): BasWorksheet {
  let g1 = 0;
  let gstOnSales = 0;
  let gstOnPurchases = 0;
  let missingSupplierAbn = 0;
  for (const doc of tenant.documents) {
    if (doc.status !== "posted" && doc.status !== "paid") continue;
    if (!inRange(doc.date, from, to)) continue;
    if (doc.kind === "invoice") {
      for (const line of doc.lines) {
        if (line.gstCode === "gst" || line.gstCode === "gst-free") g1 += lineGross(line);
        gstOnSales += lineGst(line);
      }
    }
    if (doc.kind === "bill") {
      const contact = tenant.contacts.find((row) => row.id === doc.contactId);
      const hasGst = doc.lines.some((line) => line.gstCode === "gst");
      if (hasGst && !isValidAbn(contact?.abn || "")) missingSupplierAbn += 1;
      for (const line of doc.lines) gstOnPurchases += lineGst(line);
    }
  }
  return { from, to, g1, gstOnSales, gstOnPurchases, netGst: gstOnSales - gstOnPurchases, missingSupplierAbn };
}

export type BankLine = { id: string; date: string; label: string; cents: number };

export function bankLines(tenant: TenantData, bankAccountId: string): BankLine[] {
  const lines: BankLine[] = [];
  for (const doc of tenant.documents) {
    if (doc.kind === "journal" && (doc.status === "posted" || doc.status === "paid")) {
      for (const line of doc.lines) {
        if (line.accountId !== bankAccountId) continue;
        const amount = Math.abs(line.amountExCents);
        lines.push({
          id: `${doc.id}:${line.id}`,
          date: doc.date,
          label: `${doc.number} ${doc.reference || line.description}`.trim(),
          cents: line.side === "credit" ? -amount : amount,
        });
      }
    }
    if ((doc.kind === "invoice" || doc.kind === "bill") && doc.status === "paid") {
      const gross = documentTotals(doc).gross;
      lines.push({
        id: doc.id,
        date: doc.paidAt || doc.date,
        label: `${doc.number} ${doc.reference}`.trim(),
        cents: doc.kind === "invoice" ? gross : -gross,
      });
    }
  }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

export function reconciliationDifference(tenant: TenantData, rec: Reconciliation): { book: number; ticked: number; difference: number } {
  const lines = bankLines(tenant, rec.bankAccountId);
  const book = lines.reduce((sum, line) => sum + line.cents, 0);
  const ticked = lines.filter((line) => rec.matchedIds.includes(line.id)).reduce((sum, line) => sum + line.cents, 0);
  return { book, ticked, difference: rec.closingCents - ticked };
}

export function aud(cents: number): string {
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}
