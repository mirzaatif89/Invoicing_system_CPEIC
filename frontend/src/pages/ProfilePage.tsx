import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";

type User = { id: number; username: string; role: "ADMIN" | "ACCOUNTANT" | "USER" };

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => { void api<{ user: User }>("/auth/me").then((result) => setUser(result.user)).catch((e: Error) => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (form.newPassword !== form.confirm) { setError("New passwords do not match."); return; }
    try { await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) }); setForm({ currentPassword: "", newPassword: "", confirm: "" }); setMessage("Password changed successfully."); } catch (e) { setError((e as Error).message); }
  }
  return <section><div className="page-head"><div><h1>Profile</h1><p>View your account details and update your password.</p></div></div><div className="card settings-form">
    <div className="profile-summary"><strong>{user?.username || "Loading…"}</strong><span>{user?.role || ""}</span></div>
    {error && <div className="alert">{error}</div>}{message && <div className="success">{message}</div>}
    <form onSubmit={save}><label>Current Password<input type="password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} required /></label><label>New Password<input type="password" minLength={8} value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} required /></label><label>Confirm New Password<input type="password" minLength={8} value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} required /></label><button className="primary">Update Password</button></form>
  </div></section>;
}
