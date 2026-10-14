import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { FAQ, PACKAGES, SERVICES, STAGES, STEPS, WHY } from "../content";

function Contact() {
  const [f, setF] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState({ type: "", text: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/leads", { method: "POST", body: f });
      setF({ name: "", email: "", message: "" });
      setStatus({ type: "ok", text: "Thanks! We got your message and will reply by email soon." });
    } catch (err) {
      setStatus({ type: "alert", text: err.message });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="form">
      <label>Your name<input required value={f.name} onChange={set("name")} autoComplete="name" /></label>
      <label>Email<input required type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
      <label>What do you want to build?<textarea required rows="5" value={f.message} onChange={set("message")} /></label>
      <button className="btn" disabled={busy}>{busy ? "Sending…" : "Send enquiry"}</button>
      {status.text && <p className={status.type} role="status">{status.text}</p>}
    </form>
  );
}

export default function Home() {
  useEffect(() => {
    document.title = "Nettech | Custom Web Development That Grows Your Business";
  }, []);

  return (
    <main>
      <header className="hero">
        <div className="w hero-grid">
          <div>
            <h1>Your website should bring in customers while you sleep.</h1>
            <p className="lead">
              Nettech designs and builds fast, modern, search-ready websites and web apps. Every client gets a private
              portal to watch the build happen, chat with us and sign off each stage.
            </p>
            <div className="cta">
              <a className="btn" href="#contact">Start your project</a>
              <a className="btn o" href="#process">See how it works</a>
            </div>
            <ul className="chips">{WHY.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>

          <div className="mock" aria-hidden="true">
            <div className="mock-bar"><i /><i /><i /><span>yourbusiness.com</span></div>
            <div className="mock-body">
              <div className="sk a" />
              <div className="sk" style={{ width: "92%" }} />
              <div className="sk" style={{ width: "70%" }} />
              <div className="mock-tiles"><div /><div /><div /></div>
              <div className="prog"><div style={{ width: "72%" }} /></div>
              <p className="mut small">Build in progress, 72% complete</p>
            </div>
          </div>
        </div>
      </header>

      <section id="services" className="sec">
        <div className="w">
          <h2>What we build</h2>
          <p className="mut sub">Everything your business needs to look credible, load fast and get found.</p>
          <dl className="list">
            {SERVICES.map(([t, d]) => (
              <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section id="process" className="sec alt">
        <div className="w">
          <h2>From first call to launch day</h2>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}><span className="num">{i + 1}</span><h3>{t}</h3><p className="mut">{d}</p></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec">
        <div className="w split">
          <div>
            <h2>See your project move forward</h2>
            <p className="mut">
              Your client portal shows a live progress bar, status updates and a preview of your site as it is built.
              Chat with us, keep shared notes, approve each stage and ask the built-in assistant anything, any time.
            </p>
            <Link className="btn o" to="/login">Open the portal</Link>
          </div>
          <div className="panel">
            <div className="stages">
              {STAGES.map((s, i) => <span key={s} className={i < 2 ? "d" : i === 2 ? "c" : ""}>{s}</span>)}
            </div>
            <div className="prog"><div style={{ width: "58%" }} /></div>
            <p className="mut small">Latest update: homepage layout approved, now building the services pages.</p>
          </div>
        </div>
      </section>

      <section id="packages" className="sec alt">
        <div className="w">
          <h2>Pick a starting point</h2>
          <p className="mut sub">Every project is scoped to you. Tell us what you need and we'll send a clear quote.</p>
          <div className="pk">
            {PACKAGES.map(([t, s, d], i) => (
              <article key={t} className={i === 1 ? "feat" : ""}>
                <h3>{t}</h3>
                <p><b>{s}</b></p>
                <p className="mut">{d}</p>
                <a className="btn s" href="#contact">Ask for a quote</a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="sec">
        <div className="w narrow">
          <h2>Questions people ask first</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p className="mut">{a}</p></details>
          ))}
        </div>
      </section>

      <section id="contact" className="sec alt">
        <div className="w narrow">
          <h2>Tell us about your project</h2>
          <p className="mut sub">We reply within one business day.</p>
          <Contact />
        </div>
      </section>
    </main>
  );
}
