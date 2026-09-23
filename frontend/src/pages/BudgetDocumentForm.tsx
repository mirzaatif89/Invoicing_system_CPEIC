import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type AccountCode, type BudgetDocument, type BudgetType } from "../api";

type Row = { accountCodeId: string; query: string; amount: number };
const blank = (): Row => ({ accountCodeId: "", query: "", amount: 0 });
const today = () => new Date().toISOString().slice(0, 10);

export default function BudgetDocumentForm() {
  const { id } = useParams(), navigate = useNavigate(), formRef = useRef<HTMLFormElement>(null);
  const [accounts, setAccounts] = useState<AccountCode[]>([]);
  const [date, setDate] = useState(today());
  const [budgetType, setBudgetType] = useState<BudgetType>("Original");
  const [documentNo, setDocumentNo] = useState<number>();
  const [details, setDetails] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [focusedRow, setFocusedRow] = useState(0);
  const [lookupRow, setLookupRow] = useState<number | null>(null);
  const [lookupSearch, setLookupSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function nextNumber() {
    setDocumentNo((await api<{ documentNo: number }>("/budget-documents/next-number")).documentNo);
  }
  useEffect(() => {
    api<{ data: AccountCode[] }>("/account-codes?pageSize=1000")
      .then((result) => setAccounts(result.data)).catch((e: Error) => setError(e.message));
    if (id) {
      api<BudgetDocument>(`/budget-documents/${id}`).then((document) => {
        setDate(document.date.slice(0, 10));
        setBudgetType(document.budgetType);
        setDocumentNo(document.documentNo);
        setDetails(document.details || "");
        setRows(document.items.map((item) => ({
          accountCodeId: String(item.accountCodeId),
          query: item.accountCode.code,
          amount: Number(item.amount),
        })));
      }).catch((e: Error) => setError(e.message));
    } else void nextNumber();
  }, [id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "F1") { event.preventDefault(); setLookupSearch(""); setLookupRow(focusedRow); }
      if (event.key === "F5") { event.preventDefault(); formRef.current?.requestSubmit(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focusedRow]);

  function patchRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  }
  function matchAccount(index: number, value: string) {
    const account = accounts.find((item) => item.code.toLowerCase() === value.trim().toLowerCase());
    setFocusedRow(index);
    patchRow(index, { query: value, accountCodeId: account ? String(account.id) : "" });
  }
  function chooseAccount(index: number, account: AccountCode) {
    setFocusedRow(index);
    patchRow(index, { query: account.code, accountCodeId: String(account.id) });
    setLookupRow(null); setLookupSearch("");
  }
  function addRow() { setRows((current) => [...current, blank()]); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (rows.some((row) => !row.accountCodeId || row.amount <= 0)) {
      setError("Every row requires a valid Account Code and Amount greater than zero."); return;
    }
    setBusy(true); setError("");
    try {
      await api(id ? `/budget-documents/${id}` : "/budget-documents", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ date, budgetType, details: details || null, items: rows.map((row) => ({ accountCodeId: Number(row.accountCodeId), amount: row.amount })) }),
      });
      if (id) navigate("/transactions/budgets");
      else {
        setDate(today()); setBudgetType("Original"); setDetails(""); setRows([blank()]); setFocusedRow(0);
        await nextNumber();
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const visibleAccounts = useMemo(() => {
    const query = lookupSearch.toLowerCase();
    return accounts.filter((account) => !query || account.code.toLowerCase().includes(query) || account.name.toLowerCase().includes(query));
  }, [accounts, lookupSearch]);
  const grandTotal = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [rows]);

  return <section>
    <div className="page-head"><div><h1>{id ? "Budget Edit" : "Budget Entry"}</h1><p>F1 = Focused Account Code Lookup &nbsp; • &nbsp; F5 = Save Document</p></div><div className="page-actions"><Link className="button" to="/transactions/budgets">Budget Documents</Link><button type="button" className="primary" onClick={() => formRef.current?.requestSubmit()}>Save (F5)</button></div></div>
    <form ref={formRef} className="card budget-form" onSubmit={save}>
      {error && <div className="alert">{error}</div>}
      <div className="budget-header">
        <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
        <label>Budget Type<select value={budgetType} onChange={(event) => setBudgetType(event.target.value as BudgetType)}><option>Original</option><option>Revised</option><option>Supplementary</option></select></label>
        <label>Document #<input readOnly value={documentNo ?? "Loading…"} /></label>
        <label className="wide">Details<textarea rows={3} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      </div>
      <div className="budget-grid">
        <div className="budget-grid-head"><span>Sr #</span><span>Code</span><span>Description</span><span>Amount</span><span /></div>
        {rows.map((row, index) => {
          const account = accounts.find((item) => String(item.id) === row.accountCodeId);
          return <div className="budget-grid-row" key={index} onKeyDown={(event) => { if (event.key === "Enter" && index === rows.length - 1) { event.preventDefault(); addRow(); } }}>
            <span className="line-serial">{index + 1}</span>
            <div className="account-cell"><input list={`budget-accounts-${index}`} value={row.query} onFocus={() => setFocusedRow(index)} onChange={(event) => matchAccount(index, event.target.value)} required /><datalist id={`budget-accounts-${index}`}>{accounts.map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</datalist><button type="button" onClick={() => { setFocusedRow(index); setLookupRow(index); }}>⌕</button></div>
            <input readOnly value={account?.name || ""} placeholder="Select an Account Code" />
            <input type="number" min="0.01" step="0.01" value={row.amount} onChange={(event) => patchRow(index, { amount: Number(event.target.value) })} required />
            <button type="button" className="danger" onClick={() => rows.length > 1 && setRows((current) => current.filter((_, position) => position !== index))}>×</button>
          </div>;
        })}
      </div>
      <button type="button" onClick={addRow}>+ Add Row</button>
      <p className="invoice-help">Press Enter on the last row to add another row. F1 opens the focused Account Code lookup.</p>
      <div className="form-actions"><div className="grand-total-box"><span>Grand Total</span><strong>PKR {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div><Link className="button" to="/transactions/budgets">Cancel</Link><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save (F5)"}</button></div>
    </form>
    {lookupRow !== null && <div className="lookup-backdrop" onMouseDown={() => setLookupRow(null)}><div className="card lookup" onMouseDown={(event) => event.stopPropagation()}><div className="page-head"><h2>Account Code Lookup</h2><button onClick={() => setLookupRow(null)}>Close</button></div><input autoFocus placeholder="Search account code or description" value={lookupSearch} onChange={(event) => setLookupSearch(event.target.value)} />{visibleAccounts.map((account) => <button className="lookup-row" key={account.id} onClick={() => chooseAccount(lookupRow, account)}><strong>{account.code}</strong><span>{account.name}</span></button>)}</div></div>}
  </section>;
}
