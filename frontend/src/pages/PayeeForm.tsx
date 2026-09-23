import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Payee, type VendorType } from "../api";

const empty = { code: "", name: "", address_line_1: "", address_line_2: "", phone: "", itax_no: "", vendorType: "INDIVIDUAL" as VendorType, taxpayerStatus: "NORMAL", validUntil: "", taxStatusEntryId: null as number | null };

export default function PayeeForm() {
  const { id } = useParams(), navigate = useNavigate();
  const [form, setForm] = useState(empty), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id) Promise.all([api<Payee>(`/payees/${id}`),api<{ data: Array<{ id:number; status:"ACTIVE"|"INACTIVE"; validUntil?:string|null }> }>(`/payees/${id}/tax-status`)]).then(([x,history]) => { const current=history.data[0]; setForm({ code: x.code, name: x.name, address_line_1: x.addressLine1 || "", address_line_2: x.addressLine2 || "", phone: x.phone || "", itax_no: x.itaxNo || "", vendorType: x.vendorType || "INDIVIDUAL", taxpayerStatus: current?.status || "NORMAL", validUntil: current?.validUntil ? String(current.validUntil).slice(0,10) : "", taxStatusEntryId: current?.id || null }); }).catch((e: Error) => setError(e.message));
    else api<{ code: string }>("/payees/next-code").then((x) => setForm((current) => ({ ...current, code: x.code }))).catch((e: Error) => setError(e.message));
  }, [id]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const saved=await api<Payee>(id ? `/payees/${id}` : "/payees", { method: id ? "PUT" : "POST", body: JSON.stringify(form) }); if(form.taxpayerStatus!=="NORMAL"){const payload={status:form.taxpayerStatus,effectiveFrom:new Date().toISOString().slice(0,10),validUntil:form.validUntil||null};await api(form.taxStatusEntryId?`/payees/tax-status/${form.taxStatusEntryId}`:`/payees/${saved.id}/tax-status`,{method:form.taxStatusEntryId?"PUT":"POST",body:JSON.stringify(payload)})}; navigate("/management/payees"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function remove() { if (!id || !confirm("Are you sure you want to delete this payee?")) return; try { await api(`/payees/${id}`, { method: "DELETE" }); navigate("/management/payees"); } catch (e) { setError((e as Error).message); } }
  return <section><div className="page-head"><div><h1>{id ? "Payee Code Edit" : "Payee Code Making"}</h1><p>Vendor details and company/individual tax classification</p></div></div><form className="card legacy-form" onSubmit={submit}>{error && <div className="alert">{error}</div>}
    <label>Code No.<input readOnly value={form.code} /></label>
    <label>Account Name *<input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>Vendor Type *<select required value={form.vendorType} onChange={(e) => setForm({ ...form, vendorType: e.target.value as VendorType })}><option value="COMPANY">Company (Pvt Ltd)</option><option value="INDIVIDUAL">Individual</option></select></label>
    <label>Address Line 1<input maxLength={1000} value={form.address_line_1} onChange={(e) => setForm({ ...form, address_line_1: e.target.value })} /></label>
    <label>Address Line 2<input maxLength={1000} value={form.address_line_2} onChange={(e) => setForm({ ...form, address_line_2: e.target.value })} /></label>
    <label>Phone No.<input maxLength={30} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
    <label>I.Tax #<input maxLength={100} value={form.itax_no} onChange={(e) => setForm({ ...form, itax_no: e.target.value })} /></label>
    <label>Tax Status<select value={form.taxpayerStatus} onChange={(e) => setForm({ ...form, taxpayerStatus: e.target.value })}><option value="NORMAL">Normal</option><option value="ACTIVE">Active Taxpayer</option><option value="INACTIVE">Inactive Taxpayer</option></select></label>
    <label>Active Until<input type="date" value={form.validUntil} disabled={form.taxpayerStatus!=="ACTIVE"} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /><small className="muted">After this date Active status automatically becomes Inactive.</small></label>
    <div className="form-actions"><Link className="button" to="/management/payees">Cancel</Link>{id && <button type="button" className="danger-button" onClick={() => void remove()}>Delete</button>}<button className="primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button></div>
  </form></section>;
}
