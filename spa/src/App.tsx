import { FormEvent, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, loadSession, saveSession, type SessionUser } from "./api";
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
  return loadSession()?.user ?? null;
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

function Guard({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { slug = "" } = useParams();
  const user = useUser();
  if (!user) return <Navigate to={`/?next=/${slug}`} replace />;
  if (user.companySlug && user.companySlug !== slug && !user.groups.includes("super-admins")) return <Navigate to={`/${user.companySlug}`} replace />;
  const isAdmin = user.groups.includes("admins") || user.groups.includes("super-admins");
  if (admin && !isAdmin) return <Navigate to={`/${slug}`} replace />;
  return <Shell slug={slug}>{children}</Shell>;
}

function Shell({ slug, children }: { slug: string; children: ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.groups.includes("admins") || user?.groups.includes("super-admins"));
  return (
    <div className="ac-app">
      <header className="ac-top">
        <Link to={`/${slug}`} className="ac-brand"><span className="ac-mark" aria-hidden="true" />Accounti</Link>
        <nav>
          <NavLink to={`/${slug}`} end>Books</NavLink>
          <NavLink to={`/${slug}/reports`}>Reports</NavLink>
          <NavLink to={`/${slug}/reconcile`}>Bank</NavLink>
          {isAdmin ? <NavLink to={`/${slug}/settings`}>Settings</NavLink> : null}
        </nav>
        <div className="ac-who">
          <span>{user?.name}</span>
          <button type="button" className="ac-text" onClick={() => { saveSession(null); navigate("/"); }}>Sign out</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function SignInPage() {
  const [params] = useSearchParams();
  const next = params.get("next") || "";
  const navigate = useNavigate();
  const [email, setEmail] = useState("bookkeeper@accounti.demo");
  const [password, setPassword] = useState("accounti123");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api.login(email, password);
      if (!res.token || !res.user?.companySlug) throw new Error("Sign-in did not return an account");
      saveSession({ token: res.token, user: res.user });
      navigate(next.startsWith("/") ? next : `/${res.user.companySlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ac-signin">
      <section className="ac-hero">
        <p className="ac-kicker">Accounti</p>
        <h1>The books for an Australian company.</h1>
        <p className="ac-lead">Tax invoices, supplier bills, GST, and a BAS worksheet. Approval is optional. The financial year starts on 1 July.</p>
      </section>
      <form className="ac-card" onSubmit={(event) => void submit(event)}>
        <h2>Sign in</h2>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {error ? <p className="ac-error">{error}</p> : null}
        <button className="ac-solid" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <div className="ac-samples">
          {SAMPLES.map(([label, sample]) => (
            <button key={sample} type="button" onClick={() => { setEmail(sample); setPassword("accounti123"); }}>{label}</button>
          ))}
        </div>
        <p className="ac-fine">Sample password <code>accounti123</code>. Company <code>/harbour</code>.</p>
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const res = await api.activate({ email, activationCode: code, companySlug: slug, password, companyName: slug });
      const login = await api.login(email, password);
      saveSession({ token: login.token, user: login.user });
      navigate(`/${res.company.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    }
  }

  return (
    <form className="ac-card ac-activate" onSubmit={(event) => void submit(event)}>
      <p className="ac-kicker">Activate {slug}</p>
      <h1>Open the books</h1>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Activation code<input value={code} onChange={(event) => setCode(event.target.value)} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <p className="ac-error">{error}</p> : null}
      <button className="ac-solid" type="submit">Activate</button>
    </form>
  );
}
