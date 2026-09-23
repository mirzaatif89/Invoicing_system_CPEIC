import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type BudgetDocument, type BudgetType } from "../api";
import ActionMenu from "../components/ActionMenu";

export default function BudgetDocumentList() {
  const [documents, setDocuments] = useState<BudgetDocument[]>([]);
  const [filters, setFilters] = useState({ search: "", dateFrom: "", dateTo: "", budgetType: "" });
  const [error, setError] = useState("");
  async function load() {
    try {
      const query = new URLSearchParams({ pageSize: "100" });
      Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
      setDocuments((await api<{ data: BudgetDocument[] }>(`/budget-documents?${query}`)).data);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function remove(document: BudgetDocument) {
    if (!confirm(`Delete budget document ${document.documentNo}?`)) return;
    try { await api(`/budget-documents/${document.id}`, { method: "DELETE" }); await load(); }
    catch (e) { setError((e as Error).message); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void load(); }
  return <section><div className="page-head"><div><h1>Budget Documents & Edit</h1><p>Search, review and update budget documents</p></div><Link className="button primary" to="/transactions/budgets/new">New Budget Document</Link></div><div className="card">
    <form className="invoice-filters" onSubmit={submit}><input placeholder="Document #" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /><input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /><select value={filters.budgetType} onChange={(event) => setFilters({ ...filters, budgetType: event.target.value as BudgetType | "" })}><option value="">All budget types</option><option>Original</option><option>Revised</option><option>Supplementary</option></select><button>Search</button></form>
    {error && <div className="alert">{error}</div>}<div className="table-wrap"><table><thead><tr><th>Document #</th><th>Date</th><th>Budget Type</th><th>Account Codes</th><th>Details</th><th>Total Amount</th><th>Actions</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td>{document.documentNo}</td><td>{document.date.slice(0, 10)}</td><td>{document.budgetType}</td><td className="code">{document.items.map((item) => item.accountCode.code).join(", ")}</td><td>{document.details || "—"}</td><td>PKR {document.items.reduce((sum, item) => sum + Number(item.amount), 0).toLocaleString()}</td><td><ActionMenu><Link to={`/transactions/budgets/${document.id}/edit`}>Edit</Link><button className="danger" onClick={() => void remove(document)}>Delete</button></ActionMenu></td></tr>)}{!documents.length && <tr><td colSpan={7} className="empty">No budget documents found.</td></tr>}</tbody></table></div>
  </div></section>;
}
