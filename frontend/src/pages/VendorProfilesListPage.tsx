import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Payee } from "../api";

export default function VendorProfilesListPage() {
  const [items, setItems] = useState<Payee[]>([]), [search, setSearch] = useState(""), [error, setError] = useState("");
  const load = async (query = search) => { try { setItems((await api<{ data: Payee[] }>(`/payees?search=${encodeURIComponent(query)}&pageSize=100`)).data); setError(""); } catch (err) { setError((err as Error).message); } };
  useEffect(() => { void load(""); }, []);
  return <section><div className="page-head"><div><h1>Vendor Profiles</h1><p>Search vendors and review their payment history.</p></div></div><div className="card">
    <form className="toolbar" onSubmit={(event) => { event.preventDefault(); void load(); }}><input placeholder="Search by vendor code or name" value={search} onChange={(event) => setSearch(event.target.value)} /><button>Search</button></form>
    {error && <div className="alert">{error}</div>}<div className="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Vendor Type</th><th>Phone</th><th>Action</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="code">{item.code}</td><td>{item.name}</td><td>{item.vendorType}</td><td>{item.phone || "-"}</td><td><Link className="button" to={`/management/payees/${item.id}/profile`}>View Profile</Link></td></tr>)}{items.length === 0 && <tr><td className="empty" colSpan={5}>No vendors found.</td></tr>}</tbody></table></div>
  </div></section>;
}
