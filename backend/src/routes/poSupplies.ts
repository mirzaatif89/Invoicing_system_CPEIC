import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const date = z.preprocess((v) => v === "" || v == null ? null : v, z.coerce.date().nullable().optional());
const deductionAmount = z.preprocess((value) => value === "" || value == null ? 0 : value, z.coerce.number().nonnegative());
const itemTypes = z.array(z.enum(["IMPORTED", "LOCAL", "MEDICINE", "DISPOSABLE"])).min(1).max(4);
const percent = z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().min(0).max(100).nullable());
const schema = z.object({ poNumber: z.string().trim().min(1).max(100), poDate: z.coerce.date(), accountCodeId: z.coerce.number().int().positive(), payeeId: z.coerce.number().int().positive(), dcNumber: z.string().trim().max(100).nullable().optional(), amount: z.coerce.number().positive(), deliveryDays: z.coerce.number().int().nonnegative().nullable().optional(), gracePeriodDays: z.coerce.number().int().nonnegative().nullable().optional(), manualLdAmount: deductionAmount, manualShelfLifeAmount: deductionAmount, manualShelfLifePercent: percent.optional(), actualDeliveryDate: date, manufacturingDate: date, expiryDate: date, itemType: z.enum(["IMPORTED", "LOCAL", "MEDICINE", "DISPOSABLE"]).optional(), itemTypes: itemTypes.optional(), procurementMode: z.enum(["TENDER", "QUOTATION"]).nullable().optional() }).superRefine((input, ctx) => {
  if (input.manualLdAmount + input.manualShelfLifeAmount > input.amount) ctx.addIssue({ code: "custom", path: ["manualLdAmount"], message: "LD and Shelf Life deductions cannot exceed Supply Amount" });
});
const idSchema = z.coerce.number().int().positive();

async function isCompletedPo(poNumber: string) {
  const supplies = await prisma.poSupply.findMany({ where: { poNumber }, select: { payeeId: true, dcNumber: true, contingentInvoiceId: true } });
  if (!supplies.length || supplies.some((supply) => !supply.contingentInvoiceId)) return false;
  const [contingentItems, finalChequeItems] = await Promise.all([
    prisma.invoiceItem.findMany({ where: { poNumber, invoice: { isContingent: true } }, select: { payeeId: true, dcNumber: true } }),
    prisma.invoiceItem.findMany({ where: { poNumber, chequeNo: { not: null }, invoice: { isContingent: false } }, select: { payeeId: true, dcNumber: true } }),
  ]);
  return contingentItems.length >= supplies.length && supplies.every((supply) =>
    finalChequeItems.some((item) => item.payeeId === supply.payeeId && item.dcNumber === supply.dcNumber),
  );
}

export const poSupplyRouter = Router();
poSupplyRouter.use(requireAuth);
poSupplyRouter.get("/", async (req, res) => { const poNumber = z.string().trim().optional().parse(req.query.poNumber), payeeId = z.coerce.number().int().positive().optional().parse(req.query.payeeId); res.json({ data: await prisma.poSupply.findMany({ where: { ...(poNumber ? { poNumber } : {}), ...(payeeId ? { payeeId } : {}) }, include: { payee: { select: { id: true, code: true, name: true } }, accountCode: { select: { id: true, code: true, name: true } }, contingentInvoice: { select: { id: true, serialNo: true } } }, orderBy: [{ poNumber: "asc" }, { id: "asc" }] }) }); });
poSupplyRouter.get("/po-date", async (req, res) => {
  const poNumber = z.string().trim().min(1).max(100).parse(req.query.poNumber);
  const supply = await prisma.poSupply.findFirst({ where: { poNumber }, orderBy: { id: "asc" }, select: { poDate: true } });
  res.json({ poDate: supply?.poDate ?? null });
});
poSupplyRouter.get("/completion-status", async (req, res) => {
  const poNumber = z.string().trim().min(1).max(100).parse(req.query.poNumber);
  const completed = await isCompletedPo(poNumber);
  res.json({ completed, message: completed ? `PO No. ${poNumber} is already completed. Its Contingent Bill and cheque have been created; use a new PO number.` : "" });
});
poSupplyRouter.get("/:id", async (req, res) => { const row = await prisma.poSupply.findUnique({ where: { id: idSchema.parse(req.params.id) } }); if (!row) { res.status(404).json({ error: "Supply order not found" }); return; } res.json(row); });
poSupplyRouter.post("/", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const parsed = schema.parse(req.body);
  const selectedTypes = [...new Set(parsed.itemTypes?.length ? parsed.itemTypes : [parsed.itemType ?? "LOCAL"])];
  // One PO must retain its original PO date across every later DC. The first
  // saved DC is the source of truth, regardless of what a client submits.
  const existingPo = await prisma.poSupply.findFirst({ where: { poNumber: parsed.poNumber }, orderBy: { id: "asc" }, select: { poDate: true } });
  const input = { ...parsed, poDate: existingPo?.poDate ?? parsed.poDate, itemType: selectedTypes[0], itemTypes: selectedTypes };
  if (await isCompletedPo(input.poNumber)) {
    res.status(409).json({ error: `PO No. ${input.poNumber} is already completed. Its Contingent Bill and cheque have been created; use a new PO number.` });
    return;
  }
  res.status(201).json(await prisma.poSupply.create({ data: input }));
});
poSupplyRouter.put("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => { const id = idSchema.parse(req.params.id); const existing = await prisma.poSupply.findUnique({ where: { id }, select: { contingentInvoiceId: true } }); if (!existing) { res.status(404).json({ error: "Supply order not found" }); return; } if (existing.contingentInvoiceId) { res.status(400).json({ error: "A supply already in a Contingent Bill cannot be edited." }); return; } const parsed = schema.parse(req.body); const selectedTypes = [...new Set(parsed.itemTypes?.length ? parsed.itemTypes : [parsed.itemType ?? "LOCAL"])]; const existingPo = await prisma.poSupply.findFirst({ where: { poNumber: parsed.poNumber, id: { not: id } }, orderBy: { id: "asc" }, select: { poDate: true } }); res.json(await prisma.poSupply.update({ where: { id }, data: { ...parsed, poDate: existingPo?.poDate ?? parsed.poDate, itemType: selectedTypes[0], itemTypes: selectedTypes } })); });
poSupplyRouter.delete("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => { const id = idSchema.parse(req.params.id); const existing = await prisma.poSupply.findUnique({ where: { id }, select: { contingentInvoiceId: true } }); if (!existing) { res.status(404).json({ error: "Supply order not found" }); return; } if (existing.contingentInvoiceId) { res.status(400).json({ error: "Delete the linked Contingent Bill first." }); return; } await prisma.poSupply.delete({ where: { id } }); res.status(204).send(); });
