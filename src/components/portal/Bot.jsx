import { useEffect, useRef, useState } from "react";
import { botReply } from "../../bot";

const IDEAS = ["What's my project status?", "How long does it take?", "Can I request changes?"];

export default function Bot({ project }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log.length]);

  const ask = (text) => {
    const question = text.trim();
    if (!question) return;
    setLog((l) => [...l, { me: true, text: question }]);
    setQ("");
    setTimeout(() => setLog((l) => [...l, { me: false, text: botReply(question, project) }]), 400);
  };

  return (
    <div className="panel">
      <div className="chat" ref={box} aria-live="polite">
        {log.length === 0 && <p className="mut">Ask about your project, timelines or how the portal works.</p>}
        {log.map((m, i) => <div key={i} className={`msg ${m.me ? "me" : ""}`}>{m.text}</div>)}
      </div>
      <div className="row wrap">
        {IDEAS.map((i) => <button key={i} className="btn s o" onClick={() => ask(i)}>{i}</button>)}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="row">
        <input placeholder="Ask the assistant" aria-label="Question" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn s">Ask</button>
      </form>
    </div>
  );
}
