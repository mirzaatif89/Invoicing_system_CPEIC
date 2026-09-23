import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, fiscalYearStart, type AccountCode, type Invoice, type InvoiceItem, type ItemTypeTaxRule, type LdChargeSettings, type Payee, type ShelfLifePenaltySlab, type VendorTaxStatus } from "../api";
import { resolveTaxpayerStatus } from "../lib/taxpayerStatus";
type Row = {
  id?: number;
  payeeId: string;
  payeeQuery: string;
  amount: number;
  incomeTax: number;
  salesTax: number;
  poNumber: string;
  poDate: string;
  dcNumber: string;
  procurementMode: "" | "TENDER" | "QUOTATION";
  deliveryDueDate: string;
  actualDeliveryDate: string;
  manufacturingDate: string;
  expiryDate: string;
  orderDate: string;
  gracePeriodDays: number | null;
  deliveryDays: number | null;
  itemType: "IMPORTED" | "LOCAL" | "MEDICINE" | "DISPOSABLE";
  itemTypes?: string[];
  ldCharges: number;
  shelfLifeDeduction: number;
  ldPercentPerDay: number | null;
  shelfLifeDeductionPercent: number | null;
  detailsOpen: boolean;
  autoIncomeTax: boolean;
  autoSalesTax: boolean;
  autoLdCharges: boolean;
  autoShelfLifeDeduction: boolean;
  chequeNo: string;
  purpose: string;
  lineSerial: number;
};
const blank = (): Row => ({
  payeeId: "",
  payeeQuery: "",
  amount: 0,
  incomeTax: 0,
  salesTax: 0,
  poNumber: "", poDate: "", dcNumber: "", procurementMode: "", orderDate: "", gracePeriodDays: null, deliveryDays: null, itemType: "LOCAL", deliveryDueDate: "", actualDeliveryDate: "", manufacturingDate: "", expiryDate: "", ldCharges: 0, shelfLifeDeduction: 0, ldPercentPerDay: null, shelfLifeDeductionPercent: null, detailsOpen: false,
  autoIncomeTax: true,
  autoSalesTax: true,
  autoLdCharges: true,
  autoShelfLifeDeduction: true,
  chequeNo: "",
  purpose: "",
  lineSerial: 1,
});
const today = () => new Date().toISOString().slice(0, 10);
export default function InvoiceForm({ mode = "invoice" }: { mode?: "invoice" | "contingent" }) {
  const { id } = useParams(),
    navigate = useNavigate(),
    [searchParams] = useSearchParams(),
    formRef = useRef<HTMLFormElement>(null);
  const isContingent = mode === "contingent";
  const listPath = isContingent ? "/transactions/contingent-bills" : "/transactions/invoices";
  const [accounts, setAccounts] = useState<AccountCode[]>([]),
    [payees, setPayees] = useState<Payee[]>([]),
    [ldSettings, setLdSettings] = useState<LdChargeSettings>({ ldGracePeriodDays: 5, ldRatePercentPerDay: 0.067, ldMaxCapPercent: 10 }),
    [shelfSlabs, setShelfSlabs] = useState<ShelfLifePenaltySlab[]>([]),
    [itemTypeTaxRules, setItemTypeTaxRules] = useState<ItemTypeTaxRule[]>([]),
    [accountQuery, setAccountQuery] = useState(""),
    [accountId, setAccountId] = useState(""),
    [date, setDate] = useState(today()),
    [serial, setSerial] = useState<number>(),
    [sourceSerial, setSourceSerial] = useState(() => searchParams.get("po") || ""),
    [taxHistories, setTaxHistories] = useState<Record<number, VendorTaxStatus[]>>({}),
    [loadingSource, setLoadingSource] = useState(false),
    [rows, setRows] = useState<Row[]>([{ ...blank(), detailsOpen: isContingent }]),
    [summary, setSummary] = useState({
      totalBudget: 0,
      totalExpense: 0,
      balance: 0,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [lookupRow, setLookupRow] = useState<number | null>(null),
    [accountLookup, setAccountLookup] = useState(false),
    [lookupSearch, setLookupSearch] = useState(""),
    [focusedTarget, setFocusedTarget] = useState<
      { type: "account" } | { type: "payee"; row: number }
    >({ type: "account" });
  const account = accounts.find((x) => String(x.id) === accountId),
    fiscalYear = String(fiscalYearStart(date));
  async function loadSourceInvoice() {
    const poNumber = sourceSerial.trim();
    if (!poNumber) return;
    setLoadingSource(true); setError("");
    try {
      const itemIds = searchParams.get("itemIds");
      const found = await api<{ accountCodeId: number; accountCode: Invoice["accountCode"]; date: string; items: InvoiceItem[] }>(`/invoices/load-by-po?poNumber=${encodeURIComponent(poNumber)}${itemIds ? `&itemIds=${encodeURIComponent(itemIds)}` : ""}`);
      setDate(found.date.slice(0, 10)); setAccountId(String(found.accountCodeId)); setAccountQuery(found.accountCode.code);
      setRows(found.items.map((i, index) => ({ id: undefined, payeeId: String(i.payeeId), payeeQuery: `${i.payee.code} — ${i.payee.name}`, amount: Number(i.amount), incomeTax: Number(i.incomeTax || 0), salesTax: Number(i.salesTax || 0), poNumber: i.poNumber || "", poDate: i.poDate?.slice(0, 10) || "", dcNumber: i.dcNumber || "", procurementMode: i.procurementMode || "", orderDate: i.orderDate?.slice(0, 10) || "", gracePeriodDays: i.gracePeriodDays ?? null, deliveryDays: i.deliveryDays ?? null, itemType: i.itemType || "LOCAL", deliveryDueDate: i.deliveryDueDate?.slice(0, 10) || "", actualDeliveryDate: i.actualDeliveryDate?.slice(0, 10) || "", manufacturingDate: i.manufacturingDate?.slice(0, 10) || "", expiryDate: i.expiryDate?.slice(0, 10) || "", ldCharges: 0, shelfLifeDeduction: 0, ldPercentPerDay: null, shelfLifeDeductionPercent: i.shelfLifeDeductionPercent == null ? null : Number(i.shelfLifeDeductionPercent), detailsOpen: index === 0, autoIncomeTax: false, autoSalesTax: false, autoLdCharges: false, autoShelfLifeDeduction: false, chequeNo: "", purpose: i.purpose || "", lineSerial: index + 1 })));
    } catch (e) { setError((e as Error).message); } finally { setLoadingSource(false); }
  }
  async function fetchSerial() {
    setSerial(
      (await api<{ serialNo: number }>(`/invoices/next-serial?isContingent=${isContingent}`)).serialNo,
    );
  }
  async function fetchSummary(code: string) {
    if (!code) {
      setSummary({ totalBudget: 0, totalExpense: 0, balance: 0 });
      return;
    }
    setSummary(
      await api(
        `/account-codes/${encodeURIComponent(code)}/budget-summary?fiscalYear=${fiscalYear}`,
      ),
    );
  }
  useEffect(() => {
    Promise.all([
      api<{ data: AccountCode[] }>("/account-codes?pageSize=1000"),
      api<{ data: Payee[] }>("/payees?pageSize=1000"),
      api<LdChargeSettings>("/settings/ld-charges"),
      api<{ data: ShelfLifePenaltySlab[] }>("/shelf-life-penalty-slabs"),
      api<{ data: ItemTypeTaxRule[] }>("/item-type-tax-rules"),
    ])
      .then(([a, p, ld, shelf, taxRules]) => {
        setAccounts(a.data);
        setPayees(p.data);
        setLdSettings(ld);
        setShelfSlabs(shelf.data);
        setItemTypeTaxRules(taxRules.data);
      })
      .catch((e) => setError(e.message));
    if (id) {
      api<Invoice>(`/invoices/${id}`)
        .then((x) => {
          setSerial(x.serialNo);
          setDate(x.date.slice(0, 10));
          setAccountId(String(x.accountCodeId));
          setAccountQuery(x.accountCode.code);
          setRows(
            x.items.map((i, index) => ({
              id: i.id,
              payeeId: String(i.payeeId),
              payeeQuery: `${i.payee.code} — ${i.payee.name}`,
              amount: Number(i.amount),
              incomeTax: Number(i.incomeTax || 0),
              salesTax: Number(i.salesTax || 0),
              poNumber: i.poNumber || "", poDate: i.poDate?.slice(0, 10) || "", dcNumber: i.dcNumber || "", procurementMode: i.procurementMode || "", orderDate: i.orderDate?.slice(0, 10) || "", gracePeriodDays: i.gracePeriodDays ?? null, deliveryDays: i.deliveryDays ?? null, itemType: i.itemType || "LOCAL", deliveryDueDate: i.deliveryDueDate?.slice(0, 10) || "", actualDeliveryDate: i.actualDeliveryDate?.slice(0, 10) || "", manufacturingDate: i.manufacturingDate?.slice(0, 10) || "", expiryDate: i.expiryDate?.slice(0, 10) || "", ldCharges: Number(i.ldCharges || 0), shelfLifeDeduction: Number(i.shelfLifeDeduction || 0), ldPercentPerDay: null, shelfLifeDeductionPercent: i.shelfLifeDeductionPercent == null ? null : Number(i.shelfLifeDeductionPercent), detailsOpen: isContingent && index === 0,
              autoIncomeTax: false,
              autoSalesTax: false,
              autoLdCharges: isContingent,
              autoShelfLifeDeduction: isContingent,
              chequeNo: i.chequeNo || "",
              purpose: i.purpose || "",
              lineSerial: i.lineSerial,
            })),
          );
          void fetchSummary(x.accountCode.code);
        })
        .catch((e) => setError(e.message));
    } else void fetchSerial();
  }, [id]);
  useEffect(() => { if (!isContingent && !id && accounts.length && searchParams.get("po")) void loadSourceInvoice(); }, [accounts.length]);
  useEffect(() => { setRows((current) => current.map((row) => { const auto = autoDeductions(row); return { ...row, ...(row.autoIncomeTax && { incomeTax: auto.incomeTax }), ...(row.autoSalesTax && { salesTax: auto.salesTax }) }; })); }, [taxHistories, date]);
  useEffect(() => {
    const selected = accounts.find((x) => String(x.id) === accountId);
    if (selected) void fetchSummary(selected.code);
  }, [accountId, date, accounts]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setLookupSearch("");
        if (focusedTarget.type === "account") setAccountLookup(true);
        else setLookupRow(focusedTarget.row);
      }
      if (e.key === "F5") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focusedTarget]);
  function chooseAccount(value: string) {
    setAccountQuery(value);
    const found = accounts.find(
      (x) => x.code.toLowerCase() === value.trim().toLowerCase(),
    );
    setAccountId(found ? String(found.id) : "");
    setRows((current) => current.map((row) => ({
      ...row,
      ...(found ? autoDeductions(row, found) : { incomeTax: 0, salesTax: 0, ldCharges: 0, shelfLifeDeduction: 0 }),
      autoIncomeTax: true,
      autoSalesTax: true,
    })));
    void fetchSummary(found?.code || "");
  }
  function calculateTax(amount: number, percent: number | string) {
    return Math.round((amount * Number(percent || 0) / 100 + Number.EPSILON) * 100) / 100;
  }
  function daysLate(row: Row) {
    const due = deliveryDueDate(row);
    if (!due || !row.actualDeliveryDate) return 0;
    const calendarDay = (value: string | number) => { const date = typeof value === "number" ? new Date(value) : new Date(`${value}T00:00:00Z`); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()); };
    return Math.max(0, Math.round((calendarDay(row.actualDeliveryDate) - calendarDay(due)) / 86400000));
  }
  function deliveryDueDate(row: Row) {
    if (!row.poDate || row.deliveryDays == null) return "";
    const date = new Date(`${row.poDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Math.floor(row.deliveryDays));
    return date.toISOString().slice(0, 10);
  }
  // A row value overrides the configured policy; blank rows use the policy default.
  function graceDays(row: Row) { return row.gracePeriodDays ?? 5; }
  function chargeableDays(row: Row) { return Math.max(0, daysLate(row) - graceDays(row)); }
  function remainingShelfLife(row: Row) {
    if (!row.manufacturingDate || !row.expiryDate || !row.actualDeliveryDate) return null;
    const wholeDay = (value: string) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    };
    const total = wholeDay(row.expiryDate) - wholeDay(row.manufacturingDate);
    if (total <= 0) return null;
    return ((wholeDay(row.expiryDate) - wholeDay(row.actualDeliveryDate)) / total) * 100;
  }
  function shelfLifeState(row: Row) {
    if (!row.manufacturingDate || !row.expiryDate || !row.actualDeliveryDate) return "-";
    if (new Date(`${row.expiryDate}T00:00:00Z`) <= new Date(`${row.manufacturingDate}T00:00:00Z`)) return "Invalid dates";
    if (new Date(`${row.actualDeliveryDate}T00:00:00Z`) < new Date(`${row.manufacturingDate}T00:00:00Z`)) return "Warning: delivery is before manufacturing";
    const remaining = remainingShelfLife(row);
    return remaining == null ? "Invalid dates" : `${remaining.toFixed(2)}%`;
  }
  function ldCharges(row: Row) {
    const rate = row.ldPercentPerDay ?? ldSettings.ldRatePercentPerDay;
    const uncapped = row.amount * chargeableDays(row) * rate / 100;
    const capped = ldSettings.ldMaxCapPercent == null ? uncapped : Math.min(uncapped, row.amount * ldSettings.ldMaxCapPercent / 100);
    return Math.round((capped + Number.EPSILON) * 100) / 100;
  }
  function ldCalculation(row: Row) {
    const dueValue = deliveryDueDate(row);
    const due = dueValue ? new Date(`${dueValue}T00:00:00Z`) : null;
    const actual = row.actualDeliveryDate ? new Date(`${row.actualDeliveryDate}T00:00:00Z`) : null;
    if (!due || !actual || !Number.isFinite(row.amount) || row.amount <= 0) return { daysLate: 0, chargeableDays: 0, ldCharges: 0, isCapped: false };
    const daysLate = Math.max(0, Math.round((actual.getTime() - due.getTime()) / 86400000));
    const gracePeriodDays = graceDays(row);
    console.log("[LD GRACE DEBUG] before chargeableDays", { daysLate, gracePeriodDays });
    const chargeableDays = Math.max(0, daysLate - Math.max(0, Math.floor(gracePeriodDays)));
    const uncapped = row.amount * (row.ldPercentPerDay ?? ldSettings.ldRatePercentPerDay) / 100 * chargeableDays;
    const maxCap = row.amount * (ldSettings.ldMaxCapPercent ?? 10) / 100;
    const isCapped = uncapped > maxCap;
    console.log("[LD DEBUG UI]", { orderValue: row.amount, ldRatePercent: row.ldPercentPerDay ?? ldSettings.ldRatePercentPerDay, deliveryDueDate: row.deliveryDueDate, actualDeliveryDate: row.actualDeliveryDate, daysLate, gracePeriodDays, chargeableDays, uncapped, maxCap, ldCharges: isCapped ? maxCap : uncapped });
    return { daysLate, chargeableDays, ldCharges: Math.round((isCapped ? maxCap : uncapped) * 100) / 100, isCapped };
  }
  function shelfPercent(row: Row) {
    const remaining = remainingShelfLife(row);
    if (remaining == null) return 0;
    const activeSlabs = shelfSlabs.filter((slab) => slab.active && slab.itemCategory === row.itemType);
    const simpleSlab = activeSlabs.filter((slab) => Number(slab.remainingPercentMin) === 0 && slab.remainingPercentMax != null).filter((slab) => remaining < Number(slab.remainingPercentMax)).sort((a, b) => Number(a.remainingPercentMax) - Number(b.remainingPercentMax))[0];
    if (simpleSlab) return Number(simpleSlab.penaltyPercent || 0);
    return Number(activeSlabs.sort((a, b) => Number(b.remainingPercentMin) - Number(a.remainingPercentMin)).find((slab) => remaining >= Number(slab.remainingPercentMin) && (slab.remainingPercentMax == null || remaining <= Number(slab.remainingPercentMax)))?.penaltyPercent || 0);
  }
  function taxRates(selected: AccountCode | undefined, payee: Payee | undefined, row?: Row) {
    if (!selected) return { income: 0, sales: 0 };
    const types = row?.itemTypes?.length ? row.itemTypes : row ? [row.itemType] : [];
    const nature = types.find((type) => type === "MEDICINE" || type === "DISPOSABLE") ?? null, origin = types.find((type) => type === "LOCAL" || type === "IMPORTED") ?? null, active = itemTypeTaxRules.filter((rule) => rule.active), rule = active.find((item) => item.natureCategory === nature && item.originCategory === origin) ?? active.find((item) => item.natureCategory === nature && item.originCategory === null) ?? active.find((item) => item.natureCategory === null && item.originCategory === origin);
    if (rule) return { income: Number(rule.incomeTaxPercent), sales: Number(rule.salesTaxPercent) };
    const status = payee ? resolveTaxpayerStatus(taxHistories[payee.id], date) : "INACTIVE", company = payee?.vendorType === "COMPANY";
    return company ? { income: Number(selected[status === "ACTIVE" ? "incomeTaxPercentCompanyActive" : "incomeTaxPercentCompanyInactive"] || 0), sales: selected.salesTaxPercentCompany } : { income: Number(selected[status === "ACTIVE" ? "incomeTaxPercentIndividualActive" : "incomeTaxPercentIndividualInactive"] || 0), sales: selected.salesTaxPercentIndividual };
  }
  function autoDeductions(row: Row, selected = account, payee = payees.find((item) => String(item.id) === row.payeeId)) {
    const rates = taxRates(selected, payee, row);
    const shelfRate = row.shelfLifeDeductionPercent == null ? shelfPercent(row) : row.shelfLifeDeductionPercent;
    return { incomeTax: calculateTax(row.amount, rates.income), salesTax: calculateTax(row.amount, rates.sales), ldCharges: ldCharges(row), shelfLifeDeduction: calculateTax(row.amount, shelfRate) };
  }
  function changeAmount(i: number, amount: number) {
    const selected = accounts.find((item) => String(item.id) === accountId);
    const current = rows[i];
    changeRow(i, {
      amount,
      ...(current.autoIncomeTax && { incomeTax: autoDeductions({ ...current, amount }, selected).incomeTax }),
      ...(current.autoSalesTax && { salesTax: autoDeductions({ ...current, amount }, selected).salesTax }),
      ...(current.autoLdCharges && { ldCharges: autoDeductions({ ...current, amount }, selected).ldCharges }),
      ...(current.autoShelfLifeDeduction && { shelfLifeDeduction: autoDeductions({ ...current, amount }, selected).shelfLifeDeduction }),
    });
  }
  function changeRow(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function changeRowAuto(i: number, patch: Partial<Row>) {
    setRows((previous) => {
      const current = { ...previous[i], ...patch };
      const auto = autoDeductions(current);
      const updated = { ...current, ...(current.autoIncomeTax && { incomeTax: auto.incomeTax }), ...(current.autoSalesTax && { salesTax: auto.salesTax }), ...(current.autoLdCharges && { ldCharges: auto.ldCharges }), ...(current.autoShelfLifeDeduction && { shelfLifeDeduction: auto.shelfLifeDeduction }) };
      return previous.map((row, index) => index === i ? updated : row);
    });
  }
  function loadTaxStatusHistory(payeeId: number) {
    if (taxHistories[payeeId]) return;
    void api<{ taxStatusHistory: VendorTaxStatus[] }>(`/payees/${payeeId}/profile`)
      .then((profile) => setTaxHistories((current) => ({ ...current, [payeeId]: profile.taxStatusHistory || [] })))
      .catch((e: Error) => setError(e.message));
  }
  function choosePayee(i: number, p: Payee) {
    loadTaxStatusHistory(p.id);
    changeRow(i, {
      payeeId: String(p.id),
      ...autoDeductions({ ...rows[i], payeeId: String(p.id) }, account, p),
      autoIncomeTax: true,
      autoSalesTax: true,
      payeeQuery: `${p.code} — ${p.name}`,
    });
    setLookupRow(null);
    setLookupSearch("");
  }
  function chooseAccountFromLookup(selected: AccountCode) {
    chooseAccount(selected.code);
    setAccountLookup(false);
    setLookupSearch("");
  }
  function matchPayee(i: number, value: string) {
    const p = payees.find(
      (x) => value === `${x.code} — ${x.name}` || x.code === value.trim(),
    );
    if (p) loadTaxStatusHistory(p.id);
    const row = { ...rows[i], payeeQuery: value, payeeId: p ? String(p.id) : "" };
    changeRow(i, { payeeQuery: value, payeeId: p ? String(p.id) : "", ...(p ? autoDeductions(row, account, p) : { incomeTax: 0, salesTax: 0 }), autoIncomeTax: true, autoSalesTax: true });
  }
  function addRow() {
    setRows(rows.map((row) => ({ ...row, detailsOpen: false })).concat({ ...blank(), lineSerial: rows.length + 1, detailsOpen: isContingent }));
  }
  function removeRow(i: number) {
    if (rows.length > 1) setRows(rows.filter((_, n) => n !== i));
  }
  function printContingentBill(row: Row) {
    if (!id || !row.id) {
      setError("Save the invoice first, then print the Contingent Bill.");
      return;
    }
    window.open(`/api/invoices/${id}/items/${row.id}/contingent-bill.pdf`, "_blank", "noopener,noreferrer");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!accountId) {
      setError("Select a valid Account Code.");
      return;
    }
    if (rows.some((r) => !r.payeeId || r.amount <= 0)) {
      setError(
        "Every row requires a valid Payee and Amount greater than zero.",
      );
      return;
    }
    if (rows.some((r) => r.incomeTax < 0 || r.salesTax < 0 || r.ldCharges < 0 || r.shelfLifeDeduction < 0 || r.incomeTax + r.salesTax + r.ldCharges + r.shelfLifeDeduction > r.amount)) {
      setError("Deductions cannot be negative and total deductions cannot exceed Amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(id ? `/invoices/${id}` : "/invoices", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          accountCodeId: Number(accountId),
          date,
          isContingent,
          sourceInvoiceSerial: null,
          items: rows.map((r) => ({
            payeeId: Number(r.payeeId),
            amount: r.amount,
            incomeTax: r.incomeTax,
            salesTax: r.salesTax,
            poNumber: r.poNumber || null,
            poDate: r.poDate || null,
            dcNumber: r.dcNumber || null,
            procurementMode: r.procurementMode || null,
            deliveryDueDate: r.deliveryDueDate || null,
            actualDeliveryDate: r.actualDeliveryDate || null,
            manufacturingDate: r.manufacturingDate || null,
            expiryDate: r.expiryDate || null,
            orderDate: r.orderDate || null,
            gracePeriodDays: r.gracePeriodDays,
            deliveryDays: r.deliveryDays,
            itemType: r.itemType,
            ldCharges: r.ldCharges,
            shelfLifeDeduction: r.shelfLifeDeduction,
            shelfLifeDeductionPercent: r.shelfLifeDeductionPercent,
            ...(!isContingent && { chequeNo: r.chequeNo || null }),
            purpose: r.purpose || null,
            lineSerial: r.lineSerial,
          })),
        }),
      });
      if (id) {
        navigate(listPath);
      } else {
        setAccountQuery("");
        setAccountId("");
        setDate(today());
        setRows([{ ...blank(), detailsOpen: isContingent }]);
        setSummary({ totalBudget: 0, totalExpense: 0, balance: 0 });
        await fetchSerial();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visiblePayees = useMemo(() => {
    const q = lookupSearch.toLowerCase();
    return payees
      .filter(
        (p) =>
          !q ||
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [lookupSearch, payees]);
  const grossTotal = useMemo(
    () => rows.reduce((total, row) => total + (Number(row.amount) || 0), 0),
    [rows],
  ), netTotal = useMemo(
    () => rows.reduce((total, row) => total + (Number(row.amount) || 0) - (Number(row.incomeTax) || 0) - (Number(row.salesTax) || 0) - (isContingent ? (Number(row.ldCharges) || 0) + (Number(row.shelfLifeDeduction) || 0) : 0), 0),
    [rows],
  );
  const visibleAccounts = useMemo(() => {
    const q = lookupSearch.toLowerCase();
    return accounts.filter(
      (a) =>
        !q ||
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q),
    );
  }, [lookupSearch, accounts]);
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{isContingent ? (id ? "Contingent Bill Edit" : "Contingent Bill Entry") : (id ? "Invoice Edit" : "Invoice Entry")}</h1>
          <p>F1 = Focused Code Lookup &nbsp; • &nbsp; F5 = Save Invoice</p>
        </div>
        <div className="page-actions">
          <Link className="button" to={listPath}>
            {isContingent ? "Contingent Bill List" : "Invoice List"}
          </Link>
          <button
            type="button"
            className="primary"
            onClick={() => formRef.current?.requestSubmit()}
          >
            Save (F5)
          </button>
        </div>
      </div>
      <form ref={formRef} className="card invoice-form" onSubmit={save}>
        {error && <div className="alert">{error}</div>}
        <div className="invoice-header">
          {!isContingent && !id && <label>PO No.<div className="account-code-input"><input value={sourceSerial} onChange={(e) => setSourceSerial(e.target.value)} placeholder="Enter PO number" /><button type="button" onClick={() => void loadSourceInvoice()} disabled={loadingSource}>{loadingSource ? "..." : "Load"}</button></div></label>}
          <label>
            Account Code
            <div className="account-code-input">
              <input
                list="account-codes"
                value={accountQuery}
                onFocus={() => setFocusedTarget({ type: "account" })}
                onChange={(e) => chooseAccount(e.target.value)}
                placeholder="Type account code"
                required
              />
              <button
                type="button"
                title="Account Code lookup (F1)"
                onClick={() => {
                  setLookupSearch("");
                  setAccountLookup(true);
                }}
              >
                &#128269;
              </button>
            </div>
            <datalist id="account-codes">
              {accounts.map((x) => (
                <option key={x.id} value={x.code}>
                  {x.name}
                </option>
              ))}
            </datalist>
          </label>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (account) void fetchSummary(account.code);
              }}
              required
            />
          </label>
          <label>
            Serial #<input readOnly value={serial ?? "Loading…"} />
          </label>
          <div className="account-description">
            {account
              ? account.name
              : "Select a valid Account Code to show its description"}
          </div>
        </div>
        <div className="summary-boxes">
          <div className="summary-box">
            <span>Total Budget</span>
            <strong>PKR {summary.totalBudget.toLocaleString()}</strong>
          </div>
          <div className="summary-box">
            <span>Total Expense</span>
            <strong>PKR {summary.totalExpense.toLocaleString()}</strong>
          </div>
          <div className="summary-box">
            <span>Balance</span>
            <strong>PKR {summary.balance.toLocaleString()}</strong>
          </div>
        </div>
        <div className={`legacy-grid ${isContingent ? "" : "regular-invoice-grid"}`}>
          <div className="legacy-grid-head">
            <span>Sr #</span>
            <span>Payee</span>
            <span>Amount</span>
            <span>Income Tax</span>
            <span>Sales Tax</span>
            <span>Net Amount</span>
            {!isContingent && <span>Cheque No.</span>}
            <span>Cheque Serial</span>
            <span>Purpose</span>
            <span></span>
          </div>
          {rows.map((r, i) => (
            <div className="legacy-grid-row-group" key={i}>
              <div
                className="legacy-grid-row"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && i === rows.length - 1) {
                    e.preventDefault();
                    addRow();
                  }
                }}
              >
                <span className="line-serial">{i + 1}</span>
                <div className="payee-cell">
                  <input
                    list={`payees-${i}`}
                    value={r.payeeQuery}
                    onFocus={() => setFocusedTarget({ type: "payee", row: i })}
                    onChange={(e) => matchPayee(i, e.target.value)}
                    placeholder="Code or payee name"
                    required
                  />
                  <datalist id={`payees-${i}`}>
                    {payees.map((p) => (
                      <option key={p.id} value={`${p.code} — ${p.name}`} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    title="Payee lookup (F1)"
                    onClick={() => setLookupRow(i)}
                  >
                    ⌕
                  </button>
                </div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={r.amount}
                  onChange={(e) =>
                    changeAmount(i, Number(e.target.value))
                  }
                  required
                />
                <input type="number" min="0" step="0.01" value={r.incomeTax} onChange={(e) => changeRow(i, { incomeTax: Number(e.target.value), autoIncomeTax: false })} required />
                <input type="number" min="0" step="0.01" value={r.salesTax} onChange={(e) => changeRow(i, { salesTax: Number(e.target.value), autoSalesTax: false })} required />
                <input readOnly className="net-amount-input" value={(r.amount - r.incomeTax - r.salesTax - (isContingent ? r.ldCharges + r.shelfLifeDeduction : 0)).toFixed(2)} />
                {!isContingent && <input value={r.chequeNo} onChange={(e) => setRows((current) => current.map((row) => ({ ...row, chequeNo: e.target.value })))} placeholder="Cheque No." />}
                <input className="line-serial-input" type="number" min="1" step="1" value={r.lineSerial} onChange={(e) => setRows((current) => current.map((row) => ({ ...row, lineSerial: Number(e.target.value) })))} placeholder="Cheque serial" />
                <input className="line-serial-input" value={r.purpose} onChange={(e) => setRows((current) => current.map((row) => ({ ...row, purpose: e.target.value })))} placeholder="Enter description" />
                {isContingent ? <button
                  type="button"
                  className="button subtle"
                  onClick={() => setRows(rows.map((row, n) => ({ ...row, detailsOpen: n === i ? !row.detailsOpen : false })))}
                >Bill details</button> : null}
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeRow(i)}
                >
                  ×
                </button>
              </div>
              {isContingent && r.detailsOpen && (
                <div className="details-popover-backdrop" onMouseDown={() => changeRow(i, { detailsOpen: false })}>
                <div className="legacy-grid-row-details" onMouseDown={(event) => event.stopPropagation()}>
                  <div className="details-popover-head">
                    <strong>{isContingent ? "Contingent Bill Details" : "Invoice Line Details"}</strong>
                    <button type="button" onClick={() => changeRow(i, { detailsOpen: false })}>Close</button>
                  </div>
                  <h3 className="details-section-title">Purchase Order Details</h3>
                  <label>
                    Order Date
                    <input type="date" value={r.orderDate} onChange={(e) => changeRowAuto(i, { orderDate: e.target.value, poDate: e.target.value })} />
                  </label>
                  <label>
                    PO No.
                    <input value={r.poNumber} onChange={(e) => changeRow(i, { poNumber: e.target.value })} />
                  </label>
                  <label>
                    PO Date
                    <input type="date" value={r.poDate} onChange={(e) => changeRowAuto(i, { poDate: e.target.value, orderDate: e.target.value })} />
                  </label>
                  <label>
                    DC No.
                    <input value={r.dcNumber} onChange={(e) => changeRow(i, { dcNumber: e.target.value })} />
                  </label>
                  <label>
                    Procurement Mode
                    <select value={r.procurementMode} onChange={(e) => changeRow(i, { procurementMode: e.target.value as Row["procurementMode"] })}>
                      <option value="">—</option>
                      <option value="TENDER">TENDER</option>
                      <option value="QUOTATION">QUOTATION</option>
                    </select>
                  </label>
                  <label>
                    Grace Period (Days)
                    <input type="number" min="0" step="1" placeholder="5" value={r.gracePeriodDays ?? ""} onChange={(e) => changeRowAuto(i, { gracePeriodDays: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))), autoLdCharges: true })} />
                  </label>
                  <h3 className="details-section-title shelf-title">Shelf Life &amp; Delivery Details</h3>
                  <label>
                    Delivery Days
                    <input type="number" min="0" step="1" placeholder="Enter delivery days" value={r.deliveryDays ?? ""} onChange={(e) => changeRowAuto(i, { deliveryDays: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))), autoLdCharges: true })} />
                  </label>
                  <label>
                    Actual Delivery Date
                    <input type="date" value={r.actualDeliveryDate} onChange={(e) => changeRowAuto(i, { actualDeliveryDate: e.target.value })} />
                  </label>
                  <p className="deduction-helper">Total Late Days: {ldCalculation(r).daysLate} Days | Grace Days: {graceDays(r)} Days | Chargeable Days: {ldCalculation(r).chargeableDays} Days</p>
                  <h3 className="details-section-title deductions-title">Deductions</h3>
                  <label>
                    Manual L.D. Amount
                    <input type="number" min="0" step="0.01" value={r.ldCharges} onChange={(e) => changeRow(i, { ldCharges: Number(e.target.value), autoLdCharges: false })} />
                    {ldCalculation(r).isCapped && <small className="deduction-helper">Capped at max limit</small>}
                  </label>
                  <label>
                    Manual Shelf Life Amount
                    <input type="number" min="0" step="0.01" value={r.shelfLifeDeduction} onChange={(e) => changeRow(i, { shelfLifeDeduction: Number(e.target.value), autoShelfLifeDeduction: false })} />
                  </label>
                  <div className="row-print-action">
                    <button type="button" className="button primary" onClick={() => formRef.current?.requestSubmit()}>
                      Save (F5)
                    </button>
                  </div>
                </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addRow}>
          + Add Row
        </button>
        <p className="invoice-help">
          Press Enter on the last row to add another row. Press F1 for the
          focused Account/Payee lookup and F5 to save.
        </p>
        <div className="form-actions">
          <div className="grand-total-box">
            <span>Gross Total</span>
            <strong>
              PKR {grossTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </div>
          <div className="grand-total-box">
            <span>Net Total</span>
            <strong>PKR {netTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
          <Link className="button" to={listPath}>
            Cancel
          </Link>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save (F5)"}
          </button>
        </div>
      </form>
      {lookupRow !== null && (
        <div className="lookup-backdrop" onMouseDown={() => setLookupRow(null)}>
          <div className="card lookup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="page-head">
              <h2>Payee Lookup</h2>
              <button onClick={() => setLookupRow(null)}>Close</button>
            </div>
            <input
              autoFocus
              placeholder="Search code or name"
              value={lookupSearch}
              onChange={(e) => setLookupSearch(e.target.value)}
            />
            {visiblePayees.map((p) => (
              <button
                className="lookup-row"
                key={p.id}
                onClick={() => choosePayee(lookupRow, p)}
              >
                <strong>{p.code}</strong>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {accountLookup && (
        <div
          className="lookup-backdrop"
          onMouseDown={() => setAccountLookup(false)}
        >
          <div className="card lookup" onMouseDown={(e) => e.stopPropagation()}>
            <div className="page-head">
              <h2>Account Code Lookup</h2>
              <button onClick={() => setAccountLookup(false)}>Close</button>
            </div>
            <input
              autoFocus
              placeholder="Search account code or description"
              value={lookupSearch}
              onChange={(e) => setLookupSearch(e.target.value)}
            />
            {visibleAccounts.map((a) => (
              <button
                className="lookup-row"
                key={a.id}
                onClick={() => chooseAccountFromLookup(a)}
              >
                <strong>{a.code}</strong>
                <span>{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
