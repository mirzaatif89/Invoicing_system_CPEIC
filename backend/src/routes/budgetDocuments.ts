import { BudgetType, Prisma } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const itemSchema = z.object({
  accountCodeId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
});
const bodySchema = z.object({
  date: z.coerce.date(),
  budgetType: z.nativeEnum(BudgetType),
  details: z.string().trim().max(5000).nullable().optional(),
  items: z.array(itemSchema).min(1, "At least one budget line is required"),
});
const idSchema = z.coerce.number().int().positive();
const optionalId = z.preprocess(
  (value) => value === "" || value == null ? undefined : value,
  z.coerce.number().int().positive().optional(),
);
const optionalType = z.preprocess(
  (value) => value === "" || value == null ? undefined : value,
  z.nativeEnum(BudgetType).optional(),
);
const listSchema = z.object({
  search: z.string().trim().optional().default(""),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  budgetType: optionalType,
  accountCodeId: optionalId,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const include = {
  items: {
    orderBy: { lineSerial: "asc" as const },
    include: { accountCode: { select: { id: true, code: true, name: true } } },
  },
} as const;

async function nextNumber(db: Pick<typeof prisma, "budgetDocument">) {
  const result = await db.budgetDocument.aggregate({ _max: { documentNo: true } });
  return (result._max.documentNo ?? 0) + 1;
}
async function validateAccounts(db: Pick<typeof prisma, "accountCode">, ids: number[]) {
  const uniqueIds = [...new Set(ids)];
  const count = await db.accountCode.count({ where: { id: { in: uniqueIds } } });
  if (count !== uniqueIds.length) {
    throw Object.assign(new Error("One or more account codes were not found"), { status: 400 });
  }
}
const createItems = (rows: z.infer<typeof itemSchema>[]) =>
  rows.map((row, index) => ({ ...row, lineSerial: index + 1 }));
function handle(error: unknown, res: Response) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: "Document number conflict; please retry" });
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    res.status(404).json({ error: "Budget document not found" });
    return true;
  }
  if (error instanceof Error && "status" in error) {
    res.status(Number(error.status)).json({ error: error.message });
    return true;
  }
  return false;
}

export const budgetDocumentRouter = Router();
budgetDocumentRouter.use(requireAuth);
budgetDocumentRouter.get("/next-number", async (_req, res) => {
  res.json({ documentNo: await nextNumber(prisma) });
});
budgetDocumentRouter.get("/", async (req, res) => {
  const query = listSchema.parse(req.query);
  const where: Prisma.BudgetDocumentWhereInput = {};
  if (query.search && Number.isInteger(Number(query.search))) where.documentNo = Number(query.search);
  if (query.budgetType) where.budgetType = query.budgetType;
  if (query.accountCodeId) where.items = { some: { accountCodeId: query.accountCodeId } };
  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom && { gte: new Date(`${query.dateFrom}T00:00:00Z`) }),
      ...(query.dateTo && { lte: new Date(`${query.dateTo}T23:59:59Z`) }),
    };
  }
  const [data, total] = await Promise.all([
    prisma.budgetDocument.findMany({
      where, include, orderBy: [{ date: "desc" }, { documentNo: "desc" }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize,
    }),
    prisma.budgetDocument.count({ where }),
  ]);
  res.json({ data, pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) } });
});
budgetDocumentRouter.get("/:id", async (req, res) => {
  const document = await prisma.budgetDocument.findUnique({ where: { id: idSchema.parse(req.params.id) }, include });
  if (!document) { res.status(404).json({ error: "Budget document not found" }); return; }
  res.json(document);
});
budgetDocumentRouter.post("/", async (req, res) => {
  const input = bodySchema.parse(req.body);
  try {
    const document = await prisma.$transaction(async (tx) => {
      await validateAccounts(tx as typeof prisma, input.items.map((item) => item.accountCodeId));
      return tx.budgetDocument.create({
        data: {
          date: input.date, budgetType: input.budgetType, documentNo: await nextNumber(tx as typeof prisma),
          details: input.details || null, createdById: req.user!.id, items: { create: createItems(input.items) },
        },
        include,
      });
    });
    res.status(201).json(document);
  } catch (error) { if (!handle(error, res)) throw error; }
});
budgetDocumentRouter.put("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id), input = bodySchema.parse(req.body);
  try {
    const document = await prisma.$transaction(async (tx) => {
      await validateAccounts(tx as typeof prisma, input.items.map((item) => item.accountCodeId));
      await tx.budgetDocumentItem.deleteMany({ where: { budgetDocumentId: id } });
      return tx.budgetDocument.update({
        where: { id },
        data: {
          date: input.date, budgetType: input.budgetType, details: input.details || null,
          updatedById: req.user!.id, items: { create: createItems(input.items) },
        },
        include,
      });
    });
    res.json(document);
  } catch (error) { if (!handle(error, res)) throw error; }
});
budgetDocumentRouter.delete("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  try {
    await prisma.budgetDocument.delete({ where: { id: idSchema.parse(req.params.id) } });
    res.status(204).send();
  } catch (error) { if (!handle(error, res)) throw error; }
});
