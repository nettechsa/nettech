import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/portal" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(email, password);
      nav("/portal");
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  return (
    <main className="w page narrow">
      <h1 className="h2">Sign in to your portal</h1>
      <p className="mut">Use the email and password Nettech gave you.</p>
      <form onSubmit={submit} className="form">
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        {err && <p className="alert" role="alert">{err}</p>}
      </form>
    </main>
  );
}
