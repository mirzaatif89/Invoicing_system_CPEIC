import { useState, type FormEvent } from "react";
import { api } from "../api";
export default function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); try { await api("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }); onLogin(username); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <div className="login-page"><form className="card login-card" onSubmit={submit}><img className="seal" src="/logo.png" alt="WIC institute logo" /><h1>Institute Accounts</h1><p className="muted">Sign in to continue</p>{error && <div className="alert">{error}</div>}<label>Username<input value={username} onChange={e => setUsername(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></label><button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</button></form></div>;
}
