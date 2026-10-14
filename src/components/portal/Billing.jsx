import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { usePoll } from "../../usePoll";
import { CURRENCIES, day, money } from "../../money";

const PRESETS = {
  "Pay in full": [["Full payment", 100]],
  "50% deposit, 50% final": [["Deposit", 50], ["Final payment", 50]],
  "30 / 40 / 30": [["Deposit", 30], ["Mid-project", 40], ["Final payment", 30]],
};
const LABEL = { draft: "Draft", sent: "Awaiting payment", partial: "Partly paid", paid: "Paid", void: "Cancelled" };

function CreateInvoice({ clientId, onDone }) {
  const [f, setF] = useState({ title: "Website project", note: "", currency: "usd", sequential: true, allowPayAll: false });
  const [total, setTotal] = useState("");
  const [rows, setRows] = useState([{ label: "Deposit", amount: "", dueDate: "", open: true }]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/config").then((c) => setF((x) => ({ ...x, currency: c.currency }))).catch(() => {});
  }, []);

  const applyPreset = (preset) => {
    const t = Math.round((Number(total) || 0) * 100);
    let left = t;
    setRows(preset.map(([label, pct], i) => {
      const cents = i === preset.length - 1 ? left : Math.round((t * pct) / 100);
      left -= cents;
      return { label, amount: (cents / 100).toFixed(2), dueDate: "", open: true };
    }));
  };
  const setRow = (i, k, v) => setRows(rows.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const submit = async (send) => {
    setBusy(true);
    setErr("");
    try {
      await api(`/invoices/${clientId}`, { method: "POST", body: { ...f, installments: rows, send } });
      onDone();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="admin-box">
      <h3 className="h4" style={{ marginTop: 0 }}>New invoice</h3>
      <div className="three">
        <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Currency
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </label>
        <label>Total amount (optional, for presets)
          <input type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
        </label>
      </div>

      <p className="mut small">Split quickly (needs the total above), then edit any amount:</p>
      <div className="row wrap">
        {Object.entries(PRESETS).map(([name, p]) => (
          <button key={name} type="button" className="btn s o" onClick={() => applyPreset(p)}>{name}</button>
        ))}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="pay-row">
          <input placeholder="Label" aria-label="Payment label" value={r.label} onChange={(e) => setRow(i, "label", e.target.value)} />
          <input type="number" min="1" step="0.01" placeholder="Amount" aria-label="Amount" value={r.amount} onChange={(e) => setRow(i, "amount", e.target.value)} />
          <input type="date" aria-label="Due date" value={r.dueDate} onChange={(e) => setRow(i, "dueDate", e.target.value)} />
          <label className="check"><input type="checkbox" checked={r.open} onChange={(e) => setRow(i, "open", e.target.checked)} /> Open</label>
          {rows.length > 1 && <button type="button" className="btn s o" onClick={() => setRows(rows.filter((_, n) => n !== i))}>Remove</button>}
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn s o" onClick={() => setRows([...rows, { label: "", amount: "", dueDate: "", open: true }])}>Add payment</button>
        <span className="mut">Invoice total: <b>{money(Math.round(sum * 100), f.currency)}</b>{total && Math.abs(sum - Number(total)) > 0.005 ? " (differs from the total above)" : ""}</span>
      </div>

      <label className="check"><input type="checkbox" checked={f.sequential} onChange={(e) => setF({ ...f, sequential: e.target.checked })} /> Client must pay in order (deposit first)</label>
      <label className="check"><input type="checkbox" checked={f.allowPayAll} onChange={(e) => setF({ ...f, allowPayAll: e.target.checked })} /> Let the client pay the whole remaining balance at once</label>
      <label>Note for the client (optional)<textarea rows="2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <p className="mut small">"Open" controls whether a payment can be paid yet. Untick it to hold the final payment until launch.</p>

      {err && <p className="alert" role="alert">{err}</p>}
      <div className="row">
        <button className="btn s" disabled={busy} onClick={() => submit(true)}>Send to client</button>
        <button className="btn s o" disabled={busy} onClick={() => submit(false)}>Save as draft</button>
        <button className="btn s o" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

function InvoiceCard({ inv, clientId, admin, reload, setBanner }) {
  const [busy, setBusy] = useState("");

  const act = async (action, extra = {}) => {
    if (action === "void" && !confirm("Cancel this invoice? The client will no longer be able to pay it.")) return;
    if (action === "delete" && !confirm("Delete this invoice permanently?")) return;
    try {
      await api(`/invoices/${clientId}/${inv.id}/action`, { method: "POST", body: { action, ...extra } });
      reload();
    } catch (e) {
      setBanner({ ok: false, text: e.message });
    }
  };
  const pay = async (body) => {
    setBusy(body.installmentId || "all");
    try {
      const { url } = await api(`/invoices/${clientId}/${inv.id}/checkout`, { method: "POST", body });
      window.location.href = url;
    } catch (e) {
      setBanner({ ok: false, text: e.message });
      setBusy("");
    }
  };

  return (
    <article className="panel inv">
      <div className="inv-head">
        <div>
          <h3 style={{ margin: 0 }}>{inv.number}: {inv.title}</h3>
          <span className="mut small">Created {new Date(inv.createdAt).toLocaleDateString()}</span>
        </div>
        <span className={`badge ${inv.status}`}>{LABEL[inv.status]}</span>
      </div>
      {inv.note && <p className="mut">{inv.note}</p>}

      <table className="tbl">
        <thead><tr><th>Payment</th><th>Due</th><th>Amount</th><th>Status</th><th /></tr></thead>
        <tbody>
          {inv.installments.map((i) => (
            <tr key={i.id} className={i.status === "void" ? "dim" : ""}>
              <td>{i.label}</td>
              <td>{day(i.dueDate) || "-"}</td>
              <td>{money(i.amount, inv.currency)}</td>
              <td>
                {i.status === "paid" ? <span className="ok">Paid {new Date(i.paidAt).toLocaleDateString()} ({i.method})</span>
                  : i.status === "void" ? "Removed"
                  : i.open ? (i.payable || admin ? "Open" : "Waiting for earlier payment") : "Not open yet"}
              </td>
              <td className="acts">
                {!admin && i.payable && (
                  <button className="btn s" disabled={!!busy} onClick={() => pay({ scope: "one", installmentId: i.id })}>
                    {busy === i.id ? "Opening…" : "Pay by card"}
                  </button>
                )}
                {admin && i.status === "unpaid" && (
                  <>
                    <button className="btn s o" onClick={() => act("setOpen", { installmentId: i.id, open: !i.open })}>{i.open ? "Lock" : "Open"}</button>
                    <button className="btn s o" onClick={() => { const m = prompt("How was it paid? (e.g. bank transfer)", "bank transfer"); if (m !== null) act("markPaid", { installmentId: i.id, method: m }); }}>Mark paid</button>
                    <button className="btn s o" onClick={() => act("voidItem", { installmentId: i.id })}>Remove</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="tot">Paid <b>{money(inv.paid, inv.currency)}</b> of <b>{money(inv.total, inv.currency)}</b> · Balance <b>{money(inv.balance, inv.currency)}</b></p>

      {!admin && inv.canPayAll && (
        <button className="btn" disabled={!!busy} onClick={() => pay({ scope: "all" })}>
          {busy === "all" ? "Opening…" : `Pay the full remaining ${money(inv.balance, inv.currency)}`}
        </button>
      )}

      {admin && inv.status !== "void" && (
        <div className="admin-box">
          <label className="check"><input type="checkbox" checked={inv.sequential} onChange={(e) => act("settings", { sequential: e.target.checked })} /> Pay in order</label>
          <label className="check"><input type="checkbox" checked={inv.allowPayAll} onChange={(e) => act("settings", { allowPayAll: e.target.checked })} /> Allow paying the full balance at once</label>
          <div className="row">
            <button className="btn s" onClick={() => act("send")}>{inv.sent ? "Resend email to client" : "Send to client"}</button>
            <button className="btn s o" onClick={() => act("void")}>Cancel invoice</button>
            {inv.paid === 0 && <button className="btn s o" onClick={() => act("delete")}>Delete</button>}
          </div>
          {!inv.sent && <p className="mut small">Draft: the client can't see this invoice until you send it.</p>}
        </div>
      )}
    </article>
  );
}

export default function Billing({ clientId, admin }) {
  const [params, setParams] = useSearchParams();
  const { data: invoices, err, reload } = usePoll(() => api(`/invoices/${clientId}`), 8000, [clientId]);
  const [banner, setBanner] = useState(null);
  const [creating, setCreating] = useState(false);

  // Returning from the Stripe payment page
  useEffect(() => {
    // Stripe returns ?invoice=..&session_id=..; Paystack returns ?reference=<invoiceId>.<random>
    const sid = params.get("session_id") || params.get("reference") || params.get("trxref");
    const inv = params.get("invoice") || (sid ? sid.split(".")[0] : null);
    if (inv && sid) {
      api(`/invoices/${clientId}/${inv}/verify`, { method: "POST", body: { sessionId: sid } })
        .then(() => { setBanner({ ok: true, text: "Payment received. Thank you! A receipt is on its way to your email." }); reload(); })
        .catch((e) => setBanner({ ok: false, text: e.message }))
        .finally(() => setParams({}, { replace: true }));
    } else if (params.get("cancelled")) {
      setBanner({ ok: false, text: "Payment cancelled. You were not charged." });
      setParams({}, { replace: true });
    }
  }, []);

  return (
    <div>
      {banner && <p className={banner.ok ? "ok" : "alert"} role="status">{banner.text}</p>}
      {err && !invoices && <p className="alert">{err}</p>}
      {admin && !creating && <button className="btn s" onClick={() => setCreating(true)}>Create invoice</button>}
      {admin && creating && <CreateInvoice clientId={clientId} onDone={() => { setCreating(false); reload(); }} />}
      {invoices?.length === 0 && !creating && (
        <p className="mut">{admin ? "No invoices for this client yet." : "No invoices yet. Bills from Nettech will appear here."}</p>
      )}
      <div className="invs">
        {invoices?.map((inv) => (
          <InvoiceCard key={inv.id} inv={inv} clientId={clientId} admin={admin} reload={reload} setBanner={setBanner} />
        ))}
      </div>
    </div>
  );
}
