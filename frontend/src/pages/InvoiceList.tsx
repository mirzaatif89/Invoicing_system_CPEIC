import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type AccountCode, type Invoice, type Payee } from "../api";
import ActionMenu from "../components/ActionMenu";
const money = (value: number | string) => `PKR ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type FinalInvoiceStatus = { finalInvoiceId: number | null; finalInvoiceSerial: number | null; chequeNo: string | null; chequePaid: boolean };
export default function InvoiceList({ mode = "invoice" }: { mode?: "invoice" | "contingent" }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Invoice[]>([]),
    [accounts, setAccounts] = useState<AccountCode[]>([]),
    [payees, setPayees] = useState<Payee[]>([]),
    [filters, setFilters] = useState({
      search: "",
      dateFrom: "",
      dateTo: "",
      accountCodeId: "",
      payeeId: "",
    }),
    [error, setError] = useState(""),
    [openPo, setOpenPo] = useState<string | null>(null),
    [selectedSupplyKeys, setSelectedSupplyKeys] = useState<string[]>([]),
    [finalStatuses, setFinalStatuses] = useState<Record<number, FinalInvoiceStatus>>({});
  async function load() {
    try {
      const params = new URLSearchParams({ pageSize: "100" });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      params.set("isContingent", mode === "contingent" ? "true" : "false");
      const data = (await api<{ data: Invoice[] }>(`/invoices?${params}`)).data;
      setItems(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    Promise.all([
      api<{ data: AccountCode[] }>("/account-codes?pageSize=1000"),
      api<{ data: Payee[] }>("/payees?pageSize=1000"),
    ]).then(([a, p]) => {
      setAccounts(a.data);
      setPayees(p.data);
    });
    void load();
  }, [mode]);
  function printContingentBill(invoiceId: number, itemId: number) {
    window.open(`/api/invoices/${invoiceId}/items/${itemId}/contingent-bill.pdf`, "_blank", "noopener,noreferrer");
  }
  function printInvoice(serialNo: number) {
    window.open(`/api/reports/invoices/${serialNo}?format=pdf`, "_blank", "noopener,noreferrer");
  }
  async function updateInvoiceChequeStatus(invoiceId: number, itemId: number, chequeNo: string, chequePaid: boolean) {
    try {
      await api(`/invoices/items/${itemId}/cheque-status`, { method: "PATCH", body: JSON.stringify({ chequePaid }) });
      setItems((current) => current.map((invoice) => invoice.id !== invoiceId ? invoice : {
        ...invoice,
        items: invoice.items.map((item) => item.chequeNo === chequeNo ? { ...item, chequePaid } : item),
      }));
    } catch (e) { setError((e as Error).message); }
  }
  async function remove(x: Invoice) {
    if (!confirm(`Delete invoice serial ${x.serialNo}?`)) return;
    try {
      await api(`/invoices/${x.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void load();
  }
  const poGroups = [...items.flatMap((invoice) => invoice.items.filter((item) => item.poNumber).map((item) => ({ invoice, item }))).reduce((groups, row) => {
    const poNumber = row.item.poNumber!;
    groups.set(poNumber, [...(groups.get(poNumber) || []), row]);
    return groups;
  }, new Map<string, Array<{ invoice: Invoice; item: Invoice["items"][number] }>>())];
  const openGroup = poGroups.find(([poNumber]) => poNumber === openPo)?.[1] || [];
  useEffect(() => {
    if (mode !== "contingent" || !openPo || !openGroup.length) return;
    const itemIds = openGroup.map(({ item }) => item.id).filter((id): id is number => typeof id === "number");
    void api<{ data: Array<FinalInvoiceStatus & { contingentItemId: number }> }>(`/invoices/contingent-final-status?itemIds=${itemIds.join(",")}`).then(({ data }) => {
      const statuses = Object.fromEntries(data.map(({ contingentItemId, ...status }) => [contingentItemId, status]));
      setFinalStatuses(statuses);
      setSelectedSupplyKeys((current) => current.filter((key) => !statuses[Number(key.split("-")[1])]?.finalInvoiceId));
    }).catch((e) => setError((e as Error).message));
  }, [mode, openPo, items]);
  const toggleSupply = (key: string) => setSelectedSupplyKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  function printSelectedContingentBill() {
    const selected = openGroup.filter(({ invoice, item }) => selectedSupplyKeys.includes(`${invoice.id}-${item.id}`));
    if (!selected.length) return;
    const invoiceIds = [...new Set(selected.map(({ invoice }) => invoice.id))];
    if (invoiceIds.length !== 1) {
      setError("Please select supply orders from one Contingent Bill at a time.");
      return;
    }
    const invoiceId = invoiceIds[0];
    const itemIds = selected.map(({ item }) => item.id).join(",");
    window.open(`/api/invoices/${invoiceId}/items/${selected[0].item.id}/contingent-bill.pdf?itemIds=${encodeURIComponent(itemIds)}`, "_blank", "noopener,noreferrer");
    return;
    if (!selected.length || !openPo) return;
    const total = (key: "amount" | "incomeTax" | "salesTax" | "ldCharges" | "shelfLifeDeduction" | "netAmount") => selected.reduce((sum, row) => sum + Number(row.item[key]), 0);
    const lines = selected.map(({ invoice, item }, index) => `<tr><td>${index + 1}</td><td>${invoice.serialNo}</td><td>${item.dcNumber || "-"}</td><td>${item.payee.code} — ${item.payee.name}</td><td>${money(item.amount)}</td><td>${money(item.incomeTax)}</td><td>${money(item.salesTax)}</td><td>${money(item.ldCharges)}</td><td>${money(item.shelfLifeDeduction)}</td><td>${money(item.netAmount)}</td></tr>`).join("");
    const popup = window.open("", "_blank")!;
    if (!popup) { setError("Please allow pop-ups to print the selected Contingent Bill."); return; }
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><title>Contingent Bill — PO ${openPo}</title><style>body{font-family:Arial;padding:28px;color:#111}h1{margin:0}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #222;padding:8px;font-size:12px}th{background:#eaf0f0}tfoot{font-weight:bold}@media print{body{padding:0}}</style></head><body><h1>Contingent Bill — PO ${openPo}</h1><p>Selected Supply Orders: ${selected.length}</p><table><thead><tr><th>#</th><th>Bill</th><th>DC No.</th><th>Vendor</th><th>Gross</th><th>Income Tax</th><th>Sales Tax</th><th>LD</th><th>Shelf Life</th><th>Net</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="4">Total</td><td>${money(total("amount"))}</td><td>${money(total("incomeTax"))}</td><td>${money(total("salesTax"))}</td><td>${money(total("ldCharges"))}</td><td>${money(total("shelfLifeDeduction"))}</td><td>${money(total("netAmount"))}</td></tr></tfoot></table></body></html>`);
    popup.document.close(); popup.focus(); window.setTimeout(() => popup.print(), 150);
  }
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{mode === "contingent" ? "Contingent Bills" : "Invoice List & Edit"}</h1>
          <p>{mode === "contingent" ? "Invoices with PO, DC, LD and shelf-life bill details" : "Account-wise invoices with multiple payees"}</p>
        </div>
        <Link className="button primary" to={mode === "contingent" ? "/transactions/contingent-bills/new" : "/transactions/invoices/new"}>
          {mode === "contingent" ? "New Contingent Bill" : "New Invoice"}
        </Link>
      </div>
      <div className="card">
        <form className="invoice-filters" onSubmit={submit}>
          <input
            placeholder={mode === "contingent" ? "Search PO No." : "Serial #"}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
          <select
            value={filters.accountCodeId}
            onChange={(e) =>
              setFilters({ ...filters, accountCodeId: e.target.value })
            }
          >
            <option value="">All accounts</option>
            {accounts.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code}
              </option>
            ))}
          </select>
          <select
            value={filters.payeeId}
            onChange={(e) =>
              setFilters({ ...filters, payeeId: e.target.value })
            }
          >
            <option value="">All payees</option>
            {payees.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.name}
              </option>
            ))}
          </select>
          <button>Search</button>
        </form>
        {error && <div className="alert">{error}</div>}
        <div className="table-wrap">
          <table className={mode === "invoice" ? "invoice-list-table" : undefined}>
            <thead>
              <tr>
                {mode === "contingent" ? <><th>PO No.</th><th>Supplies</th><th>Account Code</th><th>Gross Total</th><th>Income Tax</th><th>Sales Tax</th><th>LD Charges</th><th>Shelf Life</th><th>Net Total</th><th>Actions</th></> : <><th>Serial #</th>
                <th>Account Code</th>
                <th>Description</th>
                <th>Date</th>
                <th>Payee Code(s)</th>
                <th>Gross Total</th>
                <th>Income Tax</th>
                <th>Sales Tax</th>
                <th>Net Total</th>
                <th>Cheque Status</th>
                <th>Actions</th></>}
              </tr>
            </thead>
            <tbody>
              {mode === "contingent" ? poGroups.map(([poNumber, rows]) => { const total = (field: "amount" | "incomeTax" | "salesTax" | "ldCharges" | "shelfLifeDeduction" | "netAmount") => rows.reduce((sum, row) => sum + Number(row.item[field]), 0); return <tr key={poNumber}><td className="code"><b>{poNumber}</b></td><td>{rows.length}</td><td>{[...new Set(rows.map((row) => row.invoice.accountCode.code))].join(", ")}</td><td>PKR {total("amount").toLocaleString()}</td><td>PKR {total("incomeTax").toLocaleString()}</td><td>PKR {total("salesTax").toLocaleString()}</td><td>PKR {total("ldCharges").toLocaleString()}</td><td>PKR {total("shelfLifeDeduction").toLocaleString()}</td><td>PKR {total("netAmount").toLocaleString()}</td><td><ActionMenu><button type="button" onClick={() => { setSelectedSupplyKeys([]); setOpenPo(poNumber); }}>View PO</button></ActionMenu></td></tr>; }) : items.map((x) => {
                const chequeItems = x.items.filter((item) => item.chequeNo);
                const chequeNumbers = [...new Set(chequeItems.map((item) => item.chequeNo!))];
                const chequeNo = chequeNumbers.length === 1 ? chequeNumbers[0] : null;
                const chequePaid = chequeNo ? chequeItems.filter((item) => item.chequeNo === chequeNo).every((item) => item.chequePaid) : false;
                return (
                <tr key={x.id}>
                  <td className="code">{x.serialNo}</td>
                  <td>{x.accountCode.code}</td>
                  <td>{x.accountCode.name}</td>
                  <td>{x.date.slice(0, 10)}</td>
                  <td className="code">
                    {[...new Set(x.items.map((item) => item.payee.code))].join(", ")}
                  </td>
                  <td>
                    PKR{" "}
                    {x.items
                      .reduce((s, i) => s + Number(i.amount), 0)
                      .toLocaleString()}
                  </td>
                  <td>PKR {x.items.reduce((s, i) => s + Number(i.incomeTax), 0).toLocaleString()}</td>
                  <td>PKR {x.items.reduce((s, i) => s + Number(i.salesTax), 0).toLocaleString()}</td>
                  <td>PKR {x.items.reduce((s, i) => s + Number(i.netAmount), 0).toLocaleString()}</td>
                  <td>{chequeNo ? <select className={`cheque-status ${chequePaid ? "paid" : "unpaid"}`} value={chequePaid ? "paid" : "unpaid"} onChange={(event) => void updateInvoiceChequeStatus(x.id, chequeItems[0].id!, chequeNo, event.target.value === "paid")}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select> : <span className="muted">{chequeItems.length ? "Multiple cheques" : "No cheque"}</span>}</td>
                  <td>
                    <ActionMenu>
                      <Link to={`/transactions/invoices/${x.id}/edit`}>Edit</Link>
                      <button type="button" onClick={() => printInvoice(x.serialNo)}>Print Invoice</button>
                      <button className="danger" onClick={() => void remove(x)}>Delete</button>
                    </ActionMenu>
                  </td>
                </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={mode === "contingent" ? 10 : 11} className="empty">
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {openPo && <div className="lookup-backdrop" onMouseDown={() => setOpenPo(null)}>
        <div className="lookup card po-bill-modal" onMouseDown={(event) => event.stopPropagation()}>
          <div className="page-head"><div><h2>PO {openPo} — Supply Orders</h2><p>Select supplies to print their combined Contingent Bill or create the final Invoice.</p></div><button type="button" onClick={() => setOpenPo(null)}>Close</button></div>
          <div className="table-wrap"><table><thead><tr><th>Select</th><th>PO Supply Serial</th><th>Date</th><th>Vendor</th><th>DC No.</th><th>Gross</th><th>Income Tax</th><th>Sales Tax</th><th>LD</th><th>Shelf Life</th><th>Net</th><th>Invoice Status</th><th>Actions</th></tr></thead><tbody>
            {openGroup.map(({ invoice, item }, index) => {
              const key = `${invoice.id}-${item.id}`;
              const status = item.id ? finalStatuses[item.id] : undefined;
              const alreadyCreated = Boolean(status?.finalInvoiceId);
              return <tr key={key} className={alreadyCreated ? "already-invoiced" : undefined}><td><input type="checkbox" disabled={alreadyCreated} checked={selectedSupplyKeys.includes(key)} onChange={() => toggleSupply(key)} /></td><td>{index + 1}</td><td>{invoice.date.slice(0, 10)}</td><td>{item.payee.code} — {item.payee.name}</td><td>{item.dcNumber || "-"}</td><td>{money(item.amount)}</td><td>{money(item.incomeTax)}</td><td>{money(item.salesTax)}</td><td>{money(item.ldCharges)}</td><td>{money(item.shelfLifeDeduction)}</td><td>{money(item.netAmount)}</td><td>{alreadyCreated ? <span className={`invoice-state ${status?.chequePaid ? "paid" : "created"}`}>{status?.chequePaid ? "Paid" : "Invoice created"}<small>Invoice #{status?.finalInvoiceSerial}{status?.chequeNo ? ` • Chq ${status.chequeNo}` : ""}</small></span> : <span className="invoice-state ready">Ready to invoice</span>}</td><td><ActionMenu><Link to={`/transactions/contingent-bills/${invoice.id}/edit`}>Edit Bill</Link></ActionMenu></td></tr>;
            })}
          </tbody></table></div>
          <div className="po-modal-actions"><span>{selectedSupplyKeys.length} supply order(s) selected.</span><div><button disabled={!selectedSupplyKeys.length} onClick={printSelectedContingentBill}>Print Contingent Bill</button><button className="primary" disabled={!selectedSupplyKeys.length} onClick={() => navigate(`/transactions/invoices/new?po=${encodeURIComponent(openPo)}&itemIds=${encodeURIComponent(selectedSupplyKeys.map((key) => key.split("-")[1]).join(","))}`)}>Create Invoice</button></div></div>
        </div>
      </div>}
    </section>
  );
}
