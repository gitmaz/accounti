export const APP_LANGUAGES = ["en", "fr", "nl", "es", "ar", "fa"] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export function normalizeLanguage(raw: unknown): AppLanguage {
  const code = String(raw || "").trim().toLowerCase();
  return (APP_LANGUAGES as readonly string[]).includes(code) ? (code as AppLanguage) : "en";
}
