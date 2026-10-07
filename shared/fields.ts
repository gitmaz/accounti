import type { DialogFieldConfig, DialogFieldsConfig, ExtraFieldDef, FieldOverride } from "./types";

export type BuiltinFieldDef = {
  key: string;
  defaultLabel: string;
  required: boolean;
};

export const INVOICE_FIELDS: BuiltinFieldDef[] = [
  { key: "contactId", defaultLabel: "Customer", required: true },
  { key: "date", defaultLabel: "Invoice date", required: true },
  { key: "dueDate", defaultLabel: "Due date", required: false },
  { key: "reference", defaultLabel: "Reference", required: false },
  { key: "memo", defaultLabel: "Notes", required: false },
];

export const BILL_FIELDS: BuiltinFieldDef[] = [
  { key: "contactId", defaultLabel: "Supplier", required: true },
  { key: "date", defaultLabel: "Bill date", required: true },
  { key: "dueDate", defaultLabel: "Due date", required: false },
  { key: "reference", defaultLabel: "Supplier invoice", required: false },
  { key: "memo", defaultLabel: "Notes", required: false },
];

export const JOURNAL_FIELDS: BuiltinFieldDef[] = [
  { key: "date", defaultLabel: "Journal date", required: true },
  { key: "reference", defaultLabel: "Narration", required: true },
  { key: "memo", defaultLabel: "Notes", required: false },
];

export const CONTACT_FIELDS: BuiltinFieldDef[] = [
  { key: "name", defaultLabel: "Name", required: true },
  { key: "abn", defaultLabel: "ABN", required: false },
  { key: "email", defaultLabel: "Email", required: false },
  { key: "kind", defaultLabel: "Customer or supplier", required: true },
];

export const LINE_FIELDS: BuiltinFieldDef[] = [
  { key: "description", defaultLabel: "Description", required: true },
  { key: "accountId", defaultLabel: "Account", required: true },
  { key: "amountExCents", defaultLabel: "Amount ex GST", required: true },
  { key: "gstCode", defaultLabel: "GST", required: true },
];

const BUILTINS = {
  invoice: INVOICE_FIELDS,
  bill: BILL_FIELDS,
  journal: JOURNAL_FIELDS,
  contact: CONTACT_FIELDS,
  line: LINE_FIELDS,
} as const;

function overridesFor(builtins: BuiltinFieldDef[], raw: unknown): FieldOverride[] {
  const byKey = new Map<string, { label?: unknown; hidden?: unknown }>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.key !== "string") continue;
      byKey.set(record.key, record);
    }
  }
  return builtins.map((builtin) => {
    const saved = byKey.get(builtin.key);
    const label = typeof saved?.label === "string" && saved.label.trim() ? saved.label.trim() : builtin.defaultLabel;
    return { key: builtin.key, label, hidden: builtin.required ? false : saved?.hidden === true };
  });
}

function extraFieldsFrom(raw: unknown): ExtraFieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraFieldDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!label) continue;
    let id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) id = `extra-${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out;
}

export function emptyDialogConfig(builtins: BuiltinFieldDef[]): DialogFieldConfig {
  return {
    fields: builtins.map((builtin) => ({ key: builtin.key, label: builtin.defaultLabel, hidden: false })),
    extra: [],
  };
}

export function emptyFields(): DialogFieldsConfig {
  return {
    invoice: emptyDialogConfig(INVOICE_FIELDS),
    bill: emptyDialogConfig(BILL_FIELDS),
    journal: emptyDialogConfig(JOURNAL_FIELDS),
    contact: emptyDialogConfig(CONTACT_FIELDS),
    line: emptyDialogConfig(LINE_FIELDS),
  };
}

export function normalizeDialogFieldsConfig(raw: unknown): DialogFieldsConfig {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const next = emptyFields();
  for (const key of Object.keys(BUILTINS) as (keyof typeof BUILTINS)[]) {
    const section = source[key];
    const record = section && typeof section === "object" ? (section as Record<string, unknown>) : {};
    next[key] = {
      fields: overridesFor(BUILTINS[key], record.fields),
      extra: extraFieldsFrom(record.extra),
    };
  }
  return next;
}

export function fieldLabel(config: DialogFieldConfig, key: string, fallback: string): string {
  return config.fields.find((field) => field.key === key)?.label || fallback;
}

export function fieldVisible(config: DialogFieldConfig, key: string): boolean {
  return config.fields.find((field) => field.key === key)?.hidden !== true;
}
