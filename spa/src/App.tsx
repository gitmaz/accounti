import { FormEvent, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ACCOUNTI_SIGNIN, type AccountiSignInCopy } from "@shared/signin-copy";
import { api, loadSession, saveSession, subscribeSession, type SessionUser } from "./api";
import { InitializingLock } from "./components/InitializingLock";
import "./components/InitializingLock.css";
import { appLanguage, localizedCopy, setAppLanguage, useAppLanguage, usePhrase } from "./i18n";
import { BooksPage } from "./pages/BooksPage";
import { DocumentPage } from "./pages/DocumentPage";
import { ReconcilePage } from "./pages/ReconcilePage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

const SAMPLES = [
  ["Admin", "admin@accounti.demo"],
  ["Accountant", "accountant@accounti.demo"],
  ["Approver", "approver@accounti.demo"],
  ["Bookkeeper", "bookkeeper@accounti.demo"],
  ["Auditor", "auditor@accounti.demo"],
] as const;

function useUser(): SessionUser | null {
  return useSyncExternalStore(subscribeSession, loadSession, () => null)?.user ?? null;
}

function companySlugFrom(path: string): string {
  if (!path.startsWith("/")) return "";
  return path.split("?")[0].split("/").filter(Boolean)[0] || "";
}

function useCompanyLanguage(slug: string) {
  useEffect(() => {
    if (!slug) return;
    let cancel = false;
    void api.companyLanguage(slug).then((row) => {
      if (!cancel && row.language) setAppLanguage(row.language);
    }).catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [slug]);
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SignInPage />} />
      <Route path="/:slug/activate" element={<ActivatePage />} />
      <Route path="/:slug" element={<Guard><BooksPage /></Guard>} />
      <Route path="/:slug/documents/new" element={<Guard><DocumentPage creating /></Guard>} />
      <Route path="/:slug/documents/:docId" element={<Guard><DocumentPage /></Guard>} />
      <Route path="/:slug/reports" element={<Guard><ReportsPage /></Guard>} />
      <Route path="/:slug/reconcile" element={<Guard><ReconcilePage /></Guard>} />
      <Route path="/:slug/settings" element={<Guard admin><SettingsPage /></Guard>} />
    </Routes>
  );
}

function withLang(path: string, lang: string) {
  if (!lang) return path;
  return `${path}${path.includes("?") ? "&" : "?"}lang=${encodeURIComponent(lang)}`;
}

function hintedLanguage() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("lang") || sessionStorage.getItem("accounti.language") || "";
}

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { slug = "" } = useParams();
  const user = useUser();
  const hinted = hintedLanguage();
  if (!user) return <SignInPage />;
  if (user.companySlug && user.companySlug !== slug && !user.groups.includes("super-admins")) return <Navigate to={withLang(`/${user.companySlug}`, hinted)} replace />;
  const isAdmin = user.groups.includes("admins") || user.groups.includes("super-admins");
  if (admin && !isAdmin) return <Navigate to={withLang(`/${slug}`, hinted)} replace />;
  return <Shell slug={slug}>{children}</Shell>;
}

function Shell({ slug, children }: { slug: string; children: ReactNode }) {
  const user = useUser();
  const say = usePhrase();
  useCompanyLanguage(slug);
  const isAdmin = Boolean(user?.groups.includes("admins") || user?.groups.includes("super-admins"));
  return (
    <div className="ac-app">
      <header className="ac-top">
        <Link to={`/${slug}`} className="ac-brand"><span className="ac-mark" aria-hidden="true" />Accounti</Link>
        <nav>
          <NavLink to={`/${slug}`} end>{say("Books")}</NavLink>
          <NavLink to={`/${slug}/reports`}>{say("Reports")}</NavLink>
          <NavLink to={`/${slug}/reconcile`}>{say("Bank")}</NavLink>
          {isAdmin ? <NavLink to={`/${slug}/settings`}>{say("Settings")}</NavLink> : null}
        </nav>
        <div className="ac-who">
          <span>{user?.name}</span>
          <button type="button" className="ac-text" onClick={() => saveSession(null)}>{say("Sign out")}</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function SignInPage() {
  const [params] = useSearchParams();
  const { slug: routeSlug = "" } = useParams();
  const next = params.get("next") || "";
  const company = routeSlug || companySlugFrom(next);
  const navigate = useNavigate();
  const [email, setEmail] = useState("bookkeeper@accounti.demo");
  const [password, setPassword] = useState("accounti123");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copy, setCopy] = useState<AccountiSignInCopy>(ACCOUNTI_SIGNIN);
  const say = usePhrase();
  const language = useAppLanguage();
  const shown = localizedCopy(language, ACCOUNTI_SIGNIN, copy);
  useCompanyLanguage(company);

  useEffect(() => {
    void api.signInCopy().then((row) => setCopy(row.copy)).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      if (!res.token || !res.user?.companySlug) throw new Error("Sign-in did not return an account");
      saveSession({ token: res.token, user: res.user });
      if (res.language) setAppLanguage(res.language);
      const lang = res.language || appLanguage();
      const path = window.location.pathname;
      const allowedHere = Boolean(company) && (company === res.user.companySlug || res.user.groups.includes("super-admins"));
      if (allowedHere && (path === `/${company}` || path.startsWith(`/${company}/`))) return;
      navigate(withLang(next.startsWith("/") ? next : `/${res.user.companySlug}`, lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ac-signin">
      <section className="ac-hero">
        <p className="ac-kicker">{shown.kicker}</p>
        <h1>{shown.title}</h1>
        <p className="ac-lead">{shown.lead}</p>
      </section>
      <form className="ac-card" onSubmit={(event) => void submit(event)}>
        <h2>{say("Sign in")}</h2>
        <label>{say("Email")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
        <label>{say("Password")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <p className="ac-error">{say(error)}</p> : null}
        <button className="ac-solid" type="submit" disabled={pending}>{pending ? say("Signing in…") : say("Sign in")}</button>
        <div className="ac-samples">
          {SAMPLES.map(([label, sample]) => (
            <button key={sample} type="button" onClick={() => { setEmail(sample); setPassword("accounti123"); }}>{say(label)}</button>
          ))}
        </div>
        <p className="ac-fine">{shown.note}</p>
      </form>
    </div>
  );
}

function ActivatePage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const say = usePhrase();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await api.activate({ email, activationCode: code, companySlug: slug, password, companyName: slug, language: appLanguage() });
      const login = await api.login(email, password);
      saveSession({ token: login.token, user: login.user });
      if (login.language) setAppLanguage(login.language);
      navigate(withLang(`/${res.company.slug}`, login.language || appLanguage()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <InitializingLock open={pending} message={say("Initializing. Please wait...")} />
      <form className="ac-card ac-activate" onSubmit={(event) => void submit(event)}>
        <p className="ac-kicker">{say("Activate {slug}", { slug })}</p>
        <h1>{say("Open the books")}</h1>
        <label>{say("Email")}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} /></label>
        <label>{say("Activation code")}<input value={code} onChange={(event) => setCode(event.target.value)} disabled={pending} /></label>
        <label>{say("Password")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} /></label>
        {error ? <p className="ac-error">{say(error)}</p> : null}
        <button className="ac-solid" type="submit" disabled={pending}>{pending ? say("Activating…") : say("Activate")}</button>
      </form>
    </>
  );
}
