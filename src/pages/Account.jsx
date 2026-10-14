import { useEffect, useState } from "react";
import { api } from "../api";

export default function Account() {
  const [me, setMe] = useState(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [msg, setMsg] = useState(null);

  useEffect(() => { api("/me").then(setMe).catch(() => {}); }, []);
  if (!me) return <p className="w page mut">Loading…</p>;

  const toggle = async (e) => setMe(await api("/me/prefs", { method: "PUT", body: { notify: e.target.checked } }));
  const change = async (e) => {
    e.preventDefault();
    try {
      await api("/me/password", { method: "PUT", body: pw });
      setPw({ current: "", next: "" });
      setMsg({ ok: true, text: "Password changed." });
    } catch (ex) {
      setMsg({ ok: false, text: ex.message });
    }
  };

  return (
    <main className="w page narrow">
      <h1 className="h2">Account</h1>
      <p className="mut">{me.name} · {me.email}</p>

      <div className="panel">
        <h3>Email notifications</h3>
        <label className="check">
          <input type="checkbox" checked={me.notify} onChange={toggle} />
          Email me about messages, project updates, invoices and payments
        </label>
      </div>

      <form onSubmit={change} className="panel form" style={{ marginTop: 18 }}>
        <h3>Change password</h3>
        <label>Current password<input type="password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></label>
        <label>New password (8+ characters)<input type="password" required minLength="8" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></label>
        <button className="btn s">Change password</button>
        {msg && <p className={msg.ok ? "ok" : "alert"} role="status">{msg.text}</p>}
      </form>
    </main>
  );
}
