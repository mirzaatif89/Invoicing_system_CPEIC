import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type AccountCode, type Payee } from "../api";

export type ReportKind = "invoice" | "cheque" | "paymentScheduling" | "singlePaymentScheduling" | "vendorTax" | "accountTax" | "register" | "vendorNet" | "document" | "budget" | "excel" | "head" | "vendor" | "fbrIncomeTax" | "fbrSalesTax" | "ldCharges" | "shelfLife";
type ReportPayload = { title: string; filters: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; totals?: Record<string, unknown> };
const titles: Record<ReportKind, string> = { invoice: "Invoice Printing", cheque: "Schedule Invoice Printing / Cheque Schedule", paymentScheduling: "Payment Scheduling", singlePaymentScheduling: "Single Payment Scheduling", vendorTax: "Tax Report Of A Vendor", accountTax: "Tax Report Of An Account Head", register: "Payment Register", vendorNet: "Net Payment To A Vendor", document: "Document Printing", budget: "Budget Position", excel: "Documents To Excel", head: "Head Wise Payment", vendor: "Vendor Wise Payment", fbrIncomeTax: "FBR Income Tax Deductions", fbrSalesTax: "FBR Sales Tax Deductions", ldCharges: "L.D. Charges Deductions", shelfLife: "Shelf Life Deductions" };
const needsDates = new Set<ReportKind>(["cheque", "paymentScheduling", "singlePaymentScheduling", "vendorTax", "accountTax", "register", "vendorNet", "excel", "head", "vendor", "fbrIncomeTax", "fbrSalesTax", "ldCharges", "shelfLife"]);
const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-07-01`;

export default function ReportPage({ kind }: { kind: ReportKind }) {
  const [filters, setFilters] = useState({ serialNo: "", copies: "1", dateFrom: kind === "singlePaymentScheduling" ? today() : yearStart(), dateTo: today(), payeeCode: "", accountCode: "", fiscalYear: String(new Date().getFullYear()), documentType: "invoice", documentId: "" });
  const [report, setReport] = useState<ReportPayload | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const [accounts, setAccounts] = useState<AccountCode[]>([]), [payees, setPayees] = useState<Payee[]>([]);
  useEffect(() => { Promise.all([api<{ data: AccountCode[] }>("/account-codes?pageSize=1000"), api<{ data: Payee[] }>("/payees?pageSize=1000")]).then(([a, p]) => { setAccounts(a.data); setPayees(p.data); }).catch(() => undefined); }, []);

  function endpoint(format?: "pdf" | "excel") {
    const query = new URLSearchParams();
    if (format === "pdf") query.set("format", "pdf");
    let path = "";
    if (kind === "invoice") path = `/reports/invoices/${filters.serialNo}`;
    else if (kind === "document") path = `/reports/document/${filters.documentType}/${filters.documentId}`;
    else if (kind === "budget") { path = "/reports/budget-position"; query.set("fiscalYear", filters.fiscalYear); if (filters.accountCode) query.set("accountCode", filters.accountCode); }
    else if (kind === "excel") path = "/reports/export-excel";
    else if (["fbrIncomeTax", "fbrSalesTax", "ldCharges", "shelfLife"].includes(kind)) path = `/reports/deductions/${({ fbrIncomeTax: "income-tax", fbrSalesTax: "sales-tax", ldCharges: "ld-charges", shelfLife: "shelf-life" } as const)[kind as "fbrIncomeTax" | "fbrSalesTax" | "ldCharges" | "shelfLife"]}`;
    else {
      const paths = { cheque: "cheque-schedule", paymentScheduling: "payment-scheduling", singlePaymentScheduling: "single-payment-scheduling", vendorTax: "vendor-tax", accountTax: "account-tax", register: "payment-register", vendorNet: "vendor-net-payment", head: "head-wise-payment", vendor: "vendor-wise-payment" } as const;
      path = `/reports/${paths[kind as keyof typeof paths]}`;
      if (kind === "vendorTax" || kind === "vendorNet" || kind === "singlePaymentScheduling") query.set("payeeCode", filters.payeeCode);
      if (kind === "accountTax") query.set("accountCode", filters.accountCode);
    }
    if (needsDates.has(kind)) { query.set("dateFrom", filters.dateFrom); query.set("dateTo", filters.dateTo); }
    return `${path}${query.size ? `?${query}` : ""}`;
  }
  async function view(event?: FormEvent) { event?.preventDefault(); if (kind === "excel") return; setBusy(true); setError(""); try { setReport(await api<ReportPayload>(endpoint())); setSort(null); } catch (e) { setError((e as Error).message); setReport(null); } finally { setBusy(false); } }
  async function updateTaxStatus(itemId: number, paid: boolean) {
    const tax = kind === "fbrIncomeTax" ? "income" : "sales";
    try {
      await api(`/invoices/items/${itemId}/tax-status`, { method: "PATCH", body: JSON.stringify({ tax, paid }) });
      setReport((current) => current ? { ...current, rows: current.rows.map((row) => Number(row.itemId) === itemId ? { ...row, status: paid ? "Paid" : "Unpaid" } : row) } : current);
    } catch (e) { setError((e as Error).message); }
  }
  async function openPdf() {
    if ((kind === "vendorTax" || kind === "vendorNet" || kind === "singlePaymentScheduling") && !filters.payeeCode) { setError("Please select a vendor before printing the report."); return; }
    if (kind === "accountTax" && !filters.accountCode) { setError("Please select an account code before printing the report."); return; }
    window.location.assign(`/api${endpoint("pdf")}`);
    return;
    /* Legacy Blob popup flow kept out of execution.
    try {
      popup.document.write("<title>Generating report…</title><p style='font-family:Arial;padding:24px'>Generating PDF…</p>");
      const response = await fetch(`/api${endpoint("pdf")}`, { credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Unable to generate the PDF report.");
      }
      const url = URL.createObjectURL(await response.blob());
      popup.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { popup.close(); setError((e as Error).message); } */
  }
  function exportExcel() { window.location.assign(`/api${endpoint("excel")}`); }
  const rows = useMemo(() => { if (!report || !sort) return report?.rows || []; return [...report.rows].sort((a, b) => { const left = a[sort.key], right = b[sort.key]; return (typeof left === "number" && typeof right === "number" ? left - right : String(left ?? "").localeCompare(String(right ?? ""))) * sort.direction; }); }, [report, sort]);
  const set = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const money = (value: unknown) => typeof value === "number" ? Math.round(value).toLocaleString() : String(value ?? "");
  const single = kind === "invoice";

  return <section><div className="page-head"><div><h1>{titles[kind]}</h1><p>View filtered results on screen, print a consistent PDF, or export where available.</p></div></div><div className="card report-card">
    <form className="report-filters" onSubmit={view}>
      {single && <><label>Serial Number to Print<input type="number" min="1" value={filters.serialNo} onChange={(e) => set("serialNo", e.target.value)} required /></label><label>No. of Copies<input type="number" min="1" value={filters.copies} onChange={(e) => set("copies", e.target.value)} /></label></>}
      {needsDates.has(kind) && <><label>Starting Date<input type="date" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} required /></label><label>Ending Date<input type="date" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} required /></label></>}
      {(kind === "vendorTax" || kind === "vendorNet" || kind === "singlePaymentScheduling") && <label>{kind === "singlePaymentScheduling" ? "Vendor" : "Payee Code"}<select value={filters.payeeCode} onChange={(e) => set("payeeCode", e.target.value)} required><option value="">Select vendor</option>{payees.map((payee) => <option key={payee.id} value={payee.code}>{payee.code} — {payee.name}</option>)}</select></label>}
      {(kind === "accountTax" || kind === "budget") && <label>Account Code{kind === "budget" && " (optional)"}<select value={filters.accountCode} onChange={(e) => set("accountCode", e.target.value)} required={kind === "accountTax"}><option value="">{kind === "budget" ? "All account codes" : "Select account code"}</option>{accounts.map((account) => <option key={account.id} value={account.code}>{account.code} — {account.name}</option>)}</select></label>}
      {kind === "budget" && <label>Fiscal Year<input placeholder="2026-27" value={filters.fiscalYear} onChange={(e) => set("fiscalYear", e.target.value)} required /></label>}
      {kind === "document" && <><label>Document Type<select value={filters.documentType} onChange={(e) => set("documentType", e.target.value)}><option value="invoice">Invoice</option><option value="budget">Budget Document</option></select></label><label>Document Database ID<input type="number" min="1" value={filters.documentId} onChange={(e) => set("documentId", e.target.value)} required /></label></>}
      <div className="report-actions">{kind !== "excel" && <button className="primary" disabled={busy}>{busy ? "Loading…" : "View"}</button>}{kind !== "excel" && <button type="button" onClick={openPdf}>Print PDF</button>}{kind === "excel" && <button type="button" className="primary" onClick={exportExcel}>Export to Excel</button>}</div>
    </form>
    {error && <div className="alert">{error}</div>}
    {kind === "excel" && <p className="empty">Choose filters and download a proper .xlsx workbook with one row per document line item.</p>}
    {report && <><div className="report-heading"><h2>{report.title}</h2><p>{report.filters}</p></div><div className="table-wrap"><table><thead><tr>{report.columns.map((column) => <th key={column.key}><button className="sort-button" onClick={() => setSort((current) => ({ key: column.key, direction: current?.key === column.key && current.direction === 1 ? -1 : 1 }))}>{column.label}{sort?.key === column.key ? sort.direction === 1 ? " ▲" : " ▼" : ""}</button></th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{report.columns.map((column) => <td key={column.key}>{column.key === "status" && (kind === "fbrIncomeTax" || kind === "fbrSalesTax") ? <select className={`cheque-status ${row.status === "Paid" ? "paid" : "unpaid"}`} value={row.status === "Paid" ? "paid" : "unpaid"} onChange={(event) => void updateTaxStatus(Number(row.itemId), event.target.value === "paid")}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select> : money(row[column.key])}</td>)}</tr>)}{report.totals && <tr className="report-totals">{report.columns.map((column) => <td key={column.key}>{money(report.totals?.[column.key])}</td>)}</tr>}{!rows.length && <tr><td colSpan={report.columns.length} className="empty">No records found.</td></tr>}</tbody></table></div></>}
  </div></section>;
}
