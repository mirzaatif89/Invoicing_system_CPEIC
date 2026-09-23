import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import { sendAsaanAssignmentAccountSchedule, sendChequeAuthoritySchedule, sendReport, type ReportPayload } from "../lib/reportOutput.js";
import { defaultFiscalYearStart } from "../lib/fiscalYear.js";
import { getInstituteSettings, type InstituteSettings } from "../lib/instituteSettings.js";

const dateQuery = z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), format: z.string().optional() });
const serialSchema = z.coerce.number().int().positive();
const idSchema = z.coerce.number().int().positive();
const dateWhere = (from?: string, to?: string) => ({ ...(from && { gte: new Date(`${from}T00:00:00Z`) }), ...(to && { lte: new Date(`${to}T23:59:59Z`) }) });
const moneyTotals = (rows: Record<string, unknown>[], keys: string[]) => Object.fromEntries(keys.map((key) => [key, rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)]));
const rangeLabel = (from?: string, to?: string) => `Date: ${from || "Beginning"} to ${to || "Today"}`;
const invoiceInclude = { accountCode: true, items: { orderBy: { lineSerial: "asc" as const }, include: { payee: true } } } as const;
const invoiceNet = (item: { amount: unknown; incomeTax: unknown; salesTax: unknown; ldCharges?: unknown; shelfLifeDeduction?: unknown }) =>
  Number(item.amount) - Number(item.incomeTax) - Number(item.salesTax) - Number(item.ldCharges ?? 0) - Number(item.shelfLifeDeduction ?? 0);
const fiscalDates = (startYear: number) => ({ gte: new Date(`${startYear}-07-01T00:00:00Z`), lte: new Date(`${startYear + 1}-06-30T23:59:59Z`) });

async function invoiceSchedule(invoice: { id: number; serialNo: number; date: Date; isContingent: boolean; sourceInvoiceSerial?: number | null; accountCode: { id: number; code: string; name: string }; items: Array<{ amount: unknown; incomeTax: unknown; salesTax: unknown; ldCharges?: unknown; shelfLifeDeduction?: unknown; chequeNo: string | null; purpose: string | null; payee: { code: string; name: string } }> }, settings: InstituteSettings, serialNo = invoice.serialNo) {
  const dates = fiscalDates(await defaultFiscalYearStart());
  const accountCodeId = invoice.accountCode.id;
  const [budget, previousInvoices, sourceCheques] = await Promise.all([
    prisma.budgetDocumentItem.aggregate({ _sum: { amount: true }, where: { accountCodeId, budgetDocument: { date: dates } } }),
    prisma.invoiceItem.aggregate({ _sum: { amount: true }, where: { invoice: { accountCodeId, isContingent: false, OR: [{ date: { gte: dates.gte, lt: invoice.date } }, { date: invoice.date, serialNo: { lt: invoice.serialNo } }] } } }),
    invoice.isContingent
      ? prisma.invoiceCheque.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "asc" } })
      : invoice.sourceInvoiceSerial
      ? prisma.invoiceCheque.findMany({
          where: { invoice: { isContingent: true, serialNo: invoice.sourceInvoiceSerial } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const allocatedBudget = Number(budget._sum.amount ?? 0);
  let runningExpense = Number(previousInvoices._sum.amount ?? 0);
  const sourceRows = sourceCheques.length
    ? sourceCheques.map((cheque) => ({
        chequeNo: cheque.chequeNo,
        date: (cheque.chequeDate || invoice.date).toISOString().slice(0, 10),
        amount: Number(cheque.amount),
        incomeTax: cheque.type === "INCOME_TAX" ? Number(cheque.amount) : 0,
        salesTax: cheque.type === "SALES_TAX" ? Number(cheque.amount) : 0,
        netAmount: cheque.type === "VENDOR" ? Number(cheque.amount) : 0,
        payee: cheque.recipientName || "-",
        purpose: cheque.label || "Payment",
      }))
    : invoice.items.map((item) => ({
        chequeNo: item.chequeNo || "",
        date: invoice.date.toISOString().slice(0, 10),
        amount: Number(item.amount),
        incomeTax: Number(item.incomeTax),
        salesTax: Number(item.salesTax),
        netAmount: invoiceNet(item),
        payee: `${item.payee.code}  ${item.payee.name}`,
        purpose: item.purpose || "",
      }));
  const rows = sourceRows.map((item) => {
    const presentBill = item.amount, previousExpense = runningExpense;
    runningExpense += presentBill;
    return { ...item, amount: presentBill, accountCode: invoice.accountCode.code, allocatedBudget, previousExpense, totalUpdated: runningExpense, balance: allocatedBudget - runningExpense };
  });
  return { serialNo, date: invoice.date.toISOString().slice(0, 10), accountCode: invoice.accountCode.code, accountName: invoice.accountCode.name, settings, rows };
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get("/invoices/:serialNo", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({ where: { serialNo: serialSchema.parse(req.params.serialNo), isContingent: false }, include: invoiceInclude });
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  const rows = invoice.items.map((item) => ({ payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), incomeTax: Number(item.incomeTax), salesTax: Number(item.salesTax), netAmount: invoiceNet(item), chequeNo: item.chequeNo || "", purpose: item.purpose || "" }));
  const schedule = req.query.format === "pdf" ? await invoiceSchedule(invoice, await getInstituteSettings()) : undefined;
  sendReport(req, res, { title: `Invoice Voucher #${invoice.serialNo}`, filters: `${invoice.date.toISOString().slice(0, 10)} | ${invoice.accountCode.code} - ${invoice.accountCode.name}`, columns: [{ key: "payee", label: "Payee", width: 2 }, { key: "amount", label: "Amount" }, { key: "incomeTax", label: "Income Tax" }, { key: "salesTax", label: "Sales Tax" }, { key: "netAmount", label: "Net Amount" }, { key: "chequeNo", label: "Cheque No." }, { key: "purpose", label: "Purpose", width: 2 }], rows, totals: { payee: "Grand Total", ...moneyTotals(rows, ["amount", "incomeTax", "salesTax", "netAmount"]) }, schedule });
});

reportsRouter.get("/contingent-invoices/:id", async (req, res) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: idSchema.parse(req.params.id), isContingent: true },
    include: invoiceInclude,
  });
  if (!invoice) { res.status(404).json({ error: "Contingent Bill not found" }); return; }
  const rows = invoice.items.map((item) => ({ payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), incomeTax: Number(item.incomeTax), salesTax: Number(item.salesTax), netAmount: invoiceNet(item), chequeNo: item.chequeNo || "", purpose: item.purpose || "" }));
  const schedule = req.query.format === "pdf" ? await invoiceSchedule(invoice, await getInstituteSettings()) : undefined;
  sendReport(req, res, { title: `Invoice Voucher #${invoice.serialNo}`, filters: `${invoice.date.toISOString().slice(0, 10)} | ${invoice.accountCode.code} - ${invoice.accountCode.name}`, columns: [{ key: "payee", label: "Payee", width: 2 }, { key: "amount", label: "Amount" }, { key: "incomeTax", label: "Income Tax" }, { key: "salesTax", label: "Sales Tax" }, { key: "netAmount", label: "Net Amount" }, { key: "chequeNo", label: "Cheque No." }, { key: "purpose", label: "Purpose", width: 2 }], rows, totals: { payee: "Grand Total", ...moneyTotals(rows, ["amount", "incomeTax", "salesTax", "netAmount"]) }, schedule });
});

reportsRouter.get("/cheque-schedule", async (req, res) => {
  const q = dateQuery.parse(req.query);
  const chequeRows = await prisma.invoiceCheque.findMany({
    include: {
      invoice: { include: { accountCode: true, items: { select: { poNumber: true } } } },
      bankBranch: { include: { bank: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const withinRange = (date: Date) => {
    const value = date.toISOString().slice(0, 10);
    return (!q.dateFrom || value >= q.dateFrom) && (!q.dateTo || value <= q.dateTo);
  };
  const rows: Record<string, unknown>[] = chequeRows
    .filter((cheque) => withinRange(cheque.chequeDate || cheque.invoice.date))
    .map((cheque) => ({
      date: (cheque.chequeDate || cheque.invoice.date).toISOString().slice(0, 10),
      poNumber: [...new Set(cheque.invoice.items.map((item) => item.poNumber).filter(Boolean))].join(", ") || "-",
      chequeNo: cheque.chequeNo,
      chequeSerial: cheque.chequeSerial || "-",
      chequeType: cheque.label || cheque.type.replaceAll("_", " "),
      payee: cheque.recipientName || "-",
      bankBranch: [cheque.bankBranch?.bank.name, cheque.bankBranch?.branchName].filter(Boolean).join(" / ") || "-",
      status: cheque.paid ? "Paid" : "Unpaid",
      accountCode: `${cheque.invoice.accountCode.code} - ${cheque.invoice.accountCode.name}`,
      source: `Contingent Bill ${cheque.invoice.serialNo}`,
      amount: Number(cheque.amount),
    }));
  rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  sendReport(req, res, { title: "Cheque Schedule", filters: rangeLabel(q.dateFrom, q.dateTo), columns: [{ key: "date", label: "Date" }, { key: "poNumber", label: "PO No." }, { key: "chequeNo", label: "Cheque No." }, { key: "chequeSerial", label: "Cheque Serial" }, { key: "chequeType", label: "Cheque Type / Purpose" }, { key: "payee", label: "Recipient / Payee", width: 2 }, { key: "bankBranch", label: "Bank / Branch", width: 2 }, { key: "accountCode", label: "Account Code", width: 2 }, { key: "status", label: "Status" }, { key: "source", label: "Source" }, { key: "amount", label: "Amount" }], rows, totals: { source: "Grand Total", ...moneyTotals(rows, ["amount"]) } });
});

// Daily payment scheduling is deliberately restricted to the actual vendor
// disbursement cheque. Tax deduction cheques remain available in Cheque
// Schedule, but must never appear in this vendor-payment authority form.
reportsRouter.get("/payment-scheduling", async (req, res) => {
  const q = dateQuery.parse(req.query);
  const cheques = await prisma.invoiceCheque.findMany({
    where: {
      type: "VENDOR",
      chequeDate: dateWhere(q.dateFrom, q.dateTo),
    },
    include: {
      invoice: { include: { accountCode: true, items: { select: { poNumber: true } } } },
      bankBranch: { include: { bank: true } },
    },
    orderBy: [{ chequeDate: "asc" }, { id: "asc" }],
  });
  const rows: Record<string, unknown>[] = cheques.map((cheque) => ({
    date: (cheque.chequeDate || cheque.invoice.date).toISOString().slice(0, 10),
    poNumber: [...new Set(cheque.invoice.items.map((item) => item.poNumber).filter(Boolean))].join(", ") || "-",
    chequeNo: cheque.chequeNo,
    chequeSerial: cheque.chequeSerial || "-",
    payee: cheque.recipientName || "-",
    bankBranch: [cheque.bankBranch?.bank.name, cheque.bankBranch?.branchName].filter(Boolean).join(" / ") || "-",
    accountCode: `${cheque.invoice.accountCode.code} - ${cheque.invoice.accountCode.name}`,
    status: cheque.paid ? "Paid" : "Unpaid",
    amount: Number(cheque.amount),
  }));

  if (q.format === "pdf") {
    const settings = await getInstituteSettings();
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 18 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=vendor-payment-schedule.pdf");
    document.pipe(res);
    sendChequeAuthoritySchedule(document, {
      serialNo: "",
      date: q.dateFrom && q.dateTo && q.dateFrom !== q.dateTo ? `${q.dateFrom} to ${q.dateTo}` : q.dateFrom || q.dateTo || new Date().toISOString().slice(0, 10),
      daoReferenceNo: null,
      daoReferenceDate: null,
      settings,
      rows: cheques.map((cheque) => ({
        chequeNo: cheque.chequeNo,
        date: (cheque.chequeDate || cheque.invoice.date).toISOString().slice(0, 10),
        payee: cheque.recipientName || "-",
        amount: Number(cheque.amount),
        accountCode: `${cheque.invoice.accountCode.code} - ${cheque.invoice.accountCode.name}`,
      })),
    });
    document.end();
    return;
  }

  sendReport(req, res, {
    title: "Daily Vendor Payment Scheduling",
    filters: rangeLabel(q.dateFrom, q.dateTo),
    columns: [{ key: "date", label: "Date" }, { key: "poNumber", label: "PO No." }, { key: "chequeNo", label: "Cheque No." }, { key: "chequeSerial", label: "Cheque Serial" }, { key: "payee", label: "Vendor / Payee", width: 2 }, { key: "bankBranch", label: "Bank / Branch", width: 2 }, { key: "accountCode", label: "Account Code", width: 2 }, { key: "status", label: "Status" }, { key: "amount", label: "Amount" }],
    rows,
    totals: { accountCode: "Grand Total", ...moneyTotals(rows, ["amount"]) },
  });
});

// One vendor's daily authority form. This is intentionally separate from the
// combined Payment Scheduling report so each vendor can be printed on its own
// official assignment-account-cheque schedule.
reportsRouter.get("/single-payment-scheduling", async (req, res) => {
  const q = dateQuery.extend({ payeeCode: z.string().trim().min(1) }).parse(req.query);
  const payee = await prisma.payee.findUnique({ where: { code: q.payeeCode } });
  if (!payee) { res.status(404).json({ error: "Vendor not found." }); return; }
  const cheques = await prisma.invoiceCheque.findMany({
    where: {
      type: "VENDOR",
      chequeDate: dateWhere(q.dateFrom, q.dateTo),
      invoice: { items: { some: { payeeId: payee.id } } },
    },
    include: {
      invoice: { include: { accountCode: true, items: { select: { poNumber: true, payeeId: true } } } },
      bankBranch: { include: { bank: true } },
    },
    orderBy: [{ chequeDate: "asc" }, { id: "asc" }],
  });
  const rows: Record<string, unknown>[] = cheques.map((cheque) => ({
    date: (cheque.chequeDate || cheque.invoice.date).toISOString().slice(0, 10),
    poNumber: [...new Set(cheque.invoice.items.filter((item) => item.payeeId === payee.id).map((item) => item.poNumber).filter(Boolean))].join(", ") || "-",
    chequeNo: cheque.chequeNo,
    chequeSerial: cheque.chequeSerial || "-",
    payee: cheque.recipientName || payee.name,
    bankBranch: [cheque.bankBranch?.bank.name, cheque.bankBranch?.branchName].filter(Boolean).join(" / ") || "-",
    accountCode: `${cheque.invoice.accountCode.code} - ${cheque.invoice.accountCode.name}`,
    status: cheque.paid ? "Paid" : "Unpaid",
    amount: Number(cheque.amount),
  }));
  if (q.format === "pdf") {
    const settings = await getInstituteSettings();
    const accountIds = [...new Set(cheques.map((cheque) => cheque.invoice.accountCode.id))];
    const period = fiscalDates(await defaultFiscalYearStart());
    const firstChequeDate = cheques[0] ? (cheques[0].chequeDate || cheques[0].invoice.date) : new Date();
    const accountPositions = new Map(await Promise.all(accountIds.map(async (accountCodeId) => {
      const [budget, expense] = await Promise.all([
        prisma.budgetDocumentItem.aggregate({ _sum: { amount: true }, where: { accountCodeId, budgetDocument: { date: period } } }),
        prisma.invoiceItem.aggregate({ _sum: { amount: true }, where: { invoice: { accountCodeId, isContingent: false, date: { gte: period.gte, lt: firstChequeDate } } } }),
      ]);
      return [accountCodeId, { budget: Number(budget._sum.amount ?? 0), expense: Number(expense._sum.amount ?? 0) }] as const;
    })));
    const runningExpense = new Map(accountIds.map((accountCodeId) => [accountCodeId, accountPositions.get(accountCodeId)?.expense || 0]));
    const scheduleRows = cheques.map((cheque) => {
      const account = cheque.invoice.accountCode;
      const previousExpense = runningExpense.get(account.id) || 0;
      const amount = Number(cheque.amount);
      const totalUpdated = previousExpense + amount;
      runningExpense.set(account.id, totalUpdated);
      return {
        chequeNo: cheque.chequeNo,
        date: (cheque.chequeDate || cheque.invoice.date).toISOString().slice(0, 10),
        amount,
        incomeTax: 0,
        salesTax: 0,
        netAmount: amount,
        payee: cheque.recipientName || payee.name,
        purpose: cheque.label || "Vendor Payment",
        accountCode: account.code,
        allocatedBudget: accountPositions.get(account.id)?.budget || 0,
        previousExpense,
        totalUpdated,
        balance: (accountPositions.get(account.id)?.budget || 0) - totalUpdated,
      };
    });
    const firstAccount = cheques[0]?.invoice.accountCode;
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 18 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=single-vendor-payment-${payee.code}.pdf`);
    document.pipe(res);
    sendAsaanAssignmentAccountSchedule(document, {
      serialNo: "",
      date: q.dateFrom && q.dateTo && q.dateFrom !== q.dateTo ? `${q.dateFrom} to ${q.dateTo}` : q.dateFrom || q.dateTo || new Date().toISOString().slice(0, 10),
      accountCode: firstAccount?.code || "",
      accountName: firstAccount?.name || "",
      settings,
      rows: scheduleRows,
    });
    document.end();
    return;
  }
  sendReport(req, res, {
    title: `Single Vendor Payment Scheduling - ${payee.name}`,
    filters: `${payee.code} - ${payee.name} | ${rangeLabel(q.dateFrom, q.dateTo)}`,
    columns: [{ key: "date", label: "Date" }, { key: "poNumber", label: "PO No." }, { key: "chequeNo", label: "Cheque No." }, { key: "chequeSerial", label: "Cheque Serial" }, { key: "payee", label: "Vendor / Payee", width: 2 }, { key: "bankBranch", label: "Bank / Branch", width: 2 }, { key: "accountCode", label: "Account Code", width: 2 }, { key: "status", label: "Status" }, { key: "amount", label: "Amount" }],
    rows,
    totals: { accountCode: "Grand Total", ...moneyTotals(rows, ["amount"]) },
  });
});

async function taxReport(kind: "vendor" | "account", code: string, from?: string, to?: string): Promise<ReportPayload | null> {
  const dates = dateWhere(from, to);
  const entity = kind === "vendor" ? await prisma.payee.findUnique({ where: { code } }) : await prisma.accountCode.findUnique({ where: { code } });
  if (!entity) return null;
  const invoices = await prisma.invoice.findMany({ where: { isContingent: false, date: dates, ...(kind === "vendor" ? { items: { some: { payeeId: entity.id } } } : { accountCodeId: entity.id }) }, include: invoiceInclude });
  const rows = invoices.flatMap((invoice) => invoice.items.filter((item) => kind === "account" || item.payeeId === entity.id).map((item) => ({ date: invoice.date.toISOString().slice(0, 10), serial: invoice.serialNo, accountCode: invoice.accountCode.code, payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), incomeTax: Number(item.incomeTax), salesTax: Number(item.salesTax), netAmount: invoiceNet(item) })));
  return { title: kind === "vendor" ? "Tax Report Of A Vendor" : "Tax Report Of An Account Head", filters: `${code} - ${entity.name} | ${rangeLabel(from, to)}`, columns: [{ key: "date", label: "Date" }, { key: "serial", label: "Invoice #" }, { key: kind === "vendor" ? "accountCode" : "payee", label: kind === "vendor" ? "Account Code" : "Payee", width: 2 }, { key: "amount", label: "Amount" }, { key: "incomeTax", label: "Income Tax" }, { key: "salesTax", label: "Sales Tax" }, { key: "netAmount", label: "Net Amount" }], rows, totals: { [kind === "vendor" ? "accountCode" : "payee"]: "Grand Total", ...moneyTotals(rows, ["amount", "incomeTax", "salesTax", "netAmount"]) } };
}
reportsRouter.get("/vendor-tax", async (req, res) => { const q = dateQuery.extend({ payeeCode: z.string().min(1) }).parse(req.query), report = await taxReport("vendor", q.payeeCode, q.dateFrom, q.dateTo); if (!report) { res.status(404).json({ error: "Payee not found" }); return; } sendReport(req, res, report); });
reportsRouter.get("/account-tax", async (req, res) => { const q = dateQuery.extend({ accountCode: z.string().min(1) }).parse(req.query), report = await taxReport("account", q.accountCode, q.dateFrom, q.dateTo); if (!report) { res.status(404).json({ error: "Account code not found" }); return; } sendReport(req, res, report); });

reportsRouter.get("/deductions/:kind", async (req, res) => {
  const q = dateQuery.parse(req.query);
  const kind = z.enum(["income-tax", "sales-tax", "ld-charges", "shelf-life"]).parse(req.params.kind);
  const definition = {
    "income-tax": { key: "incomeTax", title: "FBR Income Tax Deductions", label: "Income Tax Deducted" },
    "sales-tax": { key: "salesTax", title: "FBR Sales Tax Deductions", label: "Sales Tax Deducted" },
    "ld-charges": { key: "ldCharges", title: "L.D. Charges Deductions", label: "L.D. Charges" },
    "shelf-life": { key: "shelfLifeDeduction", title: "Shelf Life Deductions", label: "Shelf Life Deduction" },
  }[kind];
  const statusField = kind === "income-tax" ? "incomeTaxPaid" : kind === "sales-tax" ? "salesTaxPaid" : null;
  const invoices = await prisma.invoice.findMany({
    where: {
      date: dateWhere(q.dateFrom, q.dateTo),
      // Income/Sales tax are deducted on final invoices. LD and shelf-life
      // are deductions calculated on contingent bills only.
      isContingent: kind === "ld-charges" || kind === "shelf-life",
    },
    include: invoiceInclude,
    orderBy: [{ date: "asc" }, { serialNo: "asc" }],
  });
  const rows = invoices.flatMap((invoice) => invoice.items.map((item) => ({ itemId: item.id, date: invoice.date.toISOString().slice(0, 10), serial: invoice.serialNo, accountCode: invoice.accountCode.code, payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), deduction: Number(item[definition.key as keyof typeof item] ?? 0), status: statusField ? ((item as any)[statusField] ? "Paid" : "Unpaid") : "Retained" })).filter((row) => row.deduction !== 0));
  sendReport(req, res, { title: definition.title, filters: rangeLabel(q.dateFrom, q.dateTo), columns: [{ key: "date", label: "Date" }, { key: "serial", label: "Invoice #" }, { key: "accountCode", label: "Account Code" }, { key: "payee", label: "Vendor", width: 2 }, { key: "amount", label: "Gross Amount" }, { key: "deduction", label: definition.label }, ...(statusField ? [{ key: "status", label: "FBR Status" }] : [])], rows, totals: { payee: "Grand Total", ...moneyTotals(rows, ["amount", "deduction"]) } });
});

async function invoiceLines(from?: string, to?: string, payeeCode?: string) {
  const payee = payeeCode ? await prisma.payee.findUnique({ where: { code: payeeCode } }) : null;
  if (payeeCode && !payee) return null;
  const invoices = await prisma.invoice.findMany({ where: { isContingent: false, date: dateWhere(from, to), ...(payee && { items: { some: { payeeId: payee.id } } }) }, include: invoiceInclude, orderBy: [{ date: "asc" }, { serialNo: "asc" }] });
  return invoices.flatMap((invoice) => invoice.items.filter((item) => !payee || item.payeeId === payee.id).map((item) => ({ date: invoice.date.toISOString().slice(0, 10), serial: invoice.serialNo, accountCode: invoice.accountCode.code, payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), incomeTax: Number(item.incomeTax), salesTax: Number(item.salesTax), netAmount: invoiceNet(item), chequeNo: item.chequeNo || "", purpose: item.purpose || "" })));
}
reportsRouter.get("/payment-register", async (req, res) => { const q = dateQuery.parse(req.query), base = await invoiceLines(q.dateFrom, q.dateTo) || [], rows: Record<string, unknown>[] = []; let runningTotal = 0; base.forEach((row) => { runningTotal += row.netAmount; rows.push({ ...row, runningTotal }); }); sendReport(req, res, { title: "Payment Register", filters: rangeLabel(q.dateFrom, q.dateTo), columns: [{ key: "date", label: "Date" }, { key: "serial", label: "Invoice #" }, { key: "accountCode", label: "Account" }, { key: "payee", label: "Payee", width: 2 }, { key: "amount", label: "Amount" }, { key: "netAmount", label: "Net Amount" }, { key: "runningTotal", label: "Running Total" }], rows, totals: { payee: "Grand Total", ...moneyTotals(rows, ["amount", "netAmount"]) } }); });
reportsRouter.get("/vendor-net-payment", async (req, res) => { const q = dateQuery.extend({ payeeCode: z.string().min(1) }).parse(req.query), rows = await invoiceLines(q.dateFrom, q.dateTo, q.payeeCode); if (!rows) { res.status(404).json({ error: "Payee not found" }); return; } sendReport(req, res, { title: "Net Payment To A Vendor", filters: `${q.payeeCode} | ${rangeLabel(q.dateFrom, q.dateTo)}`, columns: [{ key: "date", label: "Date" }, { key: "serial", label: "Invoice #" }, { key: "accountCode", label: "Account" }, { key: "amount", label: "Amount" }, { key: "incomeTax", label: "Income Tax" }, { key: "salesTax", label: "Sales Tax" }, { key: "netAmount", label: "Net Amount" }], rows, totals: { accountCode: "Grand Total", ...moneyTotals(rows, ["amount", "incomeTax", "salesTax", "netAmount"]) } }); });

reportsRouter.get("/document/:type/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  if (req.params.type === "invoice") {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
    const rows = invoice.items.map((item) => ({ payee: `${item.payee.code} - ${item.payee.name}`, amount: Number(item.amount), incomeTax: Number(item.incomeTax), salesTax: Number(item.salesTax), netAmount: invoiceNet(item), chequeNo: item.chequeNo || "", purpose: item.purpose || "" }));
    const schedule = req.query.format === "pdf" ? await invoiceSchedule(invoice, await getInstituteSettings()) : undefined;
    sendReport(req, res, { title: `Invoice Voucher #${invoice.serialNo}`, filters: `${invoice.date.toISOString().slice(0, 10)} | ${invoice.accountCode.code} - ${invoice.accountCode.name}`, columns: [{ key: "payee", label: "Payee", width: 2 }, { key: "amount", label: "Amount" }, { key: "incomeTax", label: "Income Tax" }, { key: "salesTax", label: "Sales Tax" }, { key: "netAmount", label: "Net Amount" }, { key: "chequeNo", label: "Cheque No." }, { key: "purpose", label: "Purpose", width: 2 }], rows, totals: { payee: "Grand Total", ...moneyTotals(rows, ["amount", "incomeTax", "salesTax", "netAmount"]) }, schedule });
    return;
  }
  if (req.params.type === "budget") {
    const document = await prisma.budgetDocument.findUnique({ where: { id }, include: { items: { include: { accountCode: true }, orderBy: { lineSerial: "asc" } } } });
    if (!document) { res.status(404).json({ error: "Budget document not found" }); return; }
    const rows = document.items.map((item) => ({ accountCode: item.accountCode.code, description: item.accountCode.name, amount: Number(item.amount) }));
    sendReport(req, res, { title: `Budget Document #${document.documentNo}`, filters: `${document.date.toISOString().slice(0, 10)} | ${document.budgetType} | ${document.details || ""}`, columns: [{ key: "accountCode", label: "Account Code" }, { key: "description", label: "Description", width: 3 }, { key: "amount", label: "Amount" }], rows, totals: { description: "Grand Total", ...moneyTotals(rows, ["amount"]) } });
    return;
  }
  res.status(400).json({ error: "Type must be invoice or budget" });
});

reportsRouter.get("/budget-position", async (req, res) => {
  const q = z.object({ fiscalYear: z.string().regex(/^\d{4}(?:-(?:\d{2}|\d{4}))?$/).optional(), accountCode: z.string().optional(), format: z.string().optional() }).parse(req.query);
  const startYear = q.fiscalYear ? Number(q.fiscalYear.slice(0, 4)) : await defaultFiscalYearStart(), dates = dateWhere(`${startYear}-07-01`, `${startYear + 1}-06-30`);
  const accounts = await prisma.accountCode.findMany({ where: q.accountCode ? { code: q.accountCode } : {}, orderBy: { code: "asc" } });
  const rows = await Promise.all(accounts.map(async (account) => { const [budget, invoice] = await Promise.all([prisma.budgetDocumentItem.aggregate({ _sum: { amount: true }, where: { accountCodeId: account.id, budgetDocument: { date: dates } } }), prisma.invoiceItem.aggregate({ _sum: { amount: true }, where: { invoice: { accountCodeId: account.id, date: dates, isContingent: false } } })]); const totalBudget = Number(budget._sum.amount || 0), totalExpense = Number(invoice._sum.amount || 0); return { code: account.code, name: account.name, totalBudget, totalExpense, balance: totalBudget - totalExpense }; }));
  sendReport(req, res, { title: "Budget Position", filters: `Fiscal Year ${startYear}-${String(startYear + 1).slice(-2)}${q.accountCode ? ` | ${q.accountCode}` : ""}`, columns: [{ key: "code", label: "Code" }, { key: "name", label: "Account Name", width: 3 }, { key: "totalBudget", label: "Total Budget" }, { key: "totalExpense", label: "Total Expense" }, { key: "balance", label: "Balance" }], rows, totals: { name: "Grand Total", ...moneyTotals(rows, ["totalBudget", "totalExpense", "balance"]) } });
});

async function groupedReport(kind: "head" | "vendor", from?: string, to?: string) {
  const dates = dateWhere(from, to), map = new Map<string, { code: string; name: string; amount: number; netAmount: number }>();
  const invoices = await prisma.invoice.findMany({ where: { date: dates, isContingent: false }, include: invoiceInclude });
  invoices.forEach((invoice) => invoice.items.forEach((item) => { const entity = kind === "head" ? invoice.accountCode : item.payee, current = map.get(entity.code) || { code: entity.code, name: entity.name, amount: 0, netAmount: 0 }; current.amount += Number(item.amount); current.netAmount += invoiceNet(item); map.set(entity.code, current); }));
  return [...map.values()].sort((a, b) => kind === "head" ? a.code.localeCompare(b.code) : a.name.localeCompare(b.name));
}
for (const [path, kind, title] of [["/head-wise-payment", "head", "Head Wise Payment"], ["/vendor-wise-payment", "vendor", "Vendor Wise Payment"]] as const) reportsRouter.get(path, async (req, res) => { const q = dateQuery.parse(req.query), rows = await groupedReport(kind, q.dateFrom, q.dateTo); sendReport(req, res, { title, filters: rangeLabel(q.dateFrom, q.dateTo), columns: [{ key: "code", label: kind === "head" ? "Account Code" : "Payee Code" }, { key: "name", label: kind === "head" ? "Account Head" : "Vendor", width: 3 }, { key: "amount", label: "Gross Amount" }, { key: "netAmount", label: "Net Payment" }], rows, totals: { name: "Grand Total", ...moneyTotals(rows, ["amount", "netAmount"]) } }); });

reportsRouter.get("/export-excel", async (req, res) => {
  const q = dateQuery.parse(req.query), dates = dateWhere(q.dateFrom, q.dateTo), rows: Record<string, unknown>[] = [];
  const invoices = await prisma.invoice.findMany({ where: { date: dates }, include: invoiceInclude }); invoices.forEach((invoice) => invoice.items.forEach((item) => rows.push({ Type: "Invoice", Date: invoice.date.toISOString().slice(0, 10), Serial: invoice.serialNo, "Account Code": invoice.accountCode.code, Payee: `${item.payee.code} - ${item.payee.name}`, Amount: Number(item.amount), "Income Tax": Number(item.incomeTax), "Sales Tax": Number(item.salesTax), "Net Amount": invoiceNet(item), "Cheque No": item.chequeNo || "", Purpose: item.purpose || "" })));
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet("Documents"); const headers = ["Type", "Date", "Serial", "Account Code", "Payee", "Amount", "Income Tax", "Sales Tax", "Net Amount", "Cheque No", "Purpose"]; sheet.columns = headers.map((header) => ({ header, key: header, width: header === "Payee" || header === "Purpose" ? 28 : 15 })); rows.forEach((row) => sheet.addRow(row)); sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", "attachment; filename=invoice-documents.xlsx"); await workbook.xlsx.write(res); res.end();
});
