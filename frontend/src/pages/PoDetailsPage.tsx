import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

type ChequeSupply = { id: number; dcNumber: string | null; amount: number | string; incomeTax: number | string; salesTax: number | string; ldCharges: number | string; shelfLifeDeduction: number | string; chequeNo: string | null; chequePaid: boolean; invoiceItemId: number | null; payee: { code: string; name: string }; invoice: { id: number; serialNo: number; date: string } };
type InvoicePo = { poNumber: string; netTotal: number; paidAmount: number; supplies: ChequeSupply[] };
type Supply = { id: number; poNumber: string; poDate: string; createdAt: string; accountCodeId: number; payeeId: number; dcNumber: string | null; amount: number | string; deliveryDays: number | null; gracePeriodDays: number | null; manualLdAmount: number | string; manualShelfLifeAmount: number | string; actualDeliveryDate: string | null; manufacturingDate: string | null; expiryDate: string | null; itemType: "IMPORTED" | "LOCAL" | "MEDICINE" | "DISPOSABLE"; itemTypes: string[] | null; procurementMode: "TENDER" | "QUOTATION" | null; payee: { code: string; name: string }; contingentInvoice: { id: number } | null };
type HistoryPo = { poNumber: string; entryDate: string; totalDcs: number; grossTotal: number; paidAmount: number; pendingAmount: number; supplies: ChequeSupply[] };

const money = (value: number | string) => `PKR ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayDate = (value: string) => new Date(value).toLocaleDateString("en-GB");

export default function PoDetailsPage() {
  const nav = useNavigate();
  const [query] = useSearchParams();
  const [search, setSearch] = useState(() => query.get("po") || "");
  const [invoiceRows, setInvoiceRows] = useState<InvoicePo[]>([]);
  const [allSupplies, setAllSupplies] = useState<Supply[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [invoices, supplies] = await Promise.all([
        api<{ data: InvoicePo[] }>(`/invoices/po-details?search=${encodeURIComponent(search)}`),
        api<{ data: Supply[] }>(`/po-supplies?poNumber=${encodeURIComponent(search)}`),
      ]);
      setInvoiceRows(invoices.data); setAllSupplies(supplies.data); setSelected([]); setError("");
    } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const generate = async () => { try { const result = await api<{ id: number }>("/invoices/create-contingent-from-supplies", { method: "POST", body: JSON.stringify({ supplyIds: selected }) }); nav(`/transactions/contingent-bills/${result.id}/edit`); } catch (e) { setError((e as Error).message); } };
  const edit = async (supply: Supply) => { const dcNumber = prompt("DC No.", supply.dcNumber || ""); if (dcNumber === null) return; const amount = prompt("Amount", String(supply.amount)); if (amount === null) return; try { await api(`/po-supplies/${supply.id}`, { method: "PUT", body: JSON.stringify({ ...supply, dcNumber, amount: Number(amount) }) }); await load(); } catch (e) { setError((e as Error).message); } };
  const deleteSupply = async (supply: Supply) => { if (!confirm(`Delete DC ${supply.dcNumber || "-"}?`)) return; try { await api(`/po-supplies/${supply.id}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); } };
  const deleteBill = async (supply: ChequeSupply) => { if (!confirm(`Delete Contingent Bill ${supply.invoice.serialNo}?`)) return; try { await api(`/invoices/${supply.invoice.id}`, { method: "DELETE" }); await load(); } catch (e) { setError((e as Error).message); } };

  const history: HistoryPo[] = [...new Set(allSupplies.map((supply) => supply.poNumber))].map((poNumber) => {
    const supplies = allSupplies.filter((supply) => supply.poNumber === poNumber);
    const invoice = invoiceRows.find((row) => row.poNumber === poNumber);
    const grossTotal = supplies.reduce((sum, supply) => sum + Number(supply.amount), 0);
    const payableTotal = invoice?.netTotal ?? grossTotal;
    const paidAmount = invoice?.paidAmount ?? 0;
    return { poNumber, entryDate: supplies.reduce((earliest, supply) => supply.createdAt < earliest ? supply.createdAt : earliest, supplies[0].createdAt), totalDcs: supplies.length, grossTotal, paidAmount, pendingAmount: Math.max(0, payableTotal - paidAmount), supplies: invoice?.supplies ?? [] };
  }).sort((left, right) => right.entryDate.localeCompare(left.entryDate));

  return <section><div className="page-head"><div><h1>PO Details</h1><p>Complete PO history with supply, payment and pending balances.</p></div></div><div className="card">
    {error && <div className="alert">{error}</div>}
    <div className="filter-row"><input placeholder="Search PO No." value={search} onChange={(event) => setSearch(event.target.value)} /><button className="primary" onClick={() => void load()}>Search</button></div>
    <div className="table-wrap"><table><thead><tr><th>Date Entered</th><th>PO No.</th><th>Vendor</th><th>Total DCs</th><th>Gross Amount</th><th>Paid Amount</th><th>Pending Amount</th><th>Actions</th></tr></thead><tbody>
      {history.map((group) => { const pending = allSupplies.filter((supply) => supply.poNumber === group.poNumber && !supply.contingentInvoice); return <>
        <tr key={group.poNumber}><td>{displayDate(group.entryDate)}</td><td><b>{group.poNumber}</b></td><td>{(() => { const vendor = allSupplies.find((supply) => supply.poNumber === group.poNumber)?.payee; return vendor ? `${vendor.code} — ${vendor.name}` : "-"; })()}</td><td>{group.totalDcs}</td><td>{money(group.grossTotal)}</td><td>{money(group.paidAmount)}</td><td>{money(group.pendingAmount)}</td><td><button onClick={() => nav(`/management/payees/${allSupplies.find((supply) => supply.poNumber === group.poNumber)?.payeeId}/profile`)}>View Vendor</button></td></tr>
        {open === group.poNumber && <tr key={`${group.poNumber}-details`}><td colSpan={7}><div className="po-detail-panel"><h3>Pending Supply Orders — select DCs</h3>
          {pending.length ? <><table><thead><tr><th>Select</th><th>Vendor</th><th>DC No.</th><th>PO Date</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{pending.map((supply) => <tr key={supply.id}><td><input type="checkbox" checked={selected.includes(supply.id)} onChange={() => toggle(supply.id)} /></td><td>{supply.payee.code} — {supply.payee.name}</td><td>{supply.dcNumber || "-"}</td><td>{supply.poDate.slice(0, 10)}</td><td>{money(supply.amount)}</td><td><button onClick={() => void edit(supply)}>Edit</button><button className="danger" onClick={() => void deleteSupply(supply)}>Delete</button></td></tr>)}</tbody></table><button className="primary" disabled={!selected.length} onClick={() => void generate()}>Generate Contingent Bill ({selected.length})</button></> : <p className="empty-state">No pending supply orders. Add a new DC from PO Supply Entry to generate another contingent bill.</p>}
          <h3>Generated Contingent Bills & Cheques</h3><div className="po-supply-list"><table><thead><tr><th>Bill</th><th>Vendor</th><th>DC No.</th><th>Cheque</th><th>Status</th><th>Gross</th><th>Net</th><th>Actions</th></tr></thead><tbody>{group.supplies.map((supply) => <tr key={supply.id}><td>{supply.invoice.serialNo}</td><td>{supply.payee.code} — {supply.payee.name}</td><td>{supply.dcNumber || "-"}</td><td>{supply.chequeNo || "No cheque"}</td><td>{supply.chequePaid ? "Paid" : "Unpaid"}</td><td>{money(supply.amount)}</td><td>{money(Number(supply.amount) - Number(supply.incomeTax) - Number(supply.salesTax) - Number(supply.ldCharges) - Number(supply.shelfLifeDeduction))}</td><td><button onClick={() => nav(`/transactions/contingent-bills/${supply.invoice.id}/edit`)}>Edit</button><button className="danger" onClick={() => void deleteBill(supply)}>Delete</button></td></tr>)}</tbody></table></div>
        </div></td></tr>}
      </>; })}
    </tbody></table>{!history.length && <div className="empty">No PO records found.</div>}</div>
  </div></section>;
}
