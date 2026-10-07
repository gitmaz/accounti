import type { Construct } from "constructs";

export type SpaHostingMode = "cloudfront" | "none";

const VALID = new Set<SpaHostingMode>(["cloudfront", "none"]);

export function resolveSpaHosting(scope: Construct): SpaHostingMode {
  const ctx = (scope.node.tryGetContext("spaHosting") as string | undefined)?.trim().toLowerCase();
  const env = process.env.SPA_HOSTING?.trim().toLowerCase();
  const raw = ctx || env || "none";
  const mode = raw === "skip" ? "none" : raw;
  if (!VALID.has(mode as SpaHostingMode)) {
    throw new Error(`Invalid SPA_HOSTING / spaHosting "${mode}". Use: cloudfront | none`);
  }
  return mode as SpaHostingMode;
}

function parseFlag(raw: unknown): boolean | undefined {
  if (raw === false || raw === "false" || raw === "0") return false;
  if (raw === true || raw === "true" || raw === "1") return true;
  return undefined;
}

export function resolveSpaUpload(scope: Construct): boolean {
  const ctx = parseFlag(scope.node.tryGetContext("spaUpload"));
  const envRaw = process.env.SPA_UPLOAD?.trim().toLowerCase();
  const env = envRaw === "false" || envRaw === "0" ? false : envRaw === "true" || envRaw === "1" ? true : undefined;
  return ctx ?? env ?? true;
}
