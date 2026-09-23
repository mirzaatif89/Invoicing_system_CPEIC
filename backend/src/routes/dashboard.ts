import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { defaultFiscalYearStart } from "../lib/fiscalYear.js";

const yearQuery = z.object({ fiscalYear: z.string().regex(/^\d{4}(?:-(?:\d{2}|\d{4}))?$/).optional() });
const monthNames = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const datesFor = (startYear: number) => ({ gte: new Date(`${startYear}-07-01T00:00:00Z`), lte: new Date(`${startYear + 1}-06-30T23:59:59Z`) });
const monthIndex = (date: Date, startYear: number) => (date.getUTCFullYear() - startYear) * 12 + date.getUTCMonth() - 6;

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/summary", async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query), startYear = fiscalYear ? Number(fiscalYear.slice(0, 4)) : await defaultFiscalYearStart(), dates = datesFor(startYear);
  const [budget, invoice, incomeTax, salesTax, invoiceCount, budgetDocumentCount, payeeCount, accountCodeCount, invoiceAccountGroups, invoiceVendorGroups] = await Promise.all([
    prisma.budgetDocumentItem.aggregate({ _sum: { amount: true }, where: { budgetDocument: { date: dates } } }),
    prisma.invoiceItem.aggregate({ _sum: { amount: true }, where: { invoice: { date: dates, isContingent: false } } }),
    prisma.invoiceItem.aggregate({ _sum: { incomeTax: true }, where: { invoice: { date: dates, isContingent: false } } }),
    prisma.invoiceItem.aggregate({ _sum: { salesTax: true }, where: { invoice: { date: dates, isContingent: false } } }),
    prisma.invoice.count({ where: { date: dates, isContingent: false } }), prisma.budgetDocument.count({ where: { date: dates } }),
    prisma.payee.count(), prisma.accountCode.count(),
    prisma.invoiceItem.groupBy({ by: ["invoiceId"], _sum: { amount: true }, where: { invoice: { date: dates, isContingent: false } } }),
    prisma.invoiceItem.groupBy({ by: ["payeeId"], _sum: { amount: true }, where: { invoice: { date: dates, isContingent: false } } }),
  ]);
  const totalBudget = Number(budget._sum.amount ?? 0), totalExpense = Number(invoice._sum.amount ?? 0);
  const invoiceIds = invoiceAccountGroups.map((row) => row.invoiceId);
  const [accountRows, payeeRows] = await Promise.all([
    invoiceIds.length ? prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, accountCode: { select: { code: true, name: true } } } }) : [],
    invoiceVendorGroups.length ? prisma.payee.findMany({ where: { id: { in: invoiceVendorGroups.map((row) => row.payeeId) } }, select: { id: true, code: true, name: true } }) : [],
  ]);
  const accountTotals = new Map<string, { code: string; name: string; totalExpense: number }>();
  invoiceAccountGroups.forEach((row) => { const account = accountRows.find((item) => item.id === row.invoiceId)?.accountCode; if (account) { const current = accountTotals.get(account.code) || { ...account, totalExpense: 0 }; current.totalExpense += Number(row._sum.amount ?? 0); accountTotals.set(account.code, current); } });
  const vendorTotals = new Map<number, { code: string; name: string; totalPaid: number }>();
  invoiceVendorGroups.forEach((row) => { const payee = payeeRows.find((item) => item.id === row.payeeId); if (payee) vendorTotals.set(row.payeeId, { ...payee, totalPaid: Number(row._sum.amount ?? 0) }); });
  res.json({ fiscalYear: `${startYear}-${String(startYear + 1).slice(-2)}`, totalBudget, totalExpense, totalBalance: totalBudget - totalExpense, totalIncomeTaxDeducted: Number(incomeTax._sum.incomeTax ?? 0), totalSalesTaxDeducted: Number(salesTax._sum.salesTax ?? 0), invoiceCount, budgetDocumentCount, payeeCount, accountCodeCount, topAccountCodesByExpense: [...accountTotals.values()].sort((a, b) => b.totalExpense - a.totalExpense).slice(0, 5), topVendorsByPayment: [...vendorTotals.values()].sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5) });
});

dashboardRouter.get("/monthly-payments", async (req, res) => {
  const { fiscalYear } = yearQuery.parse(req.query), startYear = fiscalYear ? Number(fiscalYear.slice(0, 4)) : await defaultFiscalYearStart(), dates = datesFor(startYear);
  const invoiceGroups = await prisma.invoiceItem.groupBy({ by: ["invoiceId"], _sum: { amount: true }, where: { invoice: { date: dates, isContingent: false } } });
  const invoices = invoiceGroups.length ? await prisma.invoice.findMany({ where: { id: { in: invoiceGroups.map((group) => group.invoiceId) } }, select: { id: true, date: true } }) : [];
  const invoiceDates = new Map(invoices.map((invoice) => [invoice.id, invoice.date]));
  const months = monthNames.map((month, index) => ({ month: `${month} ${index < 6 ? startYear : startYear + 1}`, totalPayments: 0 }));
  invoiceGroups.forEach((group) => { const date = invoiceDates.get(group.invoiceId), bucket = date && months[monthIndex(date, startYear)]; if (bucket) bucket.totalPayments += Number(group._sum.amount ?? 0); });
  res.json(months);
});
