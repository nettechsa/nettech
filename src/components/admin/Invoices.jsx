import { api } from "../../api";
import { usePoll } from "../../usePoll";
import { day, money } from "../../money";

const LABEL = { draft: "Draft", sent: "Awaiting payment", partial: "Partly paid", paid: "Paid", void: "Cancelled" };

export default function Invoices({ onOpen }) {
  const { data, err } = usePoll(() => api("/invoices"), 10000, []);
  if (err && !data) return <p className="alert">{err}</p>;
  if (!data) return <p className="mut">Loading…</p>;

  const live = data.filter((i) => i.status !== "void" && i.status !== "draft");
  const totals = {};
  live.forEach((i) => {
    totals[i.currency] ??= { paid: 0, balance: 0 };
    totals[i.currency].paid += i.paid;
    totals[i.currency].balance += i.balance;
  });

  return (
    <div className="panel">
      <div className="sums">
        {Object.entries(totals).map(([c, t]) => (
          <div key={c}><span className="mut small">Collected ({c.toUpperCase()})</span><b>{money(t.paid, c)}</b><span className="mut small">Outstanding</span><b>{money(t.balance, c)}</b></div>
        ))}
      </div>
      {data.length === 0 && <p className="mut">No invoices yet. Open a client and use their Billing tab to create one.</p>}
      {data.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Invoice</th><th>Client</th><th>Total</th><th>Balance</th><th>Next due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {data.map((i) => {
              const next = i.installments.find((x) => x.status === "unpaid" && x.dueDate);
              return (
                <tr key={i.id}>
                  <td>{i.number}</td><td>{i.clientName}</td>
                  <td>{money(i.total, i.currency)}</td><td>{money(i.balance, i.currency)}</td>
                  <td>{next ? day(next.dueDate) : "-"}</td>
                  <td><span className={`badge ${i.status}`}>{LABEL[i.status]}</span></td>
                  <td><button className="btn s o" onClick={() => onOpen(i.clientId)}>Open client</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
