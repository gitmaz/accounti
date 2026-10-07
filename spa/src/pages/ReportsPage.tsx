import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, aud, type Reports } from "../api";
import { financialYear } from "@shared/ledger";

export function ReportsPage() {
  const { slug = "" } = useParams();
  const today = new Date().toISOString().slice(0, 10);
  const year = financialYear(today);
  const [on, setOn] = useState(today);
  const [from, setFrom] = useState(year.from);
  const [to, setTo] = useState(today);
  const [reports, setReports] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.reports(slug, on, from, to).then(setReports).catch((err: Error) => setError(err.message));
  }, [slug, on, from, to]);

  if (error) return <p className="ac-error">{error}</p>;
  if (!reports) return <p className="ac-fine">Preparing the reports…</p>;
  const pnl = reports.profitAndLoss;
  const sheet = reports.balanceSheet;
  const bas = reports.bas;

  return (
    <section className="ac-page">
      <header className="ac-page-head">
        <div>
          <p className="ac-kicker">Australian reports</p>
          <h1>Profit, position, and BAS</h1>
        </div>
        <div className="ac-row">
          <label>As at<input type="date" value={on} onChange={(event) => setOn(event.target.value)} /></label>
          <label>BAS from<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>BAS to<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      </header>
      <section className="ac-report">
        <h2>Profit and loss · {pnl.yearLabel}</h2>
        <Rows title="Income" rows={pnl.income} />
        <Rows title="Expenses" rows={pnl.expenses} />
        <p className="ac-totals">Profit {aud(pnl.profit)}</p>
      </section>
      <section className="ac-report">
        <h2>Balance sheet · {sheet.to}</h2>
        <Rows title="Assets" rows={sheet.assets} />
        <Rows title="Liabilities" rows={sheet.liabilities} />
        <Rows title="Equity" rows={sheet.equity} />
        <p className="ac-fine">Current earnings {aud(sheet.currentEarnings)}. Assets {aud(sheet.assetTotal)}. Liabilities and equity {aud(sheet.liabilityTotal + sheet.equityTotal)}.</p>
      </section>
      <section className="ac-report">
        <h2>BAS worksheet</h2>
        <dl className="ac-bas">
          <div><dt>G1 Total sales</dt><dd>{aud(bas.g1)}</dd></div>
          <div><dt>1A GST on sales</dt><dd>{aud(bas.gstOnSales)}</dd></div>
          <div><dt>1B GST on purchases</dt><dd>{aud(bas.gstOnPurchases)}</dd></div>
          <div><dt>Net GST</dt><dd>{aud(bas.netGst)}</dd></div>
        </dl>
        {bas.missingSupplierAbn ? <p className="ac-warn">{bas.missingSupplierAbn} bill{bas.missingSupplierAbn === 1 ? "" : "s"} claim GST without a valid supplier ABN.</p> : <p className="ac-fine">Supplier ABNs are present on GST bills in this period.</p>}
      </section>
    </section>
  );
}

function Rows({ title, rows }: { title: string; rows: { account: { code: string; name: string }; cents: number }[] }) {
  return (
    <table className="ac-table">
      <caption>{title}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.account.code}><td>{row.account.code} {row.account.name}</td><td className="ac-num">{aud(row.cents)}</td></tr>
        ))}
        {!rows.length ? <tr><td colSpan={2}>Nothing in this section.</td></tr> : null}
      </tbody>
    </table>
  );
}
