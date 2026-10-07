import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, aud, centsFromDollars, type Workspace } from "../api";

export function ReconcilePage() {
  const { slug = "" } = useParams();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [bankId, setBankId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [closing, setClosing] = useState("0.00");
  const [lines, setLines] = useState<{ id: string; date: string; label: string; cents: number }[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.workspace(slug).then((data) => {
      setWorkspace(data);
      const bank = data.accounts.find((account) => account.system === "bank");
      if (bank) setBankId(bank.id);
    }).catch((err: Error) => setError(err.message));
  }, [slug]);

  useEffect(() => {
    if (!bankId) return;
    api.reconcile(slug, bankId).then((data) => setLines(data.lines)).catch((err: Error) => setError(err.message));
  }, [slug, bankId]);

  if (error && !workspace) return <p className="ac-error">{error}</p>;
  if (!workspace) return <p className="ac-fine">Loading the bank…</p>;
  if (!workspace.features.includes("reconcile")) return <p className="ac-fine">Bank reconciliation is in feature set C.</p>;
  const canReconcile = workspace.role === "admin" || workspace.role === "accountant";

  async function save() {
    setError(null);
    try {
      const saved = await api.saveReconcile(slug, { bankAccountId: bankId, statementDate: date, closingCents: centsFromDollars(closing), matchedIds: matched });
      setNote(`Statement ${aud(centsFromDollars(closing))} · ticked ${aud(saved.difference.ticked)} · still to match ${aud(saved.difference.difference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <section className="ac-page">
      <header className="ac-page-head">
        <div>
          <p className="ac-kicker">Bank</p>
          <h1>Reconcile the statement</h1>
        </div>
      </header>
      <div className="ac-grid">
        <label>Bank account
          <select value={bankId} onChange={(event) => setBankId(event.target.value)}>
            {workspace.accounts.filter((account) => account.type === "asset").map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
          </select>
        </label>
        <label>Statement date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Closing balance<input value={closing} onChange={(event) => setClosing(event.target.value)} /></label>
      </div>
      <table className="ac-table">
        <thead><tr><th></th><th>Date</th><th>Detail</th><th className="ac-num">Amount</th></tr></thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td><input type="checkbox" aria-label={`Match ${line.label}`} checked={matched.includes(line.id)} onChange={(event) => setMatched(event.target.checked ? [...matched, line.id] : matched.filter((id) => id !== line.id))} /></td>
              <td>{line.date.slice(0, 10)}</td>
              <td>{line.label}</td>
              <td className="ac-num">{aud(line.cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p className="ac-error">{error}</p> : null}
      {note ? <p className="ac-fine">{note}</p> : null}
      {canReconcile ? <button className="ac-solid" type="button" onClick={() => void save()}>Save reconciliation</button> : <p className="ac-fine">An accountant saves the reconciliation.</p>}
    </section>
  );
}
