export const DEFAULT_COMPANY_SLUG = "harbour" as const;
export const DEFAULT_COMPANY_NAME = "Harbour Office" as const;

export const RESERVED_COMPANY_SLUGS = [
  "register",
  "verify",
  "activate",
  "settings",
  "books",
  "reports",
  "reconcile",
  "health",
  "auth",
  "assets",
  "config",
  "api",
] as const;

export function slugifyCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isReservedCompanySlug(slug: string): boolean {
  return (RESERVED_COMPANY_SLUGS as readonly string[]).includes(slug.trim().toLowerCase());
}

export function isValidCompanySlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 1 && slug.length <= 64;
}
