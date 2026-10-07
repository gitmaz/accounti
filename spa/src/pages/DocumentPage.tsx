import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, aud, centsFromDollars, type Workspace } from "../api";
import { fieldLabel, fieldVisible } from "@shared/fields";
import { documentTotals, formatAbn, isValidAbn } from "@shared/ledger";
import type { BookDocument, DocKind, DocLine, GstCode } from "@shared/types";

const GST: { id: GstCode; label: string }[] = [
  { id: "gst", label: "GST 10%" },
  { id: "gst-free", label: "GST-free" },
  { id: "input-taxed", label: "Input-taxed" },
  { id: "bas-excluded", label: "BAS excluded" },
];

export function DocumentPage({ creating = false }: { creating?: boolean }) {
  const { slug = "", docId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [doc, setDoc] = useState<BookDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    api.workspace(slug).then((data) => {
      setWorkspace(data);
      if (creating) {
        const kind = (params.get("kind") || "invoice") as DocKind;
        setDoc(blank(kind, data));
      } else {
        setDoc(data.documents.find((row) => row.id === docId) || null);
      }
    }).catch((err: Error) => setError(err.message));
  }, [slug, docId, creating, params]);

  if (!workspace || !doc) return <p className="ac-fine">{error || "Loading…"}</p>;
  const document = doc;
  const locked = document.status === "posted" || document.status === "paid";
  const config = doc.kind === "bill" ? workspace.fields.bill : doc.kind === "journal" ? workspace.fields.journal : workspace.fields.invoice;
  const contact = workspace.contacts.find((row) => row.id === doc.contactId);
  const totals = documentTotals(doc);
  const gstWarning = doc.kind === "bill" && doc.lines.some((line) => line.gstCode === "gst") && !isValidAbn(contact?.abn || "");
  const features = workspace.features;
  const canWrite = workspace.role === "admin" || workspace.role === "accountant" || workspace.role === "bookkeeper";
  const canApproveRole = workspace.role === "admin" || workspace.role === "accountant" || workspace.role === "approver";
  const canPostRole = workspace.role === "admin" || workspace.role === "accountant";
  const needsApproval = features.includes("approval") && workspace.approvalEnabled && document.kind !== "invoice";

  function update(patch: Partial<BookDocument>) {
    setDoc((current) => current ? { ...current, ...patch } : current);
  }

  function updateLine(id: string, patch: Partial<DocLine>) {
    setDoc((current) => current ? { ...current, lines: current.lines.map((line) => line.id === id ? { ...line, ...patch } : line) } : current);
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      const saved = await api.saveDocument(slug, document, creating ? undefined : document.id);
      if (creating) navigate(`/${slug}/documents/${saved.document.id}`);
      else setDoc(saved.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function act(action: string) {
    setError(null);
    try {
      if (!locked) await save();
      const saved = await api.transition(slug, document.id, action);
      setDoc(saved.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <form className="ac-page ac-sheet" onSubmit={(event) => void save(event)}>
      <header className="ac-page-head">
        <div>
          <p className="ac-kicker">{doc.kind === "invoice" && totals.gst > 0 ? "Tax invoice" : doc.kind}</p>
          <h1>{doc.number || "New document"}</h1>
        </div>
        <span className={`ac-status is-${doc.status}`}>{doc.status}</span>
      </header>
      {error ? <p className="ac-error">{error}</p> : null}
      {gstWarning ? <p className="ac-warn">A supplier ABN is needed before GST on this bill can be claimed.</p> : null}
      <div className="ac-grid">
        {doc.kind !== "journal" && fieldVisible(config, "contactId") ? (
          <label>{fieldLabel(config, "contactId", "Contact")}
            <select value={doc.contactId} disabled={locked} onChange={(event) => update({ contactId: event.target.value })}>
              <option value="">Choose</option>
              {workspace.contacts.filter((row) => doc.kind === "invoice" ? row.kind !== "supplier" : row.kind !== "customer").map((row) => (
                <option key={row.id} value={row.id}>{row.name}{row.abn ? ` · ${formatAbn(row.abn)}` : ""}</option>
              ))}
            </select>
          </label>
        ) : null}
        {fieldVisible(config, "date") ? <label>{fieldLabel(config, "date", "Date")}<input type="date" value={doc.date} disabled={locked} onChange={(event) => update({ date: event.target.value })} /></label> : null}
        {fieldVisible(config, "dueDate") ? <label>{fieldLabel(config, "dueDate", "Due")}<input type="date" value={doc.dueDate} disabled={locked} onChange={(event) => update({ dueDate: event.target.value })} /></label> : null}
        {fieldVisible(config, "reference") ? <label>{fieldLabel(config, "reference", "Reference")}<input value={doc.reference} disabled={locked} onChange={(event) => update({ reference: event.target.value })} /></label> : null}
      </div>
      <table className="ac-table">
        <thead>
          <tr>
            <th>{fieldLabel(workspace.fields.line, "description", "Description")}</th>
            <th>{fieldLabel(workspace.fields.line, "accountId", "Account")}</th>
            {doc.kind === "journal" ? <th>Side</th> : null}
            <th className="ac-num">{fieldLabel(workspace.fields.line, "amountExCents", "Amount ex GST")}</th>
            {features.includes("gst") && doc.kind !== "journal" ? <th>GST</th> : null}
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.id}>
              <td><input aria-label="Description" value={line.description} disabled={locked} onChange={(event) => updateLine(line.id, { description: event.target.value })} /></td>
              <td>
                <select aria-label="Account" value={line.accountId} disabled={locked} onChange={(event) => updateLine(line.id, { accountId: event.target.value })}>
                  {workspace.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                </select>
              </td>
              {doc.kind === "journal" ? (
                <td>
                  <select aria-label="Side" value={line.side || "debit"} disabled={locked} onChange={(event) => updateLine(line.id, { side: event.target.value as "debit" | "credit" })}>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </td>
              ) : null}
              <td><input aria-label="Amount" className="ac-num" value={(line.amountExCents / 100).toFixed(2)} disabled={locked} onChange={(event) => updateLine(line.id, { amountExCents: centsFromDollars(event.target.value) })} /></td>
              {features.includes("gst") && doc.kind !== "journal" ? (
                <td>
                  <select aria-label="GST" value={line.gstCode} disabled={locked} onChange={(event) => updateLine(line.id, { gstCode: event.target.value as GstCode })}>
                    {GST.map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}
                  </select>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {canWrite && !locked ? (
        <button type="button" className="ac-text" onClick={() => update({ lines: [...doc.lines, blankLine(doc.kind, workspace)] })}>Add line</button>
      ) : null}
      {workspace.fields[doc.kind === "bill" ? "bill" : doc.kind === "journal" ? "journal" : "invoice"].extra.map((field) => (
        <label key={field.id}>{field.label}<input value={doc.extra[field.id] || ""} disabled={locked} onChange={(event) => update({ extra: { ...doc.extra, [field.id]: event.target.value } })} /></label>
      ))}
      {fieldVisible(config, "memo") ? <label>{fieldLabel(config, "memo", "Notes")}<textarea value={doc.memo} disabled={locked} onChange={(event) => update({ memo: event.target.value })} /></label> : null}
      <p className="ac-totals">Ex GST {aud(totals.ex)} · GST {aud(totals.gst)} · Total {aud(doc.kind === "journal" ? totals.ex : totals.gross)}</p>
      <div className="ac-actions">
        {canWrite && !locked ? <button className="ac-solid" type="submit">Save</button> : null}
        {needsApproval && !creating && (document.status === "draft" || document.status === "rejected") && canWrite ? <button type="button" onClick={() => void act("submit")}>Submit</button> : null}
        {needsApproval && !creating && canApproveRole && (document.status === "submitted" || document.status === "approved") ? <button type="button" onClick={() => void act("approve")}>Approve</button> : null}
        {!creating && !locked && (canPostRole || (!needsApproval && canWrite)) ? <button type="button" onClick={() => void act("post")}>Post</button> : null}
        {document.kind !== "journal" && document.status === "posted" && (canPostRole || canWrite) ? <button type="button" onClick={() => void act("pay")}>Mark paid</button> : null}
        {features.includes("print") ? <button type="button" onClick={() => window.print()}>Print</button> : null}
      </div>
      {features.includes("comments") && !creating ? (
        <section className="ac-comments">
          <h2>Comments</h2>
          <ul>{doc.comments.map((note) => <li key={note.id}>{note.text}</li>)}</ul>
          <div className="ac-row">
            <input aria-label="Comment" value={comment} onChange={(event) => setComment(event.target.value)} />
            <button type="button" onClick={() => void api.comment(slug, doc.id, comment).then((saved) => { setDoc(saved.document); setComment(""); })}>Add</button>
          </div>
        </section>
      ) : null}
    </form>
  );
}

function blank(kind: DocKind, workspace: Workspace): BookDocument {
  return {
    id: "",
    kind,
    number: "",
    contactId: "",
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    reference: "",
    memo: "",
    status: "draft",
    ownerId: "",
    lines: [blankLine(kind, workspace)],
    extra: {},
    comments: [],
    approverId: workspace.members.find((member) => member.role === "approver")?.id || "",
    secondApproverId: workspace.features.includes("secondApproval") ? workspace.members.find((member) => member.role === "accountant")?.id || "" : "",
    version: 1,
  };
}

function blankLine(kind: DocKind, workspace: Workspace): DocLine {
  const sales = workspace.accounts.find((account) => account.system === "sales");
  const expense = workspace.accounts.find((account) => account.system === "expense");
  const bank = workspace.accounts.find((account) => account.system === "bank");
  return {
    id: `line-${crypto.randomUUID().slice(0, 8)}`,
    accountId: kind === "invoice" ? sales?.id || "" : kind === "bill" ? expense?.id || "" : bank?.id || "",
    description: "",
    amountExCents: 0,
    gstCode: kind === "journal" ? "bas-excluded" : "gst",
    side: "debit",
    extra: {},
  };
}
