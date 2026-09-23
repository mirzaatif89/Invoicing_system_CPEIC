import { useEffect, useState } from "react";
import { api } from "../api";

type Cheque = { id: number; chequeNo: string; chequeDate?: string | null; amount: number; recipientName?: string | null; label?: string | null; accountCode: { code: string; name: string }; poNumbers: string[] };
type Schedule = { id: number; serialNo: number; date: string; daoReferenceNo?: string | null; daoReferenceDate?: string | null; chequeCount: number; totalAmount: number };
const money = (value: number) => `PKR ${Math.round(value).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function ChequeAuthoritySchedulePage() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const [available, existing] = await Promise.all([
        api<{ data: Cheque[] }>("/cheque-schedules/unscheduled-cheques"),
        api<{ data: Schedule[] }>("/cheque-schedules"),
      ]);
      setCheques(available.data); setSchedules(existing.data); setSelected((current) => current.filter((id) => available.data.some((cheque) => cheque.id === id))); setError("");
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);
  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const create = async () => {
    if (!selected.length) { setError("Select at least one cheque for this schedule."); return; }
    try { setBusy(true); await api("/cheque-schedules", { method: "POST", body: JSON.stringify({ date, chequeIds: selected }) }); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const updateDao = async (schedule: Schedule, daoReferenceNo: string, daoReferenceDate: string) => {
    try { await api(`/cheque-schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify({ daoReferenceNo: daoReferenceNo || null, daoReferenceDate: daoReferenceDate || null }) }); await load(); } catch (e) { setError((e as Error).message); }
  };
  return <section>
    <div className="page-head"><div><h1>Schedule of Assignment Account Cheques</h1><p>Create an official cheque authority schedule for forwarding to the bank.</p></div></div>
    {error && <div className="alert">{error}</div>}
    <div className="card"><div className="page-head"><div><h2>Create New Schedule</h2><p>Select unassigned cheques to include in one bank-forwarding schedule.</p></div><label>Schedule Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      <div className="table-wrap"><table><thead><tr><th><input aria-label="Select all cheques" type="checkbox" checked={cheques.length > 0 && selected.length === cheques.length} onChange={(event) => setSelected(event.target.checked ? cheques.map((cheque) => cheque.id) : [])} /></th><th>Cheque No.</th><th>Date</th><th>PO No.</th><th>Payee</th><th>Purpose</th><th>Account Code</th><th>Amount</th></tr></thead><tbody>{cheques.map((cheque) => <tr key={cheque.id}><td><input aria-label={`Select cheque ${cheque.chequeNo}`} type="checkbox" checked={selected.includes(cheque.id)} onChange={() => toggle(cheque.id)} /></td><td>{cheque.chequeNo}</td><td>{cheque.chequeDate?.slice(0, 10) || "-"}</td><td>{cheque.poNumbers.join(", ") || "-"}</td><td>{cheque.recipientName || "-"}</td><td>{cheque.label || "-"}</td><td>{cheque.accountCode.code} — {cheque.accountCode.name}</td><td>{money(cheque.amount)}</td></tr>)}{!cheques.length && <tr><td className="empty" colSpan={8}>No unscheduled cheques are available.</td></tr>}</tbody></table></div>
      <div className="form-actions"><span>{selected.length} cheque(s) selected</span><button className="primary" disabled={busy || !selected.length} onClick={() => void create()}>{busy ? "Creating…" : "Create Schedule"}</button></div>
    </div>
    <div className="card"><div className="page-head"><div><h2>Existing Schedules</h2><p>Print schedules and enter DAO reference details after processing.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Schedule No.</th><th>Date</th><th>Cheques</th><th>Total Amount</th><th>DAO Reference No.</th><th>DAO Reference Date</th><th>Actions</th></tr></thead><tbody>{schedules.map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule} onSave={updateDao} />)}{!schedules.length && <tr><td className="empty" colSpan={7}>No cheque authority schedules created yet.</td></tr>}</tbody></table></div>
    </div>
  </section>;
}

function ScheduleRow({ schedule, onSave }: { schedule: Schedule; onSave: (schedule: Schedule, no: string, date: string) => Promise<void> }) {
  const [referenceNo, setReferenceNo] = useState(schedule.daoReferenceNo || "");
  const [referenceDate, setReferenceDate] = useState(schedule.daoReferenceDate?.slice(0, 10) || "");
  return <tr><td>#{schedule.serialNo}</td><td>{schedule.date.slice(0, 10)}</td><td>{schedule.chequeCount}</td><td>{money(schedule.totalAmount)}</td><td><input value={referenceNo} placeholder="Enter DAO reference" onChange={(event) => setReferenceNo(event.target.value)} /></td><td><input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} /></td><td><button className="button" onClick={() => void onSave(schedule, referenceNo, referenceDate)}>Save DAO</button><button className="button" onClick={() => window.open(`/api/cheque-schedules/${schedule.id}?format=pdf`, "_blank", "noopener,noreferrer")}>Print / View PDF</button></td></tr>;
}
