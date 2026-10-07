import { describe, expect, it } from "vitest";

import { accountiFeatures, accountiHas } from "../shared/accounti-features";
import { isValidAbn } from "../shared/ledger";
import { basWorksheet, journalBalances, profitAndLoss } from "../shared/ledger";
import { demoTenant } from "../shared/seed";

describe("Australian books", () => {
  it("checks an ABN", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("51 824 753 555")).toBe(false);
  });

  it("keeps a balanced journal and builds BAS and profit", () => {
    const tenant = demoTenant();
    const journal = tenant.documents.find((doc) => doc.kind === "journal");
    expect(journal && journalBalances(journal)).toBe(true);
    const bas = basWorksheet(tenant, "2026-07-01", "2026-09-30");
    expect(bas.g1).toBe(110000);
    expect(bas.gstOnSales).toBe(10000);
    expect(bas.gstOnPurchases).toBe(0);
    const pnl = profitAndLoss(tenant, "2026-10-06");
    expect(pnl.incomeTotal).toBe(100000);
    expect(pnl.profit).toBe(100000);
  });

  it("assigns reports and approval to the higher feature sets", () => {
    expect(accountiHas("a", "documents")).toBe(true);
    expect(accountiHas("a", "reports")).toBe(false);
    expect(accountiHas("b", "reports")).toBe(true);
    expect(accountiHas("b", "approval")).toBe(false);
    expect(accountiFeatures("c")).toContain("reconcile");
  });
});
