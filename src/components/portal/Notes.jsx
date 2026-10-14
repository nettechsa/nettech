import { useEffect, useState } from "react";
import { api } from "../../api";

export default function Notes({ clientId }) {
  const [text, setText] = useState("");
  const [meta, setMeta] = useState(null);
  const [state, setState] = useState("loading");

  const load = async () => {
    const n = await api(`/notes/${clientId}`);
    setText(n.text);
    setMeta(n);
    setState("idle");
  };
  useEffect(() => { load().catch(() => setState("error")); }, [clientId]);

  const save = async () => {
    setState("saving");
    try {
      setMeta(await api(`/notes/${clientId}`, { method: "PUT", body: { text } }));
      setState("saved");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="panel">
      <p className="mut">Shared notes for ideas, links, content and requests. You and Nettech can both edit them.</p>
      <textarea rows="12" value={text} onChange={(e) => { setText(e.target.value); setState("idle"); }} aria-label="Shared notes" />
      <div className="row">
        <button className="btn s" onClick={save} disabled={state === "saving"}>Save notes</button>
        <button className="btn s o" onClick={() => load().catch(() => setState("error"))}>Load latest</button>
        {state === "saved" && <span className="ok">Saved</span>}
        {state === "error" && <span className="alert">Couldn't save. Try again.</span>}
        {meta?.t && <span className="mut small">Last saved by {meta.by} on {new Date(meta.t).toLocaleString()}</span>}
      </div>
    </div>
  );
}
