import { useState } from "react";
import { api } from "../../api";

export default function Preview({ clientId, admin, project, reload }) {
  const [width, setWidth] = useState("100%");
  const [url, setUrl] = useState(project.previewUrl || "");
  const [err, setErr] = useState("");

  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/projects/${clientId}`, { method: "PUT", body: { previewUrl: url } });
      setErr("");
      reload();
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <div className="panel">
      <div className="row">
        <button className={`btn s ${width === "100%" ? "" : "o"}`} onClick={() => setWidth("100%")}>Desktop</button>
        <button className={`btn s ${width === "390px" ? "" : "o"}`} onClick={() => setWidth("390px")}>Mobile</button>
        {project.previewUrl && (
          <a className="btn s o" href={project.previewUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a>
        )}
      </div>

      {admin && (
        <form onSubmit={save} className="row">
          <input placeholder="https:// link to the in-progress site" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn s">Save link</button>
        </form>
      )}
      {err && <p className="alert">{err}</p>}

      {project.previewUrl ? (
        <iframe title="Website preview" src={project.previewUrl} style={{ width }} />
      ) : (
        <p className="mut">Your site preview appears here as soon as the first build is ready.</p>
      )}
      <p className="mut small">If the preview stays blank, the site blocks embedding. Use "Open in new tab".</p>
    </div>
  );
}
