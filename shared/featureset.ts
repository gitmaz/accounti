/**
 * Feature sets for a SaaS product. A is the smallest set and C is the most
 * advanced. A feature lists the sets that include it.
 */
export const FEATURE_SETS = ["a", "b", "c"] as const;
export type FeatureSetId = (typeof FEATURE_SETS)[number];

export type ProductFeature = {
  id: string;
  label: string;
  sets: readonly FeatureSetId[];
};

export function featureSetFromBundle(bundle: unknown): FeatureSetId {
  const value = Number(bundle);
  if (value === 2) return "b";
  if (Number.isFinite(value) && value >= 3) return "c";
  return "a";
}

export function normalizeFeatureSet(value: unknown, fallback: FeatureSetId = "c"): FeatureSetId {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "a" || raw === "1" || raw === "simple") return "a";
  if (raw === "b" || raw === "2" || raw === "plus") return "b";
  if (raw === "c" || raw === "3" || raw === "pro") return "c";
  return fallback;
}

export function hasFeature(features: readonly ProductFeature[], set: FeatureSetId, id: string): boolean {
  return features.some((feature) => feature.id === id && feature.sets.includes(set));
}

export function enabledFeatureIds(features: readonly ProductFeature[], set: FeatureSetId): string[] {
  return features.filter((feature) => feature.sets.includes(set)).map((feature) => feature.id);
}
