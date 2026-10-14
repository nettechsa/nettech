import { useState } from "react";
import { api } from "../../api";
import { usePoll } from "../../usePoll";

const Row = ({ ok, label, help }) => (
  <li className={ok ? "ok" : "alert"}><b>{ok ? "Ready" : "Not set up"}</b> · {label}{!ok && <span className="mut small"> · {help}</span>}</li>
);

export default function Setup() {
  const { data, reload } = usePoll(() => api("/admin/status"), 10000, []);
  const [msg, setMsg] = useState("");
  if (!data) return <p className="mut">Loading…</p>;

  const test = async () => {
    setMsg("Sending…");
    try {
      const e = await api("/admin/test-email", { method: "POST" });
      setMsg(e.status === "sent" ? "Test email sent. Check your inbox." : `Result: ${e.status}`);
    } catch (ex) {
      setMsg(ex.message);
    }
    reload();
  };

  return (
    <div className="panel">
      <h3>Launch checklist</h3>
      <ul className="check-list">
        <Row ok={data.mailMode !== "none"} label={`Email notifications (${data.mailMode === "relay" ? "Gmail relay" : data.mailMode === "smtp" ? "SMTP" : "not connected"})`} help="free hosting: set MAIL_WEBHOOK_URL and MAIL_WEBHOOK_SECRET. Your own computer: SMTP_USER and SMTP_PASS" />
        <Row ok={data.payments} label={`Card payments (${data.provider === "paystack" ? "Paystack" : "Stripe"})`} help={data.provider === "paystack" ? "add PAYSTACK_SECRET_KEY to .env" : "add STRIPE_SECRET_KEY to .env"} />
        <Row ok={data.storage === "postgres"} label="Permanent data storage (Postgres)" help="add DATABASE_URL to .env. Without it, data lives in a local file, which free hosts erase" />
        <Row ok={!/localhost/.test(data.appUrl)} label={`Public site address (${data.appUrl})`} help="set APP_URL to your real address" />
      </ul>
      {data.provider === "paystack" ? (
        <p className="mut small">Paystack webhook address (paste into Paystack, Settings, API Keys &amp; Webhooks): <b>{data.appUrl}/api/paystack/webhook</b></p>
      ) : (
        <p className="mut small">Stripe webhook address: <b>{data.appUrl}/api/stripe/webhook</b>{data.webhook ? "" : " (STRIPE_WEBHOOK_SECRET is not set yet)"}</p>
      )}
      <div className="row">
        <button className="btn s" onClick={test}>Send me a test email</button>
        {msg && <span className="mut">{msg}</span>}
      </div>

      <h3 className="h4">Recent emails</h3>
      {data.emails.length === 0 && <p className="mut">Nothing sent yet.</p>}
      <table className="tbl">
        <tbody>
          {data.emails.map((e) => (
            <tr key={e.id}>
              <td className="small">{new Date(e.t).toLocaleString()}</td>
              <td>{e.to}</td><td>{e.subject}</td>
              <td className={e.status === "sent" ? "ok small" : "alert small"}>{e.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
