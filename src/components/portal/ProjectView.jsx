import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { usePoll } from "../../usePoll";
import { FAQ } from "../../content";
import Overview from "./Overview";
import Preview from "./Preview";
import Chat from "./Chat";
import Notes from "./Notes";
import Bot from "./Bot";
import Billing from "./Billing";

const TABS = ["Overview", "Preview", "Billing", "Chat", "Notes", "FAQ", "Assistant"];

export default function ProjectView({ clientId, admin, clientName }) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("invoice") || params.get("reference") || params.get("cancelled") ? "Billing" : "Overview");
  const { data: project, err, reload } = usePoll(() => api(`/projects/${clientId}`), 5000, [clientId]);

  if (err && !project) return <p className="alert">{err}</p>;
  if (!project) return <p className="mut">Loading project…</p>;

  return (
    <div>
      {admin && <h2 className="h3">{clientName}</h2>}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`btn s ${tab === t ? "" : "o"}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <Overview clientId={clientId} admin={admin} project={project} reload={reload} />}
      {tab === "Preview" && <Preview clientId={clientId} admin={admin} project={project} reload={reload} />}
      {tab === "Billing" && <Billing clientId={clientId} admin={admin} />}
      {tab === "Chat" && <Chat clientId={clientId} admin={admin} />}
      {tab === "Notes" && <Notes clientId={clientId} />}
      {tab === "FAQ" && (
        <div className="panel">
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p className="mut">{a}</p></details>
          ))}
        </div>
      )}
      {tab === "Assistant" && <Bot project={project} />}
    </div>
  );
}
