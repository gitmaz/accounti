import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, aud, type Workspace } from "../api";
import { documentTotals } from "@shared/ledger";
import type { Contact, DocKind } from "@shared/types";

const KINDS: { id: DocKind | "contact"; label: string }[] = [
  { id: "invoice", label: "Invoices" },
  { id: "bill", label: "Bills" },
  { id: "journal", label: "Journals" },
  { id: "contact", label: "Contacts" },
];

export function BooksPage() {
  const { slug = "" } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [kind, setKind] = useState<DocKind | "contact">("invoice");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.workspace(slug).then(setWorkspace).catch((err: Error) => setError(err.message));
  }, [slug]);

  if (!workspace) return <p className="ac-fine">{error || "Loading the books…"}</p>;
  const needle = query.trim().toLowerCase();
  const documents = workspace.documents.filter((doc) => doc.kind === kind && `${doc.number} ${doc.reference} ${doc.memo}`.toLowerCase().includes(needle));
  const contacts = workspace.contacts.filter((contact) => `${contact.name} ${contact.abn}`.toLowerCase().includes(needle));
  const canWrite = workspace.role === "admin" || workspace.role === "accountant" || workspace.role === "bookkeeper";

  return (
    <section className="ac-page">
      <header className="ac-page-head">
        <div>
          <p className="ac-kicker">Feature set {workspace.company.featureSet.toUpperCase()}</p>
          <h1>{workspace.company.name}</h1>
          <p className="ac-fine">{workspace.company.abn ? `ABN ${workspace.company.abn}` : "ABN not set"} · Australian financial year from 1 July</p>
        </div>
        {canWrite && kind !== "contact" ? <Link className="ac-solid" to={`/${slug}/documents/new?kind=${kind}`}>New {kind}</Link> : null}
      </header>
      <div className="ac-toolbar">
        <div className="ac-tabs" role="tablist">
          {KINDS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={kind === item.id} onClick={() => setKind(item.id)}>{item.label}</button>
          ))}
        </div>
        <input aria-label="Search" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {kind === "contact" ? (
        <>
          {canWrite ? <ContactForm slug={slug} onSaved={(contact) => setWorkspace({ ...workspace, contacts: [...workspace.contacts, contact] })} /> : null}
          <table className="ac-table">
          <thead><tr><th>Name</th><th>ABN</th><th>Kind</th><th>Email</th></tr></thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id}><td>{contact.name}</td><td>{contact.abn || "—"}</td><td>{contact.kind}</td><td>{contact.email}</td></tr>
            ))}
          </tbody>
        </table>
        </>
      ) : (
        <table className="ac-table">
          <thead><tr><th>Number</th><th>Date</th><th>Detail</th><th>Status</th><th className="ac-num">Amount</th></tr></thead>
          <tbody>
            {documents.map((doc) => {
              const contact = workspace.contacts.find((row) => row.id === doc.contactId);
              const totals = documentTotals(doc);
              return (
                <tr key={doc.id}>
                  <td><Link to={`/${slug}/documents/${doc.id}`}>{doc.number}</Link></td>
                  <td>{doc.date}</td>
                  <td>{contact?.name || doc.reference}</td>
                  <td><span className={`ac-status is-${doc.status}`}>{doc.status}</span></td>
                  <td className="ac-num">{aud(doc.kind === "journal" ? totals.ex : totals.gross)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ContactForm({ slug, onSaved }: { slug: string; onSaved: (contact: Contact) => void }) {
  const [name, setName] = useState("");
  const [abn, setAbn] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<Contact["kind"]>("customer");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await api.saveContact(slug, { name, abn, email, kind });
      onSaved(saved.contact);
      setName("");
      setAbn("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <form className="ac-row" onSubmit={(event) => void save(event)}>
      <input aria-label="Contact name" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label="ABN" placeholder="ABN" value={abn} onChange={(event) => setAbn(event.target.value)} />
      <input aria-label="Contact email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value as Contact["kind"])}>
        <option value="customer">Customer</option>
        <option value="supplier">Supplier</option>
        <option value="both">Both</option>
      </select>
      <button className="ac-solid" type="submit">Add contact</button>
      {error ? <p className="ac-error">{error}</p> : null}
    </form>
  );
}
