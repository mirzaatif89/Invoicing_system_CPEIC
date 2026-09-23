import { useState, type FormEvent } from "react";
import { BadgeCheck, CircleHelp, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../api";
type CheckerKind = "income" | "sales";
type FormState = { parameterType: string; registrationNo: string; date: string; captcha: string };
type IrisSession = { sessionId: string; captchaImage: string; expiresAt: string; source: string };
type IrisResult = { success: boolean; found?: boolean; captchaRejected: boolean; message: string; captchaImage?: string; printPdf?: string; source: string };
const latestIrisDate = () => { const date = new Date(); date.setDate(date.getDate() - 1); return date.toISOString().slice(0, 10); };
const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
function TaxChecker({ kind }: { kind: CheckerKind }) {
  const income = kind === "income";
  const [form, setForm] = useState<FormState>({ parameterType: "", registrationNo: "", date: latestIrisDate(), captcha: "" });
  const [session, setSession] = useState<IrisSession | null>(null);
  const [message, setMessage] = useState(""), [result, setResult] = useState<IrisResult | null>(null), [busy, setBusy] = useState(false);
  const set = (key: keyof FormState, value: string) => { setForm((current) => ({ ...current, [key]: value })); setMessage(""); setResult(null); if (key !== "captcha") setSession(null); };
  async function loadCaptcha() { setBusy(true); setMessage(""); setResult(null); try { const next = await post<IrisSession>("/fbr-portal/sessions", { kind, parameterType: form.parameterType, registrationNo: form.registrationNo, ...(income ? { date: form.date } : {}) }); setSession(next); setForm((current) => ({ ...current, captcha: "" })); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function refreshCaptcha() { if (!session) return loadCaptcha(); setBusy(true); setMessage(""); try { const next = await post<Pick<IrisSession, "captchaImage" | "expiresAt">>(`/fbr-portal/sessions/${session.sessionId}/refresh`); setSession({ ...session, ...next }); setForm((current) => ({ ...current, captcha: "" })); } catch (error) { setMessage((error as Error).message); setSession(null); } finally { setBusy(false); } }
  async function submit(event: FormEvent) { event.preventDefault(); if (!session) { await loadCaptcha(); return; } setBusy(true); setMessage(""); setResult(null); try { const next = await post<IrisResult>(`/fbr-portal/sessions/${session.sessionId}/verify`, { captcha: form.captcha }); setResult(next); if (next.captchaRejected && next.captchaImage) { setSession({ ...session, captchaImage: next.captchaImage }); setForm((current) => ({ ...current, captcha: "" })); } else setSession(null); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  function printResult() {
    if (!result) return;
    if (!result.printPdf) { setMessage("IRIS printable document was not returned. Please run the verification again."); return; }
    window.location.assign(result.printPdf);
  }
  return <form className="tax-checker-card" onSubmit={submit}>
    <div className="tax-checker-heading"><div className="tax-title-icon"><BadgeCheck /></div><div><h2>Active Taxpayer List ({income ? "Income Tax" : "Sales Tax"})</h2><p>Live check through the official IRIS portal</p></div><button type="button" className="tax-help" title="Your details are entered in a short-lived headless IRIS session. You solve IRIS's captcha here."><CircleHelp /></button></div>
    <div className="tax-fields"><label>Parameter Type<select value={form.parameterType} onChange={(event) => set("parameterType", event.target.value)} required><option value="">-- Select --</option><option value="NTN">NTN</option><option value="CNIC">CNIC</option>{income && <><option value="Passport No.">Passport No.</option><option value="Reg/Inc. No.">Reg/Inc. No.</option></>}</select></label><label>Registration No.<input value={form.registrationNo} onChange={(event) => set("registrationNo", event.target.value.replace(/[^A-Za-z0-9-]/g, ""))} placeholder="Enter registration number" required /></label>{income && <label>Date<input type="date" value={form.date} onChange={(event) => set("date", event.target.value)} required /></label>}</div>
    {session && <div className="captcha-row"><div className="captcha-image live"><img src={session.captchaImage} alt="Live IRIS captcha" /></div><button type="button" className="captcha-refresh" onClick={refreshCaptcha} disabled={busy} aria-label="Refresh IRIS captcha"><RefreshCw /></button><label>Captcha<input inputMode="numeric" value={form.captcha} onChange={(event) => set("captcha", event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Enter IRIS captcha" required autoFocus /></label></div>}
    {message && <div className="checker-message">{message}</div>}
    {result && <div className={`atl-result ${result.success && result.found !== false ? "active" : "inactive"}`}><div className="iris-result-head"><strong>{!result.success ? "CAPTCHA NOT ACCEPTED" : result.found === false ? "NO RECORD FOUND" : "IRIS RESPONSE"}</strong>{result.success && result.printPdf && <button type="button" className="iris-print-button" onClick={printResult}><Printer size={16} /> PRINT RESULT</button>}</div><pre>{result.message}</pre><div className="iris-result-links"><a href={result.source} target="_blank" rel="noreferrer">Open official IRIS portal</a></div></div>}
    <div className="tax-checker-actions"><button className="primary" type="submit" disabled={busy || (!!session && !form.captcha)}><ShieldCheck size={17} /> {busy ? "Working on IRIS…" : session ? "Verify on IRIS" : "Get IRIS Captcha"}</button></div>
  </form>;
}
export default function VendorFilerStatusChecker() { return <section><div className="page-head"><div><h1>FBR Status Checker</h1><p>Real-time status lookup through FBR's official IRIS portal.</p></div></div><div className="atl-source-note">Enter vendor details and load the live IRIS captcha. The backend keeps that exact IRIS browser session for 5 minutes; after you type the captcha, the result is returned here.</div><div className="tax-checker-grid"><TaxChecker kind="income" /><TaxChecker kind="sales" /></div></section>; }
