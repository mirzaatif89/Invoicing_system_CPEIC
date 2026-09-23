import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.post("/refresh-data", async (_req, res) => {
  const [users, payees, accounts, invoices, invoiceItems, budgets, budgetItems] = await Promise.all([
    prisma.user.count(), prisma.payee.count(), prisma.accountCode.count(), prisma.invoice.count(), prisma.invoiceItem.count(), prisma.budgetDocument.count(), prisma.budgetDocumentItem.count(),
  ]);
  const [invalidInvoiceTax, invalidAmounts] = await Promise.all([
    prisma.invoiceItem.count({ where: { OR: [{ incomeTax: { lt: 0 } }, { salesTax: { lt: 0 } }] } }),
    prisma.invoiceItem.count({ where: { amount: { lte: 0 } } }),
  ]);
  res.json({ checkedAt: new Date(), databaseConstraints: "Foreign keys active; orphan records prevented by schema", counts: { users, payees, accounts, invoices, invoiceItems, budgets, budgetItems }, issues: { invalidInvoiceTax, invalidAmounts }, status: invalidInvoiceTax + invalidAmounts === 0 ? "healthy" : "attention_required" });
});

const entitySchema = z.enum(["invoice", "budget"]);
async function findEntity(type: z.infer<typeof entitySchema>, number: number) {
  if (type === "invoice") return prisma.invoice.findFirst({ where: { serialNo: number, isContingent: false }, include: { accountCode: true, items: { include: { payee: true } } } });
  return prisma.budgetDocument.findUnique({ where: { documentNo: number }, include: { items: { include: { accountCode: true } } } });
}
adminRouter.get("/records/:type/:number", async (req, res) => {
  const type = entitySchema.parse(req.params.type), number = z.coerce.number().int().positive().parse(req.params.number), record = await findEntity(type, number);
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }
  res.json({ type, number, record });
});
adminRouter.delete("/records/:type/:number", async (req, res) => {
  const type = entitySchema.parse(req.params.type), number = z.coerce.number().int().positive().parse(req.params.number);
  z.object({ confirmation: z.literal("DELETE") }).parse(req.body);
  const record = await findEntity(type, number);
  if (!record) { res.status(404).json({ error: "Record not found" }); return; }
  await prisma.$transaction(async (tx) => {
    if (type === "invoice") await tx.invoice.delete({ where: { id: record.id } });
    else await tx.budgetDocument.delete({ where: { id: record.id } });
    await tx.auditLog.create({ data: { userId: req.user!.id, action: "manual_delete", entityType: type, entityId: String(record.id), details: { deletedBy: req.user!.username, deletedAt: new Date().toISOString(), number, snapshot: JSON.parse(JSON.stringify(record)) } } });
  });
  res.status(204).send();
});

adminRouter.get("/backup", async (_req, res) => {
  const [users, payees, accountCodes, budgetDocuments, budgetDocumentItems, invoices, invoiceItems, settings] = await Promise.all([
    prisma.user.findMany(), prisma.payee.findMany(), prisma.accountCode.findMany(), prisma.budgetDocument.findMany(), prisma.budgetDocumentItem.findMany(), prisma.invoice.findMany(), prisma.invoiceItem.findMany(), prisma.setting.findMany(),
  ]);
  const backup = { format: "wic-accounts-json", version: 1, createdAt: new Date().toISOString(), tables: { users, payees, accountCodes, budgetDocuments, budgetDocumentItems, invoices, invoiceItems, settings } };
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="wic-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.send(JSON.stringify(backup));
});

adminRouter.post("/restore", async (req, res) => {
  if (req.header("X-Confirm-Restore") !== "RESTORE") { res.status(400).json({ error: "RESTORE confirmation header is required" }); return; }
  const backup = z.object({ format: z.literal("wic-accounts-json"), version: z.literal(1), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }).parse(req.body);
  const table = (name: string) => backup.tables[name] || [];
  const dates = (row: Record<string, unknown>, keys: string[]) => ({ ...row, ...Object.fromEntries(keys.filter((key) => row[key]).map((key) => [key, new Date(String(row[key]))])) });
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany(); await tx.invoiceItem.deleteMany(); await tx.budgetDocumentItem.deleteMany(); await tx.invoice.deleteMany(); await tx.budgetDocument.deleteMany(); await tx.setting.deleteMany(); await tx.payee.deleteMany(); await tx.accountCode.deleteMany(); await tx.user.deleteMany();
    if (table("users").length) await tx.user.createMany({ data: table("users").map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (table("payees").length) await tx.payee.createMany({ data: table("payees").map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (table("accountCodes").length) await tx.accountCode.createMany({ data: table("accountCodes").map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (table("settings").length) await tx.setting.createMany({ data: table("settings").map((row) => dates(row, ["updatedAt"])) as never });
    if (table("budgetDocuments").length) await tx.budgetDocument.createMany({ data: table("budgetDocuments").map((row) => dates(row, ["date", "createdAt", "updatedAt"])) as never });
    if (table("invoices").length) await tx.invoice.createMany({ data: table("invoices").map((row) => dates(row, ["date", "createdAt", "updatedAt"])) as never });
    if (table("budgetDocumentItems").length) await tx.budgetDocumentItem.createMany({ data: table("budgetDocumentItems") as never });
    if (table("invoiceItems").length) await tx.invoiceItem.createMany({ data: table("invoiceItems") as never });
  }, { timeout: 60000 });
  res.json({ message: "Backup restored successfully", restoredAt: new Date() });
});
