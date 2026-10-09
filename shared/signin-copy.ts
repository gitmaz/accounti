export type AccountiSignInCopy = {
  kicker: string;
  title: string;
  lead: string;
  note: string;
};

export const ACCOUNTI_SIGNIN: AccountiSignInCopy = {
  kicker: "Accounti",
  title: "The books for an Australian company.",
  lead: "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.",
  note: "Sample password accounti123. Company /harbour.",
};

export function readSignInCopy(raw: unknown): AccountiSignInCopy {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source = body.copy && typeof body.copy === "object" ? (body.copy as Record<string, unknown>) : body;
  const next = { ...ACCOUNTI_SIGNIN };
  (Object.keys(ACCOUNTI_SIGNIN) as Array<keyof AccountiSignInCopy>).forEach((key) => {
    const value = source[key];
    if (typeof value === "string") next[key] = value.trim().slice(0, 500);
  });
  return next;
}
