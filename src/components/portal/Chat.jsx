import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { usePoll } from "../../usePoll";

const when = (t) => new Date(t).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

export default function Chat({ clientId, admin }) {
  const { data: msgs, reload } = usePoll(() => api(`/messages/${clientId}`), 3000, [clientId]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const box = useRef(null);
  const me = admin ? "admin" : "client";

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs?.length]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await api(`/messages/${clientId}`, { method: "POST", body: { text: t } });
      setErr("");
      reload();
    } catch (ex) {
      setErr(ex.message);
      setText(t);
    }
  };

  return (
    <div className="panel">
      <div className="chat" ref={box} aria-live="polite">
        {msgs && msgs.length === 0 && <p className="mut">No messages yet. Say hello and we'll reply here.</p>}
        {msgs?.map((m) => (
          <div key={m.id} className={`msg ${m.from === me ? "me" : ""}`}>
            <small>{m.from === "admin" ? "Nettech" : m.name} · {when(m.t)}</small>
            {m.text}
          </div>
        ))}
      </div>
      {err && <p className="alert">{err}</p>}
      <form onSubmit={send} className="row">
        <input placeholder="Type a message" aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn s">Send</button>
      </form>
    </div>
  );
}
