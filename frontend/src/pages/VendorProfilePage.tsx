import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

type AccountCode = { code: string; name: string };
type DcRow = {
  id: number;
  dcNumber?: string;
  amount: number;
  poDate: string;
  actualDeliveryDate?: string;
  contingentInvoiceId?: number | null;
};
type Cheque = {
  id: number;
  type: "VENDOR" | "SHELF_LIFE" | "INCOME_TAX" | "SALES_TAX" | "OTHER";
  label?: string | null;
  chequeNo: string;
  chequeSerial?: string | null;
  chequeDate?: string | null;
  amount: number | string;
  bankBranchId?: number | null;
  paid: boolean;
  recipientName?: string | null;
  notes?: string | null;
  bankBranch?: { branchName: string; bank: { name: string } } | null;
};
type PoRow = {
  poNumber: string;
  poDate: string;
  entryDate?: string;
  dcCount: number;
  grossAmount: number;
  netAmount: number;
  chequeNo?: string | null;
  chequePaid: boolean;
  invoiceSerial?: number | null;
  bankBranchId?: number | null;
  bankName?: string | null;
  branchName?: string | null;
  cheques?: Cheque[];
  contingentBillId?: number | null;
  contingentBillItemId?: number | null;
  contingentBillSerial?: number | null;
  accountCode?: AccountCode;
  dcs: DcRow[];
};
type Data = {
  payee: any;
  totals: any;
  pos: PoRow[];
  currentTaxpayerStatus?: string;
};
type Tab = "pos" | "contingency" | "cheques";
type Bank = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  branches: {
    id: number;
    branchCode: string;
    branchName: string;
    active: boolean;
  }[];
};
type PayeeLookup = { id: number; code: string; name: string };
type ChequeEditorRow = {
  key: string;
  id?: number;
  type: Cheque["type"];
  label: string;
  amount: string;
  chequeNo: string;
  chequeSerial: string;
  chequeDate: string;
  bankId: string;
  bankBranchId: string;
  recipientName: string;
  paid: boolean;
  warning: string;
};
type SuggestedCheque = {
  type: "VENDOR" | "INCOME_TAX" | "SALES_TAX";
  label: string;
  suggestedAmount: number;
};
type ChequeEditor = {
  row: PoRow;
  saved: ChequeEditorRow[];
  suggested: SuggestedCheque[];
};
const money = (value: number) =>
  `PKR ${Math.round(Number(value || 0)).toLocaleString()}`;

export default function VendorProfilePage() {
  const { id, billId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [contingencySearchInput, setContingencySearchInput] = useState("");
  const [contingencySearch, setContingencySearch] = useState("");
  const [contingencyStartDate, setContingencyStartDate] = useState("");
  const [contingencyEndDate, setContingencyEndDate] = useState("");
  const [chequeSearchInput, setChequeSearchInput] = useState("");
  const [chequeSearch, setChequeSearch] = useState("");
  const [chequeStartDate, setChequeStartDate] = useState("");
  const [chequeEndDate, setChequeEndDate] = useState("");
  const [openPoNumber, setOpenPoNumber] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("pos");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [payees, setPayees] = useState<PayeeLookup[]>([]);
  const [recipientLookupKey, setRecipientLookupKey] = useState<string | null>(null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientLookupIndex, setRecipientLookupIndex] = useState(0);
  const [viewChequePo, setViewChequePo] = useState<PoRow | null>(null);
  const [chequeEditor, setChequeEditor] = useState<ChequeEditor | null>(null);
  const [chequeEditorError, setChequeEditorError] = useState("");
  const [paymentConfirmation, setPaymentConfirmation] = useState<{
    po: PoRow;
    mode: "done" | "unpaid";
  } | null>(null);
  const [markingPaymentDone, setMarkingPaymentDone] = useState(false);
  const load = async () => {
    try {
      const profile = await api<Data>(`/payees/${id}/profile`);
      setData(profile);
      setError("");
      if (billId) {
        setActiveTab("cheques");
        const bill = profile.pos.find((row) => String(row.contingentBillId) === billId);
        if (bill) void openChequeEditor(bill);
        else setError("Contingent Bill not found for this vendor.");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    void api<{ data: Bank[] }>("/banks")
      .then((result) => setBanks(result.data))
      .catch((e: Error) => setError(e.message));
    void api<{ data: PayeeLookup[] }>("/payees?pageSize=1000")
      .then((result) => setPayees(result.data))
      .catch((e: Error) => setError(e.message));
  }, [id]);
  const editDc = (dc: DcRow) => {
    navigate(
      `/transactions/po-supplies/new?editId=${dc.id}&returnTo=${encodeURIComponent(
        `/management/payees/${id}/profile`,
      )}`,
    );
  };
  const deleteDc = async (dc: DcRow) => {
    if (!confirm(`Delete DC ${dc.dcNumber || "-"}?`)) return;
    try {
      await api(`/po-supplies/${dc.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const moveToContingency = async (row: PoRow) => {
    const supplyIds = row.dcs
      .filter((dc) => !dc.contingentInvoiceId)
      .map((dc) => dc.id);
    if (!supplyIds.length) {
      setError("All DCs for this PO are already in a Contingent Bill.");
      return;
    }
    try {
      await api("/invoices/create-contingent-from-supplies", {
        method: "POST",
        body: JSON.stringify({ supplyIds }),
      });
      await load();
      setOpenPoNumber(null);
      setActiveTab("contingency");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const showBill = (billId: number) => {
    window.location.assign(`/transactions/contingent-bills/${billId}/edit`);
  };
  const printContingentBill = (row: PoRow) => {
    if (!row.contingentBillId) {
      setError("This Contingent Bill does not have a printable item.");
      return;
    }
    window.open(
      `/api/invoices/${row.contingentBillId}/contingent-bill.pdf`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const deleteBill = async (row: PoRow) => {
    if (
      !row.contingentBillId ||
      !confirm(`Delete Contingent Bill #${row.contingentBillSerial || "-"}?`)
    )
      return;
    try {
      await api(`/invoices/${row.contingentBillId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const deleteChequeRecord = async (po: PoRow, cheque: Cheque) => {
    if (
      !po.contingentBillId ||
      !confirm(`Delete cheque ${cheque.chequeNo || "-"}?`)
    )
      return;
    try {
      await api(`/invoices/${po.contingentBillId}/cheques/${cheque.id}`, {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const deleteAllChequeRecords = async (po: PoRow) => {
    const cheques = po.cheques || [];
    if (
      !po.contingentBillId ||
      !cheques.length ||
      !confirm(`Delete all ${cheques.length} cheque(s) for PO ${po.poNumber}?`)
    )
      return;
    try {
      await Promise.all(
        cheques.map((cheque) =>
          api(`/invoices/${po.contingentBillId}/cheques/${cheque.id}`, {
            method: "DELETE",
          }),
        ),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const printInvoice = async (po: PoRow) => {
    if (!po.contingentBillId) return;
    // Open synchronously so browsers do not block the PDF window while the
    // final-invoice lookup is in progress.
    const printWindow = window.open("about:blank", "_blank");
    if (printWindow) printWindow.opener = null;
    try {
      const finalInvoice = await api<{ finalInvoiceSerial: number | null }>(
        `/invoices/${po.contingentBillId}/printable-invoice`,
      );
      const invoiceUrl = finalInvoice.finalInvoiceSerial
        ? `/api/reports/invoices/${finalInvoice.finalInvoiceSerial}?format=pdf`
        : `/api/reports/contingent-invoices/${po.contingentBillId}?format=pdf`;
      if (printWindow) {
        printWindow.location.assign(invoiceUrl);
      } else {
        window.location.assign(invoiceUrl);
      }
    } catch (e) {
      printWindow?.close();
      setError((e as Error).message);
    }
  };
  const markPaymentDone = async (po: PoRow) => {
    if (!po.contingentBillId) return;
    try {
      setMarkingPaymentDone(true);
      await api(`/invoices/${po.contingentBillId}/mark-done`, {
        method: "POST",
      });
      await load();
      setPaymentConfirmation(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarkingPaymentDone(false);
    }
  };
  const markPaymentUnpaid = async (po: PoRow) => {
    if (!po.contingentBillId) return;
    try {
      setMarkingPaymentDone(true);
      await api(`/invoices/${po.contingentBillId}/mark-unpaid`, {
        method: "POST",
      });
      await load();
      setPaymentConfirmation(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMarkingPaymentDone(false);
    }
  };
  const openChequeEditor = async (row: PoRow) => {
    if (!row.contingentBillId) return;
    try {
      setChequeEditorError("");
      const result = await api<{
        suggested: SuggestedCheque[];
        saved: Cheque[];
      }>(`/invoices/${row.contingentBillId}/cheques`);
      const savedRows = result.saved.map((saved) => {
        const bank = banks.find((item) =>
          item.branches.some((branch) => branch.id === saved?.bankBranchId),
        );
        return {
          key: `saved-${saved.id}`,
          id: saved.id,
          type: saved.type,
          label: saved.label || saved.type,
          amount: String(saved.amount),
          chequeNo: saved.chequeNo || "",
          chequeSerial: saved.chequeSerial || "",
          chequeDate: saved.chequeDate
            ? String(saved.chequeDate).slice(0, 10)
            : "",
          bankId: bank ? String(bank.id) : "",
          bankBranchId: saved?.bankBranchId ? String(saved.bankBranchId) : "",
          recipientName: saved.recipientName || "",
          paid: saved.paid || false,
          warning: "",
        } satisfies ChequeEditorRow;
      });
      const chequeDefaults: Array<{ type: SuggestedCheque["type"]; label: string }> = [
        { type: "VENDOR", label: "Vendor Payment" },
        { type: "SALES_TAX", label: "Sales Tax (GST)" },
        { type: "INCOME_TAX", label: "Income Tax" },
      ];
      setChequeEditor({
        row,
        suggested: result.suggested,
        // Every bill uses these four standard payment/deduction cheque types.
        // No unrelated "Other" draft is created in this workflow.
        saved: savedRows.length
          ? savedRows
          : chequeDefaults.map((definition, index) => ({
              key: `draft-${definition.type}-${Date.now()}-${index}`,
              type: definition.type,
              label: definition.label,
              amount: String(result.suggested.find((suggestion) => suggestion.type === definition.type)?.suggestedAmount || 0),
              chequeNo: "",
              chequeSerial: "",
              chequeDate: "",
              bankId: "",
              bankBranchId: "",
              recipientName: data?.payee.name || "",
              paid: false,
              warning: "",
            })),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const closeChequeEditor = () => {
    setChequeEditor(null);
    if (billId) navigate(`/management/payees/${id}/profile`);
  };
  const updateCheque = (
    key: string,
    patch: Partial<ChequeEditorRow>,
  ) =>
    setChequeEditor((current) =>
      current
        ? {
            ...current,
            saved: current.saved.map((row) =>
              row.key === key ? { ...row, ...patch } : row,
            ),
          }
        : current,
    );
  const checkCheque = async (
    row: ChequeEditorRow,
    field: "chequeNo" | "chequeSerial" = "chequeNo",
  ) => {
    const value = field === "chequeSerial" ? row.chequeSerial.trim() : row.chequeNo.trim();
    if (!value || (field === "chequeNo" && !row.bankBranchId)) return;
    try {
      const result = await api<{ available: boolean; message?: string }>(
        field === "chequeSerial"
          ? `/invoices/validate-cheque?field=chequeSerial&chequeSerial=${encodeURIComponent(value)}${row.id ? `&chequeId=${row.id}` : ""}`
          : `/invoices/validate-cheque?chequeNo=${encodeURIComponent(value)}&bankBranchId=${row.bankBranchId}${row.id ? `&chequeId=${row.id}` : ""}`,
      );
      updateCheque(row.key, {
        warning: result.available
          ? ""
          : result.message ||
            (field === "chequeSerial"
              ? "This cheque/schedule serial number is already used."
              : "This cheque number is already used for this bank branch."),
      });
    } catch (e) {
      setChequeEditorError((e as Error).message);
    }
  };
  const missingChequeFields = (row: ChequeEditorRow) => {
    const missing: string[] = [];
    if (!Number(row.amount) || Number(row.amount) <= 0) missing.push("Amount");
    if (!row.chequeNo.trim()) missing.push("Cheque No.");
    if (!row.chequeSerial.trim()) missing.push("Cheque / Schedule Serial No.");
    if (!row.chequeDate) missing.push("Cheque Date");
    if (!row.bankId) missing.push("Bank");
    if (!row.bankBranchId) missing.push("Branch");
    if (!row.recipientName.trim()) missing.push("Recipient / Payee Code");
    if (row.type === "OTHER" && !row.label.trim()) missing.push("Label / Purpose");
    return missing;
  };
  const saveCheque = async (row: ChequeEditorRow) => {
    if (!chequeEditor?.row.contingentBillId) return;
    const missing = missingChequeFields(row);
    if (missing.length) {
      setChequeEditorError(`${row.label}: please complete ${missing.join(", ")}.`);
      return;
    }
    if (row.warning) {
      setChequeEditorError(row.warning);
      return;
    }
    const chequeTotal = (chequeEditor.saved || []).reduce((sum, current) => sum + (current.key === row.key ? Number(row.amount) || 0 : Number(current.amount) || 0), 0);
    const payableAmount = Number(chequeEditor.row.grossAmount) || 0;
    if (chequeTotal > payableAmount) {
      setChequeEditorError(`Invalid amount: total cheques (${Math.round(chequeTotal).toLocaleString()}) cannot exceed this bill's payable amount (${Math.round(payableAmount).toLocaleString()}).`);
      return;
    }
    try {
      setChequeEditorError("");
      await api(
        row.id
          ? `/invoices/${chequeEditor.row.contingentBillId}/cheques/${row.id}`
          : `/invoices/${chequeEditor.row.contingentBillId}/cheques`,
        {
          method: row.id ? "PUT" : "POST",
          body: JSON.stringify({
            type: row.type, label: row.label || null, chequeNo: row.chequeNo.trim(), chequeSerial: row.chequeSerial || null, chequeDate: row.chequeDate || null, amount: Number(row.amount) || 0, bankBranchId: row.bankBranchId ? Number(row.bankBranchId) : null, paid: row.paid, recipientName: row.recipientName || null,
            notes: null,
          }),
        },
      );
      await load();
      await openChequeEditor(chequeEditor.row);
    } catch (e) {
      setChequeEditorError((e as Error).message);
    }
  };
  const clearCheque = async (row: ChequeEditorRow) => {
    if (!chequeEditor?.row.contingentBillId) return;
    try {
      if (row.id) {
        await api(`/invoices/${chequeEditor.row.contingentBillId}/cheques/${row.id}`, {
          method: "DELETE",
        });
        await load();
      }
      setChequeEditor((current) => current ? { ...current, saved: current.saved.filter((item) => item.key !== row.key) } : current);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const createAllCheques = async () => {
    if (!chequeEditor?.row.contingentBillId) return;
    const drafts = chequeEditor.saved.filter((row) => !row.id);
    if (!drafts.length) { setChequeEditorError("There are no new cheques to create."); return; }
    for (const row of drafts) {
      const missing = missingChequeFields(row);
      if (missing.length) { setChequeEditorError(`${row.label}: please complete ${missing.join(", ")}.`); return; }
      if (row.warning) { setChequeEditorError(row.warning); return; }
    }
    const chequeTotal = chequeEditor.saved.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const payableAmount = Number(chequeEditor.row.grossAmount) || 0;
    if (chequeTotal > payableAmount) { setChequeEditorError(`Invalid amount: total cheques (${Math.round(chequeTotal).toLocaleString()}) cannot exceed this bill's payable amount (${Math.round(payableAmount).toLocaleString()}).`); return; }
    try {
      setChequeEditorError("");
      // Sequential creation preserves the backend payable-amount safeguard.
      for (const row of drafts) {
        await api(`/invoices/${chequeEditor.row.contingentBillId}/cheques`, {
          method: "POST",
          body: JSON.stringify({ type: row.type, label: row.label || null, chequeNo: row.chequeNo.trim(), chequeSerial: row.chequeSerial || null, chequeDate: row.chequeDate || null, amount: Number(row.amount) || 0, bankBranchId: row.bankBranchId ? Number(row.bankBranchId) : null, paid: row.paid, recipientName: row.recipientName || null, notes: null }),
        });
      }
      await load();
      await openChequeEditor(chequeEditor.row);
    } catch (e) { setChequeEditorError((e as Error).message); }
  };
  const addCheque = () => {
    setChequeEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        saved: [
          ...current.saved,
          {
            key: `draft-${Date.now()}-${Math.random()}`,
            type: "OTHER",
            label: "",
            amount: "",
            chequeNo: "",
            chequeSerial: "",
            chequeDate: "",
            bankId: "",
            bankBranchId: "",
            recipientName: "",
            paid: false,
            warning: "",
          },
        ],
      };
    });
  };
  const visiblePayees = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    return payees
      .filter(
        (payee) =>
          !query ||
          payee.code.toLowerCase().includes(query) ||
          payee.name.toLowerCase().includes(query),
      )
      .slice(0, 100);
  }, [payees, recipientSearch]);
  const chooseRecipientPayee = (payee: PayeeLookup) => {
    if (!recipientLookupKey) return;
    updateCheque(recipientLookupKey, {
      recipientName: `${payee.code} — ${payee.name}`,
    });
    setRecipientLookupKey(null);
    setRecipientSearch("");
    setRecipientLookupIndex(0);
  };
  if (error && !data) return <div className="alert">{error}</div>;
  if (!data) return <div className="screen-center">Loading...</div>;
  const matchingPos = data.pos.filter((row) => {
    const term = search.trim().toLowerCase(),
      date = String(row.entryDate || row.poDate).slice(0, 10),
      matchesText =
        !term ||
        [row.poNumber, row.accountCode?.code, row.accountCode?.name].some(
          (value) =>
            String(value || "")
              .toLowerCase()
              .includes(term),
        );
    return (
      matchesText &&
      (!startDate || date >= startDate) &&
      (!endDate || date <= endDate)
    );
  });
  const contingentBills = data.pos.filter((row) => {
    if (!row.contingentBillId) return false;
    const term = contingencySearch.trim().toLowerCase();
    const billDate = String(row.entryDate || row.poDate).slice(0, 10);
    const matchesText =
      !term ||
      [row.poNumber, row.contingentBillSerial, row.accountCode?.code, row.accountCode?.name]
        .some((value) => String(value || "").toLowerCase().includes(term));
    return (
      matchesText &&
      (!contingencyStartDate || billDate >= contingencyStartDate) &&
      (!contingencyEndDate || billDate <= contingencyEndDate)
    );
  });
  const chequePoRows = data.pos.filter((po) => {
    const cheques = po.cheques || [];
    if (!cheques.length) return false;
    const term = chequeSearch.trim().toLowerCase();
    const searchableValues: Array<string | number | null | undefined> = [
      po.poNumber,
      po.accountCode?.code,
      po.accountCode?.name,
      ...cheques.flatMap((cheque) => [
        cheque.chequeNo,
        cheque.chequeSerial,
        cheque.recipientName,
        cheque.label,
      ]),
    ];
    const matchesText =
      !term ||
      searchableValues.some((value) =>
        String(value || "").toLowerCase().includes(term),
      );
    const matchesDate = cheques.some((cheque) => {
      const date = String(cheque.chequeDate || po.entryDate || po.poDate).slice(0, 10);
      return (!chequeStartDate || date >= chequeStartDate) && (!chequeEndDate || date <= chequeEndDate);
    });
    return matchesText && matchesDate;
  });
  return (
    <section className="vendor-profile-page">
      <div className="page-head">
        <div>
          <h1>{data.payee.name}</h1>
          <p>Vendor Profile — {data.payee.code}</p>
        </div>
        <Link className="button" to={`/management/payees/${id}/edit`}>
          Edit Vendor
        </Link>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="card">
        <div className="form-grid">
          <label>
            NTN<strong>{data.payee.itaxNo || "-"}</strong>
          </label>
          <label>
            Phone<strong>{data.payee.phone || "-"}</strong>
          </label>
          <label>
            Vendor Type<strong>{data.payee.vendorType || "-"}</strong>
          </label>
          <label>
            Tax Status<strong>{data.currentTaxpayerStatus || "NORMAL"}</strong>
          </label>
        </div>
      </div>
      <div className="summary-cards">
        {[
          ["Total PO Amount", data.totals.grossTotal],
          ["Total Paid", data.totals.paidAmount],
          ["Total Pending", data.totals.pendingAmount],
          ["Cheques Issued", data.totals.chequeCount],
        ].map(([label, value]) => (
          <div className="summary-card" key={String(label)}>
            <span>{label}</span>
            <strong>
              {label === "Cheques Issued" ? value : money(Number(value))}
            </strong>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="vendor-tabs">
          <button
            className={activeTab === "pos" ? "active" : ""}
            onClick={() => setActiveTab("pos")}
          >
            POs
          </button>
          <button
            className={activeTab === "contingency" ? "active" : ""}
            onClick={() => setActiveTab("contingency")}
          >
            Contingency Bills
          </button>
          <button
            className={activeTab === "cheques" ? "active" : ""}
            onClick={() => setActiveTab("cheques")}
          >
            Cheques / Invoices
          </button>
        </div>
        {activeTab === "pos" && (
          <>
            <div className="vendor-po-toolbar">
              <form
                className="vendor-po-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(searchInput);
                }}
              >
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search PO or account code/name"
                />
                <button className="button" type="submit">
                  Search
                </button>
                <input
                  aria-label="Start date"
                  title="Start Date"
                  type="date"
                  value={startDateInput}
                  onChange={(event) => {
                    setStartDateInput(event.target.value);
                    setStartDate(event.target.value);
                  }}
                />
                <input
                  aria-label="End date"
                  title="End Date"
                  type="date"
                  value={endDateInput}
                  onChange={(event) => {
                    setEndDateInput(event.target.value);
                    setEndDate(event.target.value);
                  }}
                />
              </form>
              <Link
                className="button primary"
                to={`/transactions/po-supplies/new?payeeId=${id}`}
              >
                + New PO Supply for this Vendor
              </Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>PO No.</th>
                    <th>Attached DCs</th>
                    <th>Account Name / Code</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matchingPos.length ? (
                    matchingPos.flatMap((row) => {
                      const pending = row.dcs.some(
                          (dc) => !dc.contingentInvoiceId,
                        ),
                        remaining = row.chequePaid ? 0 : row.netAmount;
                      return [
                        <tr key={row.poNumber}>
                          <td>
                            {String(row.entryDate || row.poDate).slice(0, 10)}
                          </td>
                          <td>{row.poNumber}</td>
                          <td>{row.dcCount}</td>
                          <td>
                            {row.accountCode
                              ? `${row.accountCode.code} — ${row.accountCode.name}`
                              : "-"}
                          </td>
                          <td>{money(row.grossAmount)}</td>
                          <td>{money(row.chequePaid ? row.netAmount : 0)}</td>
                          <td>
                            {money(remaining)}{" "}
                            <span
                              className={`cheque-status ${remaining === 0 ? "paid" : "unpaid"}`}
                            >
                              {remaining === 0 ? "Fully Paid" : "Pending"}
                            </span>
                          </td>
                          <td>
                            <div className="po-actions">
                              <button
                                className="button"
                                onClick={() =>
                                  setOpenPoNumber((current) =>
                                    current === row.poNumber
                                      ? null
                                      : row.poNumber,
                                  )
                                }
                              >
                                {openPoNumber === row.poNumber
                                  ? "Hide"
                                  : "View"}
                              </button>
                              <button
                                className="button primary"
                                disabled={!pending}
                                title={
                                  pending
                                    ? "Create a Contingent Bill for pending DCs"
                                    : "All DCs for this PO are already billed"
                                }
                                onClick={() => void moveToContingency(row)}
                              >
                                Move to Contingency
                              </button>
                            </div>
                          </td>
                        </tr>,
                        ...(openPoNumber === row.poNumber
                          ? [
                              <tr
                                className="po-dc-detail"
                                key={`${row.poNumber}-dcs`}
                              >
                                <td colSpan={8}>
                                  <strong>
                                    Attached DCs — PO {row.poNumber}
                                  </strong>
                                  <div className="table-wrap">
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>DC No.</th>
                                          <th>PO Date</th>
                                          <th>Actual Delivery Date</th>
                                          <th>Amount</th>
                                          <th>Status / Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.dcs.map((dc) => (
                                          <tr key={dc.id}>
                                            <td>{dc.dcNumber || "-"}</td>
                                            <td>
                                              {String(dc.poDate).slice(0, 10)}
                                            </td>
                                            <td>
                                              {dc.actualDeliveryDate
                                                ? String(
                                                    dc.actualDeliveryDate,
                                                  ).slice(0, 10)
                                                : "-"}
                                            </td>
                                            <td>{money(dc.amount)}</td>
                                            <td>
                                              {dc.contingentInvoiceId ? (
                                                <div className="po-actions">
                                                  <span className="cheque-status paid">
                                                    Billed — Contingent Bill #
                                                    {row.contingentBillSerial ||
                                                      "-"}
                                                  </span>
                                                  {row.contingentBillId && (
                                                    <button
                                                      className="button"
                                                      onClick={() =>
                                                        showBill(
                                                          row.contingentBillId!,
                                                        )
                                                      }
                                                    >
                                                      View Bill
                                                    </button>
                                                  )}
                                                  <small className="muted">
                                                    Delete the bill first to
                                                    edit or delete this DC.
                                                  </small>
                                                </div>
                                              ) : (
                                                <div className="po-actions">
                                                  <span className="cheque-status unpaid">
                                                    Pending
                                                  </span>
                                                  <button
                                                    onClick={() =>
                                                      void editDc(dc)
                                                    }
                                                  >
                                                    Edit
                                                  </button>
                                                  <button
                                                    className="danger"
                                                    onClick={() =>
                                                      void deleteDc(dc)
                                                    }
                                                  >
                                                    Delete
                                                  </button>
                                                </div>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>,
                            ]
                          : []),
                      ];
                    })
                  ) : (
                    <tr>
                      <td className="empty-state" colSpan={8}>
                        No purchase orders recorded for this vendor yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
        {activeTab === "contingency" && (
          <>
            <div className="vendor-po-toolbar">
              <form
                className="vendor-po-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setContingencySearch(contingencySearchInput);
                }}
              >
                <input
                  value={contingencySearchInput}
                  onChange={(event) => setContingencySearchInput(event.target.value)}
                  placeholder="Search bill, PO or account code/name"
                />
                <button className="button" type="submit">
                  Search
                </button>
                <input
                  aria-label="Contingent bill start date"
                  title="Start Date"
                  type="date"
                  value={contingencyStartDate}
                  onChange={(event) => setContingencyStartDate(event.target.value)}
                />
                <input
                  aria-label="Contingent bill end date"
                  title="End Date"
                  type="date"
                  value={contingencyEndDate}
                  onChange={(event) => setContingencyEndDate(event.target.value)}
                />
              </form>
            </div>
            <div className="table-wrap">
              <table className="contingency-bills-table">
                <thead>
                  <tr>
                    <th>PO No.</th>
                    <th>Contingent Bill</th>
                    <th>Account Code</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contingentBills.length ? (
                    contingentBills.map((row) => (
                      <tr key={row.poNumber}>
                        <td>{row.poNumber}</td>
                        <td>#{row.contingentBillSerial || "-"}</td>
                        <td>
                          {row.accountCode
                            ? `${row.accountCode.code} — ${row.accountCode.name}`
                            : "-"}
                        </td>
                        <td>{money(row.netAmount)}</td>
                        <td>
                          <span
                            className={`cheque-status ${row.chequePaid ? "paid" : "unpaid"}`}
                          >
                            {row.chequePaid ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                        <td>
                          <select
                            aria-label={`Actions for Contingent Bill ${row.contingentBillSerial || ""}`}
                            defaultValue=""
                            onChange={(event) => {
                              const action = event.target.value;
                              event.currentTarget.value = "";
                              if (
                                action === "view-edit" &&
                                row.contingentBillId
                              )
                                showBill(row.contingentBillId);
                              if (action === "print-contingent")
                                printContingentBill(row);
                              if (action === "cheques") void openChequeEditor(row);
                              if (action === "delete") void deleteBill(row);
                            }}
                          >
                            <option value="" disabled>
                              Actions
                            </option>
                            <option value="view-edit">View / Edit</option>
                            <option value="print-contingent">Print Contingent Bill</option>
                            <option value="cheques">Issue Cheques</option>
                            <option value="delete">Delete</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-state" colSpan={6}>
                        No contingent bills generated for this vendor yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {chequeEditor && (
              <div
                className={`lookup-backdrop ${billId ? "cheque-edit-route" : ""}`}
                onMouseDown={closeChequeEditor}
              >
                <div
                  className="card lookup cheque-editor-modal"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="page-head">
                    <div>
                      <h2>Issue Cheques</h2>
                      <p>Contingent Bill #{chequeEditor.row.contingentBillSerial || "-"}</p>
                    </div>
                    <button className="button" onClick={closeChequeEditor}>
                      Close
                    </button>
                  </div>
                  {chequeEditorError && (
                    <div className="alert" role="alert">
                      {chequeEditorError}
                    </div>
                  )}
                  {
                    chequeEditor.saved.map((row) => (
                        <div className="card" key={row.key}>
                          <h3>{row.label || "Create Another Cheque"}</h3>
                          <div className="form-grid">
                            <label>
                              Amount
                              <input
                                type="number"
                                min="0"
                                value={row.amount}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    amount: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Cheque No.
                              <input
                                value={row.chequeNo}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    chequeNo: event.target.value,
                                    warning: "",
                                  })
                                }
                                onBlur={() => void checkCheque(row)}
                              />
                            </label>
                            <label>
                              Cheque / Schedule Serial No.
                              <input
                                value={row.chequeSerial}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    chequeSerial: event.target.value,
                                    warning: "",
                                  })
                                }
                                onBlur={() => void checkCheque(row, "chequeSerial")}
                              />
                            </label>
                            <label>
                              Cheque Date
                              <input
                                type="date"
                                value={row.chequeDate}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    chequeDate: event.target.value,
                                  })
                                }
                              />
                            </label>
                            <label>
                              Bank
                              <select
                                value={row.bankId}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    bankId: event.target.value,
                                    bankBranchId: "",
                                    warning: "",
                                  })
                                }
                              >
                                <option value="">Select Bank</option>
                                {banks
                                  .filter((bank) => bank.active)
                                  .map((bank) => (
                                    <option key={bank.id} value={bank.id}>
                                      {bank.code} — {bank.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Branch
                              <select
                                value={row.bankBranchId}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    bankBranchId: event.target.value,
                                    warning: "",
                                  })
                                }
                              >
                                <option value="">Select Branch</option>
                                {(banks.find(
                                  (bank) => String(bank.id) === row.bankId,
                                )?.branches || [])
                                  .filter((branch) => branch.active)
                                  .map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                      {branch.branchCode} — {branch.branchName}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {row.type === "OTHER" && (
                              <label>
                                Label / Purpose
                                <input
                                  value={row.label}
                                  onChange={(event) =>
                                    updateCheque(row.key, {
                                      label: event.target.value,
                                    })
                                  }
                                  placeholder="Enter cheque purpose"
                                />
                              </label>
                            )}
                            <label>
                              Recipient / Payee Code
                              <input
                                value={row.recipientName}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    recipientName: event.target.value,
                                  })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "F1") {
                                    event.preventDefault();
                                    setRecipientSearch("");
                                    setRecipientLookupIndex(0);
                                    setRecipientLookupKey(row.key);
                                  }
                                }}
                                placeholder="Type manually or press F1 for payee code"
                                title="Press F1 to select a payee code"
                              />
                            </label>
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={row.paid}
                                onChange={(event) =>
                                  updateCheque(row.key, {
                                    paid: event.target.checked,
                                  })
                                }
                              />{" "}
                              Mark as Paid
                            </label>
                          </div>
                          {row.warning && <div className="alert">{row.warning}</div>}
                          <div className="form-actions">
                            <button
                              className="button"
                              onClick={() => void clearCheque(row)}
                            >
                              Delete
                            </button>
                            {row.id && <button
                              className="primary"
                              disabled={Boolean(row.warning)}
                              onClick={() => void saveCheque(row)}
                            >
                              Update Cheque
                            </button>}
                          </div>
                        </div>
                      ))
                  }
                  <div className="form-actions">
                    <button className="button" onClick={() => addCheque()}>
                      + Add Another Cheque
                    </button>
                    {chequeEditor.saved.some((row) => !row.id) && <button className="primary" onClick={() => void createAllCheques()}>
                      Create Cheques
                    </button>}
                    <button className="button" onClick={closeChequeEditor}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {activeTab === "cheques" && (
          <>
            <div className="vendor-po-toolbar">
              <form
                className="vendor-po-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setChequeSearch(chequeSearchInput);
                }}
              >
                <input
                  value={chequeSearchInput}
                  onChange={(event) => setChequeSearchInput(event.target.value)}
                  placeholder="Search PO, account code, cheque no. or recipient"
                />
                <button className="button" type="submit">
                  Search
                </button>
                <input
                  aria-label="Cheque start date"
                  title="Start Date"
                  type="date"
                  value={chequeStartDate}
                  onChange={(event) => setChequeStartDate(event.target.value)}
                />
                <input
                  aria-label="Cheque end date"
                  title="End Date"
                  type="date"
                  value={chequeEndDate}
                  onChange={(event) => setChequeEndDate(event.target.value)}
                />
              </form>
            </div>
            <div className="table-wrap">
              <table className="cheque-invoices-table">
              <thead>
                <tr>
                  <th>Sr.</th>
                  <th>PO No.</th>
                  <th>Account Code</th>
                  <th>Total Cheques</th>
                  <th>Total Amount</th>
                  <th>Payment Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {chequePoRows.length ? (
                  chequePoRows.map((po, index) => {
                    const cheques = po.cheques || [];
                    const totalAmount = cheques.reduce(
                      (total, cheque) => total + Number(cheque.amount),
                      0,
                    );
                    const allPaid = cheques.every((cheque) => cheque.paid);
                    return (
                    <tr key={po.poNumber}>
                      <td>{index + 1}</td>
                      <td>{po.poNumber}</td>
                      <td>
                        {po.accountCode
                          ? `${po.accountCode.code} — ${po.accountCode.name}`
                          : "-"}
                      </td>
                      <td>{cheques.length}</td>
                      <td>{money(totalAmount)}</td>
                      <td>
                        <span
                          className={`cheque-status ${allPaid ? "paid" : "unpaid"}`}
                        >
                          {allPaid ? "Paid" : "Unpaid"}
                        </span>
                      </td>
                      <td>
                        {po.contingentBillId ? (
                          <select
                            aria-label={`Actions for PO ${po.poNumber}`}
                            defaultValue=""
                            onChange={(event) => {
                              const action = event.target.value;
                              event.currentTarget.value = "";
                              if (action === "view") setViewChequePo(po);
                              if (action === "print") void printInvoice(po);
                              if (action === "edit") {
                                setActiveTab("contingency");
                                void openChequeEditor(po);
                              }
                              if (action === "done")
                                setPaymentConfirmation({ po, mode: "done" });
                              if (action === "unpaid")
                                setPaymentConfirmation({ po, mode: "unpaid" });
                              if (action === "delete") void deleteAllChequeRecords(po);
                            }}
                          >
                            <option value="" disabled>
                              Actions
                            </option>
                            <option value="view">View</option>
                            <option value="print">Print Invoice</option>
                            <option value="edit">Edit</option>
                            <option value="done">Mark as Done</option>
                            <option value="unpaid">Mark as Unpaid</option>
                            <option value="delete">Delete</option>
                          </select>
                        ) : (
                          <span className="muted">Bill unavailable</span>
                        )}
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="empty-state" colSpan={7}>
                      No cheques issued yet for this vendor.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </>
        )}
        {viewChequePo && (
          <div
            className="lookup-backdrop"
            onMouseDown={() => setViewChequePo(null)}
          >
            <div
              className="card lookup cheque-details-modal"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="page-head">
                <div>
                  <h2>PO Cheque Details</h2>
                  <p>
                    PO {viewChequePo.poNumber} · {viewChequePo.cheques?.length || 0} cheque(s)
                  </p>
                </div>
                <button className="button" onClick={() => setViewChequePo(null)}>
                  Close
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sr.</th>
                      <th>Purpose</th>
                      <th>Cheque No.</th>
                      <th>Cheque Serial</th>
                      <th>Amount</th>
                      <th>Bank / Branch</th>
                      <th>Payment Status</th>
                      <th>Recipient</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewChequePo.cheques || []).map((cheque, index) => (
                      <tr key={cheque.id}>
                        <td>{index + 1}</td>
                        <td>{cheque.label || cheque.type}</td>
                        <td>{cheque.chequeNo}</td>
                        <td>{cheque.chequeSerial || "-"}</td>
                        <td>{money(Number(cheque.amount))}</td>
                        <td>
                          {[cheque.bankBranch?.bank.name, cheque.bankBranch?.branchName]
                            .filter(Boolean)
                            .join(" / ") || "-"}
                        </td>
                        <td>
                          <span
                            className={`cheque-status ${cheque.paid ? "paid" : "unpaid"}`}
                          >
                            {cheque.paid ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                        <td>{cheque.recipientName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {paymentConfirmation && (
          <div
            className="lookup-backdrop payment-done-backdrop"
            onMouseDown={() => !markingPaymentDone && setPaymentConfirmation(null)}
          >
            <div
              className="card payment-done-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="payment-done-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="payment-done-icon" aria-hidden="true">✓</div>
              <h2 id="payment-done-title">
                {paymentConfirmation.mode === "done"
                  ? "Mark Payment as Done?"
                  : "Mark Payment as Unpaid?"}
              </h2>
              <p>
                {paymentConfirmation.mode === "done" ? (
                  <>
                    All cheques for PO <strong>{paymentConfirmation.po.poNumber}</strong> will
                    be marked as Paid and the budget expense will be posted.
                  </>
                ) : (
                  <>
                    All cheques for PO <strong>{paymentConfirmation.po.poNumber}</strong> will
                    be marked as Unpaid and the related budget posting will be reversed.
                  </>
                )}
              </p>
              <div className="payment-done-note">
                {paymentConfirmation.mode === "done"
                  ? "You can print the final invoice schedule after completing this action."
                  : "The invoice can still be printed as a schedule before it is marked as done again."}
              </div>
              <div className="form-actions payment-done-actions">
                <button
                  type="button"
                  disabled={markingPaymentDone}
                  onClick={() => setPaymentConfirmation(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={markingPaymentDone}
                  onClick={() =>
                    void (paymentConfirmation.mode === "done"
                      ? markPaymentDone(paymentConfirmation.po)
                      : markPaymentUnpaid(paymentConfirmation.po))
                  }
                >
                  {markingPaymentDone
                    ? paymentConfirmation.mode === "done"
                      ? "Posting Payment…"
                      : "Reversing Payment…"
                    : paymentConfirmation.mode === "done"
                      ? "Yes, Mark as Done"
                      : "Yes, Mark as Unpaid"}
                </button>
              </div>
            </div>
          </div>
        )}
        {recipientLookupKey && (
          <div
            className="lookup-backdrop"
            onMouseDown={() => setRecipientLookupKey(null)}
          >
            <div className="card lookup" onMouseDown={(event) => event.stopPropagation()}>
              <div className="page-head">
                <h2>Payee Code Lookup</h2>
                <button onClick={() => setRecipientLookupKey(null)}>Close</button>
              </div>
              <input
                autoFocus
                placeholder="Search payee code or name"
                value={recipientSearch}
                onChange={(event) => {
                  setRecipientSearch(event.target.value);
                  setRecipientLookupIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setRecipientLookupIndex((current) =>
                      Math.min(current + 1, Math.max(visiblePayees.length - 1, 0)),
                    );
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setRecipientLookupIndex((current) => Math.max(current - 1, 0));
                  }
                  if (event.key === "Enter" && visiblePayees[recipientLookupIndex]) {
                    event.preventDefault();
                    chooseRecipientPayee(visiblePayees[recipientLookupIndex]);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setRecipientLookupKey(null);
                  }
                }}
              />
              {visiblePayees.map((payee, index) => (
                <button
                  className={`lookup-row ${index === recipientLookupIndex ? "active" : ""}`}
                  key={payee.id}
                  onMouseEnter={() => setRecipientLookupIndex(index)}
                  onClick={() => chooseRecipientPayee(payee)}
                >
                  <strong>{payee.code}</strong>
                  <span>{payee.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
