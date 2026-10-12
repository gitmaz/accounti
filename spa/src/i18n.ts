import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { normalizeLanguage, type AppLanguage } from "@shared/language";

const STORAGE_KEY = "accounti.language";

const fr: Record<string, string> = {
  "Email": "E-mail",
  "Password": "Mot de passe",
  "Sign in": "Se connecter",
  "Signing in…": "Connexion…",
  "Sign out": "Se déconnecter",
  "Settings": "Réglages",
  "Sign-in failed": "La connexion a échoué",
  "Sign-in did not return an account": "La connexion n’a pas renvoyé de compte",
  "Activation code": "Code d’activation",
  "Activate": "Activer",
  "Activation failed": "L’activation a échoué",
  "Opening…": "Ouverture…",
  "Books": "Livres",
  "Reports": "Rapports",
  "Bank": "Banque",
  "Open the books": "Ouvrir les livres",
  "Activate {slug}": "Activer {slug}",
  "Admin": "Admin",
  "Accountant": "Comptable",
  "Approver": "Approbateur",
  "Bookkeeper": "Aide-comptable",
  "Auditor": "Auditeur",
  "The books for an Australian company.": "Les livres d’une entreprise australienne.",
  "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.": "Factures fiscales, factures fournisseurs, GST et une feuille BAS. L’approbation est facultative. L’exercice commence le 1er juillet.",
  "Sample password accounti123. Company /harbour.": "Mot de passe d’exemple accounti123. Entreprise /harbour.",
};

const nl: Record<string, string> = {
  "Email": "E-mail",
  "Password": "Wachtwoord",
  "Sign in": "Inloggen",
  "Signing in…": "Bezig met inloggen…",
  "Sign out": "Uitloggen",
  "Settings": "Instellingen",
  "Sign-in failed": "Inloggen mislukt",
  "Sign-in did not return an account": "Inloggen gaf geen account terug",
  "Activation code": "Activeringscode",
  "Activate": "Activeren",
  "Activation failed": "Activeren mislukt",
  "Opening…": "Openen…",
  "Books": "Boeken",
  "Reports": "Rapporten",
  "Bank": "Bank",
  "Open the books": "Open de boeken",
  "Activate {slug}": "Activeer {slug}",
  "Admin": "Beheerder",
  "Accountant": "Accountant",
  "Approver": "Goedkeurder",
  "Bookkeeper": "Boekhouder",
  "Auditor": "Auditor",
  "The books for an Australian company.": "De boeken van een Australisch bedrijf.",
  "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.": "Belastingfacturen, leveranciersfacturen, GST en een BAS-werkblad. Goedkeuring is optioneel. Het boekjaar begint op 1 juli.",
  "Sample password accounti123. Company /harbour.": "Voorbeeldwachtwoord accounti123. Bedrijf /harbour.",
};

const es: Record<string, string> = {
  "Email": "Correo",
  "Password": "Contraseña",
  "Sign in": "Entrar",
  "Signing in…": "Entrando…",
  "Sign out": "Salir",
  "Settings": "Ajustes",
  "Sign-in failed": "No se pudo entrar",
  "Sign-in did not return an account": "El acceso no devolvió una cuenta",
  "Activation code": "Código de activación",
  "Activate": "Activar",
  "Activation failed": "La activación falló",
  "Opening…": "Abriendo…",
  "Books": "Libros",
  "Reports": "Informes",
  "Bank": "Banco",
  "Open the books": "Abrir los libros",
  "Activate {slug}": "Activar {slug}",
  "Admin": "Admin",
  "Accountant": "Contable",
  "Approver": "Aprobador",
  "Bookkeeper": "Tenedor de libros",
  "Auditor": "Auditor",
  "The books for an Australian company.": "Los libros de una empresa australiana.",
  "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.": "Facturas fiscales, facturas de proveedores, GST y una hoja BAS. La aprobación es opcional. El ejercicio empieza el 1 de julio.",
  "Sample password accounti123. Company /harbour.": "Contraseña de ejemplo accounti123. Empresa /harbour.",
};

const ar: Record<string, string> = {
  "Email": "البريد",
  "Password": "كلمة المرور",
  "Sign in": "دخول",
  "Signing in…": "جارٍ الدخول…",
  "Sign out": "خروج",
  "Settings": "الإعدادات",
  "Sign-in failed": "تعذّر الدخول",
  "Sign-in did not return an account": "لم يُرجع الدخول حسابًا",
  "Activation code": "رمز التفعيل",
  "Activate": "تفعيل",
  "Activation failed": "فشل التفعيل",
  "Opening…": "جارٍ الفتح…",
  "Books": "الدفاتر",
  "Reports": "التقارير",
  "Bank": "البنك",
  "Open the books": "افتح الدفاتر",
  "Activate {slug}": "تفعيل {slug}",
  "Admin": "مسؤول",
  "Accountant": "المحاسب",
  "Approver": "الموافق",
  "Bookkeeper": "كاتب الحسابات",
  "Auditor": "المدقق",
  "The books for an Australian company.": "دفاتر شركة أسترالية.",
  "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.": "فواتير ضريبية وفواتير موردين وGST وورقة BAS. الموافقة اختيارية. تبدأ السنة المالية في 1 يوليو.",
  "Sample password accounti123. Company /harbour.": "كلمة المرور التجريبية accounti123. الشركة /harbour.",
};

const fa: Record<string, string> = {
  "Email": "ایمیل",
  "Password": "گذرواژه",
  "Sign in": "ورود",
  "Signing in…": "در حال ورود…",
  "Sign out": "خروج",
  "Settings": "تنظیمات",
  "Sign-in failed": "ورود ناموفق بود",
  "Sign-in did not return an account": "ورود حسابی برنگرداند",
  "Activation code": "کد فعال‌سازی",
  "Activate": "فعال‌سازی",
  "Activation failed": "فعال‌سازی ناموفق بود",
  "Opening…": "در حال باز شدن…",
  "Books": "دفاتر",
  "Reports": "گزارش‌ها",
  "Bank": "بانک",
  "Open the books": "باز کردن دفاتر",
  "Activate {slug}": "فعال‌سازی {slug}",
  "Admin": "مدیر",
  "Accountant": "حسابدار",
  "Approver": "تأییدکننده",
  "Bookkeeper": "دفتردار",
  "Auditor": "حسابرس",
  "The books for an Australian company.": "دفاتر یک شرکت استرالیایی.",
  "Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.": "فاکتور مالیاتی، صورتحساب تأمین‌کننده، GST و برگهٔ BAS. تأیید اختیاری است. سال مالی از ۱ ژوئیه شروع می‌شود.",
  "Sample password accounti123. Company /harbour.": "گذرواژهٔ نمونه accounti123. شرکت /harbour.",
};

const catalogs: Record<Exclude<AppLanguage, "en">, Record<string, string>> = { fr, nl, es, ar, fa };

export function phrase(language: string, text: string, vars?: Record<string, string | number>): string {
  const code = normalizeLanguage(language);
  let out = code === "en" ? text : catalogs[code][text] ?? text;
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

export function applyDocumentLanguage(language: string) {
  const code = normalizeLanguage(language);
  document.documentElement.lang = code;
  document.documentElement.dir = code === "ar" || code === "fa" ? "rtl" : "ltr";
}

function readStored(): AppLanguage {
  if (typeof sessionStorage === "undefined") return "en";
  return normalizeLanguage(sessionStorage.getItem(STORAGE_KEY));
}

let current: AppLanguage = readStored();
if (typeof document !== "undefined") applyDocumentLanguage(current);
const listeners = new Set<() => void>();

export function appLanguage(): AppLanguage {
  return current;
}

export function setAppLanguage(language: string) {
  const next = normalizeLanguage(language);
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(STORAGE_KEY, next);
  if (typeof document !== "undefined") applyDocumentLanguage(next);
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export function useAppLanguage(): AppLanguage {
  const [language, setLanguage] = useState(current);
  useEffect(() => {
    const listener = () => setLanguage(current);
    listeners.add(listener);
    setLanguage(current);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return language;
}

export function usePhrase() {
  const language = useAppLanguage();
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => phrase(language, text, vars),
    [language],
  );
}

export function LanguageGate({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const hinted = params.get("lang");
  useEffect(() => {
    if (hinted) setAppLanguage(hinted);
  }, [hinted]);
  return children;
}

export function localizedCopy<T extends Record<string, string>>(language: string, defaults: T, copy: T): T {
  const next = { ...copy };
  (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
    if (copy[key] === defaults[key]) next[key] = phrase(language, String(defaults[key])) as T[keyof T];
  });
  return next;
}
