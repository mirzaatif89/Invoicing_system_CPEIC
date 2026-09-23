import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AccountCode } from "../api";
import ActionMenu from "../components/ActionMenu";

const pct = (value: number | string | undefined) => `${Number(value || 0).toLocaleString()}%`;
export default function AccountList() {
  const [items, setItems] = useState<AccountCode[]>([]), [search, setSearch] = useState(""), [error, setError] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false), [bulkBusy, setBulkBusy] = useState(false), [bulkError, setBulkError] = useState("");
  const [bulkForm, setBulkForm] = useState({ incomeTaxPercentCompany: 0, incomeTaxPercentIndividual: 0, salesTaxPercentCompany: 0, salesTaxPercentIndividual: 0 });
  async function load(query = search) { try { setItems((await api<{ data: AccountCode[] }>(`/account-codes?search=${encodeURIComponent(query)}&pageSize=100`)).data); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void load(""); }, []);
  async function remove(account: AccountCode) { if (!confirm(`Delete account ${account.code}?`)) return; try { await api(`/account-codes/${account.id}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); } }
  function printList() { window.print(); }
  async function applyBulk(event: FormEvent) {
    event.preventDefault();
    setBulkBusy(true);
    setBulkError("");
    try {
      await api("/account-codes/bulk-tax-rates", {
        method: "PUT",
        body: JSON.stringify(bulkForm),
      });
      setBulkOpen(false);
      await load("");
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }
  return <section><div className="page-head"><div><h1>Account Code List</h1><p>Chart of accounts and company/individual invoice tax rates</p></div><div className="page-actions no-print"><button className="button" type="button" onClick={printList}>Print List</button><button className="button" type="button" onClick={() => setBulkOpen(true)}>Updated Taxes</button><Link className="button primary" to="/management/account-codes/new">Add Account Code</Link></div></div><div className="card print-list"><div className="print-only"><h1>Account Code List</h1><p>Printed: {new Date().toLocaleString()}</p></div><form className="toolbar no-print" onSubmit={(e) => { e.preventDefault(); void load(); }}><input placeholder="Search by code or name" value={search} onChange={(e) => setSearch(e.target.value)} /><button>Search</button></form>{error && <div className="alert no-print">{error}</div>}<div className="table-wrap"><table><thead><tr><th>Code</th><th>Account Name</th><th>Category</th><th>Income Tax %<br />Co / Ind</th><th>Sales Tax %<br />Co / Ind</th><th className="no-print">Actions</th></tr></thead><tbody>{items.map((account) => <tr key={account.id}><td className="code">{account.code}</td><td>{account.name}</td><td>{account.category || "-"}</td><td>{pct(account.incomeTaxPercentCompany)} / {pct(account.incomeTaxPercentIndividual)}</td><td>{pct(account.salesTaxPercentCompany)} / {pct(account.salesTaxPercentIndividual)}</td><td className="no-print"><ActionMenu><Link to={`/management/account-codes/${account.id}/edit`}>Edit</Link><button className="danger" onClick={() => void remove(account)}>Delete</button></ActionMenu></td></tr>)}{!items.length && <tr><td colSpan={6} className="empty">No account codes found.</td></tr>}</tbody></table></div></div>{bulkOpen && <div className="lookup-backdrop" onMouseDown={() => setBulkOpen(false)}><div className="card lookup" onMouseDown={(e) => e.stopPropagation()}><div className="page-head"><div><h2>Updated Taxes</h2><p>Set one rate for all account codes at once</p></div><button type="button" onClick={() => setBulkOpen(false)}>Close</button></div>{bulkError && <div className="alert">{bulkError}</div>}<form className="legacy-form settings-form" onSubmit={applyBulk}><div className="tax-rate-grid"><strong></strong><strong>Company (Pvt Ltd)</strong><strong>Individual</strong><span>Income Tax %</span><input type="number" min="0" max="100" step="0.0001" value={bulkForm.incomeTaxPercentCompany} onChange={(e) => setBulkForm({ ...bulkForm, incomeTaxPercentCompany: Number(e.target.value) })} /><input type="number" min="0" max="100" step="0.0001" value={bulkForm.incomeTaxPercentIndividual} onChange={(e) => setBulkForm({ ...bulkForm, incomeTaxPercentIndividual: Number(e.target.value) })} /><span>Sales Tax %</span><input type="number" min="0" max="100" step="0.0001" value={bulkForm.salesTaxPercentCompany} onChange={(e) => setBulkForm({ ...bulkForm, salesTaxPercentCompany: Number(e.target.value) })} /><input type="number" min="0" max="100" step="0.0001" value={bulkForm.salesTaxPercentIndividual} onChange={(e) => setBulkForm({ ...bulkForm, salesTaxPercentIndividual: Number(e.target.value) })} /></div><div className="form-actions"><button type="button" className="button" onClick={() => setBulkOpen(false)}>Cancel</button><button className="primary" disabled={bulkBusy}>{bulkBusy ? "Updating…" : "Apply to All Account Codes"}</button></div></form></div></div>}</section>;
}
