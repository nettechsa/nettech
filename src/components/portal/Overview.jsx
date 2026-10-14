import { useState } from "react";
import { api } from "../../api";
import { STAGES } from "../../content";

const when = (t) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function AdminControls({ clientId, project, reload }) {
  const [f, setF] = useState({ title: project.title, stage: project.stage, progress: project.progress });
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const save = async () => {
    await api(`/projects/${clientId}`, { method: "PUT", body: f });
    setMsg("Changes saved");
    reload();
    setTimeout(() => setMsg(""), 2000);
  };
  const post = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await api(`/projects/${clientId}/updates`, { method: "POST", body: { text } });
    setText("");
    reload();
  };

  return (
    <div className="admin-box">
      <div className="three">
        <label>Project title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label>Stage
          <select value={f.stage} onChange={(e) => setF({ ...f, stage: Number(e.target.value) })}>
            {STAGES.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>
        </label>
        <label>Progress: {f.progress}%
          <input type="range" min="0" max="100" value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} />
        </label>
      </div>
      <div className="row">
        <button className="btn s" onClick={save}>Save changes</button>
        {msg && <span className="ok">{msg}</span>}
      </div>
      <form onSubmit={post} className="row">
        <input placeholder="Write a status update for the client" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn s">Post update</button>
      </form>
    </div>
  );
}

export default function Overview({ clientId, admin, project, reload }) {
  const [approved, setApproved] = useState(false);

  const approve = async () => {
    await api(`/projects/${clientId}/approve`, { method: "POST" });
    setApproved(true);
  };

  return (
    <div className="panel">
      <h3>{project.title}</h3>
      <div className="prog" role="progressbar" aria-valuenow={project.progress} aria-valuemin="0" aria-valuemax="100">
        <div style={{ width: `${project.progress}%` }} />
      </div>
      <p className="mut small">{project.progress}% complete</p>

      <div className="stages">
        {STAGES.map((s, i) => (
          <span key={s} className={i < project.stage ? "d" : i === project.stage ? "c" : ""}>{s}</span>
        ))}
      </div>

      {admin && <AdminControls key={clientId} clientId={clientId} project={project} reload={reload} />}

      {!admin && (
        <div className="row">
          <button className="btn s" onClick={approve} disabled={approved}>
            {approved ? "Approval sent" : `Approve the ${STAGES[project.stage]} stage`}
          </button>
        </div>
      )}

      <h3 className="h4">Status updates</h3>
      {project.updates.length === 0 && <p className="mut">No updates yet. Your first update will appear here.</p>}
      {project.updates.map((u) => (
        <div key={u.id} className="upd">
          <span className="mut small">{when(u.t)}</span>
          <p>{u.text}</p>
        </div>
      ))}
    </div>
  );
}
