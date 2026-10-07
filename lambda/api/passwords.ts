import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

import type { SessionUser } from "../../shared/types";

export const SAMPLE_PASSWORD = "accounti123";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "base64url");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

function demoSecret(): string {
  return process.env.DEMO_TOKEN_SECRET || "accounti-local-demo";
}

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

export function signDemoToken(user: SessionUser): string {
  const body = b64url(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }));
  const sig = createHmac("sha256", demoSecret()).update(body).digest("base64url");
  return `demo.${body}.${sig}`;
}

export function readDemoToken(token: string): SessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "demo") return null;
  const sig = createHmac("sha256", demoSecret()).update(parts[1]).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as SessionUser & { exp: number };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { email: payload.email, name: payload.name, groups: payload.groups || [], companySlug: payload.companySlug };
}
