import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ACCOUNTI_SIGNIN, type AccountiSignInCopy } from "@shared/signin-copy";
import { api, loadSession, type Workspace } from "../api";
import type { DialogFieldConfig, DialogFieldsConfig, Role } from "@shared/types";

const FORMS: { id: keyof DialogFieldsConfig; label: string }[] = [
  { id: "invoice", label: "Tax invoice" },
  { id: "bill", label: "Bill" },
  { id: "journal", label: "Journal" },
  { id: "contact", label: "Contact" },
  { id: "line", label: "Line" },
];

export function SettingsPage() {
  const { slug = "" } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [fields, setFields] = useState<DialogFieldsConfig | null>(null);
  const [form, setForm] = useState<keyof DialogFieldsConfig>("invoice");
  const [extra, setExtra] = useState("");
  const [abn, setAbn] = useState("");
  const [account, setAccount] = useState({ code: "", name: "", type: "expense" });
  const [person, setPerson] = useState({ name: "", email: "", password: "", role: "bookkeeper" as Role });
  const [smtp, setSmtp] = useState({ host: "", port: 587, username: "", password: "", encryption: "tls" as "" | "tls" | "ssl", from: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.workspace(slug).then((data) => {
      setWorkspace(data);
      setFields(data.fields);
      setAbn(data.company.abn);
      setSmtp({ ...data.smtp, password: "" });
    }).catch((err: Error) => setError(err.message));
  }, [slug]);

  if (!workspace || !fields) return <p className="ac-fine">{error || "Loading settings…"}</p>;
  const section = fields[form];

  function patchSection(next: DialogFieldConfig) {
    setFields({ ...fields!, [form]: next });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = { abn, fields, approvalEnabled: workspace?.approvalEnabled };
      if (workspace?.smtpAccess) body.smtp = smtp;
      const next = await api.saveWorkspace(slug, body);
      setWorkspace(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  const superAdmin = Boolean(loadSession()?.user.groups.includes("super-admins"));

  return (
    <>
    {superAdmin ? <SignInCopySettings /> : null}
    <form className="ac-page" onSubmit={(event) => void save(event)}>
      <header className="ac-page-head"><div><p className="ac-kicker">Admin</p><h1>How the books are labelled</h1></div></header>
      {error ? <p className="ac-error">{error}</p> : null}
      {saved ? <p className="ac-fine">Saved.</p> : null}
      <label>Company ABN<input value={abn} onChange={(event) => setAbn(event.target.value)} /></label>
      {workspace.features.includes("approval") ? (
        <label className="ac-check"><input type="checkbox" checked={workspace.approvalEnabled} onChange={(event) => setWorkspace({ ...workspace, approvalEnabled: event.target.checked })} />Require approval before a bill or journal is posted</label>
      ) : <p className="ac-fine">Optional approval is in feature set C.</p>}
      <div className="ac-tabs">
        {FORMS.map((item) => <button key={item.id} type="button" aria-selected={form === item.id} onClick={() => setForm(item.id)}>{item.label}</button>)}
      </div>
      {section.fields.map((field) => (
        <div className="ac-row" key={field.key}>
          <input aria-label={`Label for ${field.key}`} value={field.label} onChange={(event) => patchSection({ ...section, fields: section.fields.map((row) => row.key === field.key ? { ...row, label: event.target.value } : row) })} />
          <label className="ac-check"><input type="checkbox" checked={field.hidden} onChange={(event) => patchSection({ ...section, fields: section.fields.map((row) => row.key === field.key ? { ...row, hidden: event.target.checked } : row) })} />Hide</label>
        </div>
      ))}
      {section.extra.map((field) => (
        <p className="ac-fine" key={field.id}>Added field: {field.label}</p>
      ))}
      <div className="ac-row">
        <input aria-label="New field" placeholder="New field label" value={extra} onChange={(event) => setExtra(event.target.value)} />
        <button type="button" onClick={() => {
          if (!extra.trim()) return;
          patchSection({ ...section, extra: [...section.extra, { id: `extra-${crypto.randomUUID().slice(0, 8)}`, label: extra.trim() }] });
          setExtra("");
        }}>Add field</button>
      </div>
      <h2>Chart of accounts</h2>
      <ul className="ac-list">{workspace.accounts.map((row) => <li key={row.id}>{row.code} {row.name}</li>)}</ul>
      <div className="ac-row">
        <input aria-label="Account code" placeholder="Code" value={account.code} onChange={(event) => setAccount({ ...account, code: event.target.value })} />
        <input aria-label="Account name" placeholder="Name" value={account.name} onChange={(event) => setAccount({ ...account, name: event.target.value })} />
        <select aria-label="Account type" value={account.type} onChange={(event) => setAccount({ ...account, type: event.target.value })}>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <button type="button" onClick={() => void api.saveAccount(slug, account).then(() => api.workspace(slug).then(setWorkspace))}>Add account</button>
      </div>
      <h2>People</h2>
      <table className="ac-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>{workspace.members.map((member) => <tr key={member.id}><td>{member.name}</td><td>{member.email}</td><td>{member.role}</td></tr>)}</tbody>
      </table>
      <div className="ac-row">
        <input aria-label="Person name" placeholder="Name" value={person.name} onChange={(event) => setPerson({ ...person, name: event.target.value })} />
        <input aria-label="Person email" placeholder="Email" value={person.email} onChange={(event) => setPerson({ ...person, email: event.target.value })} />
        <input aria-label="Person password" type="password" placeholder="Password" value={person.password} onChange={(event) => setPerson({ ...person, password: event.target.value })} />
        <select aria-label="Role" value={person.role} onChange={(event) => setPerson({ ...person, role: event.target.value as Role })}>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
          <option value="approver">Approver</option>
          <option value="bookkeeper">Bookkeeper</option>
          <option value="auditor">Auditor</option>
        </select>
        <button type="button" onClick={() => void api.addMember(slug, person).then(() => api.workspace(slug).then((data) => { setWorkspace(data); setPerson({ name: "", email: "", password: "", role: "bookkeeper" }); }))}>Add person</button>
      </div>
      {workspace.smtpAccess ? (
        <section>
          <h2>Email</h2>
          <p className="ac-fine">Leave the host blank and Accounti sends through Amazon SES. A host and from address use SMTP. A password is stored only when you type a new one.</p>
          <div className="ac-grid">
            <label>SMTP host<input value={smtp.host} onChange={(event) => setSmtp({ ...smtp, host: event.target.value })} /></label>
            <label>Port<input value={smtp.port} onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) || 587 })} /></label>
            <label>Username<input value={smtp.username} onChange={(event) => setSmtp({ ...smtp, username: event.target.value })} /></label>
            <label>Password<input type="password" value={smtp.password} onChange={(event) => setSmtp({ ...smtp, password: event.target.value })} /></label>
            <label>From<input value={smtp.from} onChange={(event) => setSmtp({ ...smtp, from: event.target.value })} /></label>
          </div>
        </section>
      ) : null}
      <button className="ac-solid" type="submit">Save settings</button>
    </form>
    </>
  );
}

function SignInCopySettings() {
  const [copy, setCopy] = useState<AccountiSignInCopy>(ACCOUNTI_SIGNIN);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api.signInCopy().then((row) => setCopy(row.copy)).catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    try {
      const row = await api.saveSignInCopy(copy);
      setCopy(row.copy);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the sign-in page");
    }
  }

  return (
    <form className="ac-page" onSubmit={(event) => void save(event)}>
      <p className="ac-kicker">Sign-in page</p>
      <p className="ac-fine">Titles and sentences on the sign-in page. Field labels stay as they are.</p>
      <label>Kicker<input value={copy.kicker} onChange={(event) => setCopy({ ...copy, kicker: event.target.value })} /></label>
      <label>Title<input value={copy.title} onChange={(event) => setCopy({ ...copy, title: event.target.value })} /></label>
      <label>Introduction<textarea rows={3} value={copy.lead} onChange={(event) => setCopy({ ...copy, lead: event.target.value })} /></label>
      <label>Note<textarea rows={2} value={copy.note} onChange={(event) => setCopy({ ...copy, note: event.target.value })} /></label>
      {error ? <p className="ac-error">{error}</p> : null}
      {saved ? <p className="ac-fine">Saved.</p> : null}
      <button className="ac-solid" type="submit">Save sign-in page</button>
    </form>
  );
}
