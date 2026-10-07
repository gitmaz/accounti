import { enabledFeatureIds, hasFeature, normalizeFeatureSet, type FeatureSetId, type ProductFeature } from "./featureset";

/**
 * A keeps the day book. B adds GST reports and print. C adds approval,
 * a second approver, bank reconciliation, comments, and email.
 */
export const ACCOUNTI_FEATURES = [
  { id: "books", label: "Chart of accounts, contacts, and an ABN check", sets: ["a", "b", "c"] },
  { id: "documents", label: "Tax invoices, bills, and journals", sets: ["a", "b", "c"] },
  { id: "gst", label: "GST on each line", sets: ["a", "b", "c"] },
  { id: "reports", label: "BAS worksheet, profit and loss, and balance sheet", sets: ["b", "c"] },
  { id: "print", label: "Print a tax invoice", sets: ["b", "c"] },
  { id: "approval", label: "Optional approval before posting", sets: ["c"] },
  { id: "secondApproval", label: "Second approver", sets: ["c"] },
  { id: "reconcile", label: "Bank reconciliation", sets: ["c"] },
  { id: "comments", label: "Comments and approval email", sets: ["c"] },
] as const satisfies readonly ProductFeature[];

export type AccountiFeatureId = (typeof ACCOUNTI_FEATURES)[number]["id"];

export function accountiHas(set: FeatureSetId, id: AccountiFeatureId): boolean {
  return hasFeature(ACCOUNTI_FEATURES, set, id);
}

export function accountiFeatures(set: FeatureSetId): AccountiFeatureId[] {
  return enabledFeatureIds(ACCOUNTI_FEATURES, set) as AccountiFeatureId[];
}

export function companyFeatureSet(company: { featureSet?: string } | null | undefined): FeatureSetId {
  if (!company?.featureSet) return "c";
  return normalizeFeatureSet(company.featureSet, "c");
}
