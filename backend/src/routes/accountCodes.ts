import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";
import { defaultFiscalYearStart } from "../lib/fiscalYear.js";

const bodySchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).nullable().optional(),
  incomeTaxPercentCompanyActive: z.coerce.number().min(0).max(100).optional(), incomeTaxPercentCompanyInactive: z.coerce.number().min(0).max(100).optional(),
  incomeTaxPercentIndividualActive: z.coerce.number().min(0).max(100).optional(), incomeTaxPercentIndividualInactive: z.coerce.number().min(0).max(100).optional(),
  salesTaxPercentCompany: z.coerce.number().min(0).max(100).optional(),
  salesTaxPercentIndividual: z.coerce.number().min(0).max(100).optional(),
  printFundLabel: z.string().trim().max(250).nullable().optional(),
  sanctionPurposeText: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  (["CompanyActive","CompanyInactive"] as const).forEach(k=>{if((value[`incomeTaxPercent${k}`]??0)+(value.salesTaxPercentCompany??0)>100)ctx.addIssue({code:"custom",path:[`incomeTaxPercent${k}`],message:"Combined company tax cannot exceed 100%"})});
  (["IndividualActive","IndividualInactive"] as const).forEach(k=>{if((value[`incomeTaxPercent${k}`]??0)+(value.salesTaxPercentIndividual??0)>100)ctx.addIssue({code:"custom",path:[`incomeTaxPercent${k}`],message:"Combined individual tax cannot exceed 100%"})});
});
const bulkTaxSchema = z.object({
  incomeTaxPercentCompanyActive: z.coerce.number().min(0).max(100).default(0), incomeTaxPercentCompanyInactive: z.coerce.number().min(0).max(100).default(0), incomeTaxPercentIndividualActive: z.coerce.number().min(0).max(100).default(0), incomeTaxPercentIndividualInactive: z.coerce.number().min(0).max(100).default(0),
  salesTaxPercentCompany: z.coerce.number().min(0).max(100).default(0),
  salesTaxPercentIndividual: z.coerce.number().min(0).max(100).default(0),
}).superRefine((value, ctx) => {
  (["CompanyActive","CompanyInactive"] as const).forEach(k=>{if((value[`incomeTaxPercent${k}`]??0)+(value.salesTaxPercentCompany??0)>100)ctx.addIssue({code:"custom",path:[`incomeTaxPercent${k}`],message:"Combined company tax cannot exceed 100%"})});
  (["IndividualActive","IndividualInactive"] as const).forEach(k=>{if((value[`incomeTaxPercent${k}`]??0)+(value.salesTaxPercentIndividual??0)>100)ctx.addIssue({code:"custom",path:[`incomeTaxPercent${k}`],message:"Combined individual tax cannot exceed 100%"})});
});
const listSchema = z.object({ search: z.string().trim().optional().default(""), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(1000).default(20) });
const idSchema = z.coerce.number().int().positive();

export const accountCodeRouter = Router();
accountCodeRouter.use(requireAuth);
accountCodeRouter.get("/:code/budget-summary", async (req, res) => {
  const fiscalYear = z.string().regex(/^\d{4}(?:-(?:\d{2}|\d{4}))?$/).optional().parse(req.query.fiscalYear);
  const account = await prisma.accountCode.findUnique({ where: { code: req.params.code } });
  if (!account) { res.status(404).json({ error: "Account code not found" }); return; }
  const startYear = fiscalYear ? Number(fiscalYear.slice(0, 4)) : await defaultFiscalYearStart();
  const dates = { gte: new Date(`${startYear}-07-01T00:00:00Z`), lte: new Date(`${startYear + 1}-06-30T23:59:59Z`) };
  const [budget, invoiceExpense] = await Promise.all([
    prisma.budgetDocumentItem.aggregate({ _sum: { amount: true }, where: { accountCodeId: account.id, budgetDocument: { date: dates } } }),
    prisma.invoiceItem.aggregate({ _sum: { amount: true }, where: { invoice: { accountCodeId: account.id, date: dates, isContingent: false } } }),
  ]);
  const totalBudget = Number(budget._sum.amount ?? 0), totalExpense = Number(invoiceExpense._sum.amount ?? 0);
  res.json({ totalBudget, totalExpense, balance: totalBudget - totalExpense });
});
accountCodeRouter.get("/", async (req, res) => {
  const { search, page, pageSize } = listSchema.parse(req.query);
  const where: Prisma.AccountCodeWhereInput = search ? { OR: [{ code: { contains: search } }, { name: { contains: search } }] } : {};
  const [data, total] = await Promise.all([prisma.accountCode.findMany({ where, orderBy: { code: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.accountCode.count({ where })]);
  res.json({ data, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
});
accountCodeRouter.put("/bulk-tax-rates", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const data = bulkTaxSchema.parse(req.body);
  const result = await prisma.accountCode.updateMany({ data });
  res.json({ updated: result.count });
});
accountCodeRouter.get("/:id", async (req, res) => {
  const item = await prisma.accountCode.findUnique({ where: { id: idSchema.parse(req.params.id) } });
  if (!item) { res.status(404).json({ error: "Account code not found" }); return; } res.json(item);
});
accountCodeRouter.post("/", async (req, res) => {
  try { res.status(201).json(await prisma.accountCode.create({ data: bodySchema.parse(req.body) })); }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Account code already exists" }); return; } throw error; }
});
accountCodeRouter.put("/:id", async (req, res) => {
  try { const { code: _unchangedCode, ...data } = bodySchema.parse(req.body); res.json(await prisma.accountCode.update({ where: { id: idSchema.parse(req.params.id) }, data })); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Account code already exists" }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "Account code not found" }); return; } throw error;
  }
});
accountCodeRouter.delete("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  try { await prisma.accountCode.delete({ where: { id: idSchema.parse(req.params.id) } }); res.status(204).send(); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") { res.status(404).json({ error: "Account code not found" }); return; }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") { res.status(409).json({ error: "Account code is in use and cannot be deleted" }); return; } throw error;
  }
});
