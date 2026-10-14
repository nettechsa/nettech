import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { usePoll } from "../usePoll";
import { STAGES } from "../content";
import ProjectView from "../components/portal/ProjectView";
import Invoices from "../components/admin/Invoices";
import Setup from "../components/admin/Setup";

const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function AddClient({ onAdded }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { id } = await api("/clients", { method: "POST", body: f });
      setF({ name: "", email: "", password: "" });
      setErr("");
      onAdded(id);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <form onSubmit={submit} className="panel form">
      <h3>Add a client</h3>
      <input required placeholder="Client name" aria-label="Client name" value={f.name} onChange={set("name")} />
      <input required type="email" placeholder="Client email" aria-label="Client email" value={f.email} onChange={set("email")} />
      <input required minLength="6" placeholder="Temporary password" aria-label="Temporary password" value={f.password} onChange={set("password")} />
      <button className="btn s">Create client account</button>
      {err && <p className="alert" role="alert">{err}</p>}
    </form>
  );
}

function AdminPortal() {
  const [tab, setTab] = useState("Clients");
  const [sel, setSel] = useState(null);
  const clients = usePoll(() => api("/clients"), 8000, []);
  const leads = usePoll(() => api("/leads"), 15000, []);
  const list = clients.data || [];
  const current = list.find((c) => c.id === sel);

  return (
    <main className="w page">
      <h1 className="h2">Admin dashboard</h1>
      <div className="tabs">
        {["Clients", "Invoices", "Leads", "Setup"].map((t) => (
          <button key={t} className={`btn s ${tab === t ? "" : "o"}`} onClick={() => setTab(t)}>
            {t}{t === "Leads" && leads.data?.length ? ` (${leads.data.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "Clients" && (
        <div className="admin-grid">
          <aside>
            <AddClient onAdded={(id) => { clients.reload(); setSel(id); }} />
            <div className="clients">
              {list.length === 0 && <p className="mut">No clients yet. Add your first client above.</p>}
              {list.map((c) => (
                <button key={c.id} className={`client ${sel === c.id ? "on" : ""}`} onClick={() => setSel(c.id)}>
                  <b>{c.name}</b>
                  <span className="mut small">{STAGES[c.project?.stage ?? 0]} · {c.project?.progress ?? 0}%</span>
                </button>
              ))}
            </div>
          </aside>
          <section>
            {current ? (
              <ProjectView key={current.id} clientId={current.id} admin clientName={current.name} />
            ) : (
              <p className="mut">Select a client to manage their project.</p>
            )}
          </section>
        </div>
      )}

      {tab === "Invoices" && <Invoices onOpen={(id) => { setSel(id); setTab("Clients"); }} />}
      {tab === "Setup" && <Setup />}

      {tab === "Leads" && (
        <div className="panel">
          {!leads.data?.length && <p className="mut">No enquiries yet. Messages from your contact form appear here.</p>}
          {leads.data?.map((l) => (
            <article key={l.id} className="lead">
              <b>{l.name}</b> <a href={`mailto:${l.email}`}>{l.email}</a>
              <span className="mut small"> · {when(l.t)}</span>
              <p>{l.message}</p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export default function Portal() {
  const { user } = useAuth();
  if (user.role === "admin") return <AdminPortal />;
  return (
    <main className="w page">
      <h1 className="h2">Welcome, {user.name}</h1>
      <ProjectView clientId={user.id} admin={false} clientName={user.name} />
    </main>
  );
}
