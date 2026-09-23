import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const id = z.coerce.number().int().positive();
const bankSchema = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150), active: z.coerce.boolean().default(true) });
const branchSchema = z.object({ branchName: z.string().trim().min(1).max(150), branchCode: z.string().trim().min(1).max(30), address: z.string().trim().max(300).nullable().optional(), active: z.coerce.boolean().default(true) });
const duplicate = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function nextCode() {
  const [banks, branches] = await Promise.all([prisma.bank.findMany({ select: { code: true } }), prisma.bankBranch.findMany({ select: { branchCode: true } })]);
  const codes = [...banks.map(({ code }) => code), ...branches.map(({ branchCode }) => branchCode)];
  return String(codes.reduce((highest, code) => /^\d+$/.test(code) ? Math.max(highest, Number(code)) : highest, 0) + 1);
}
async function bankCodeAvailable(code: string, excludingId?: number) {
  const [sameBank, sameBranch] = await Promise.all([
    prisma.bank.findFirst({ where: { code, ...(excludingId ? { id: { not: excludingId } } : {}) } }),
    prisma.bankBranch.findFirst({ where: { branchCode: code } }),
  ]);
  return !sameBank && !sameBranch;
}
async function branchCodeAvailable(code: string, excludingId?: number) {
  const [sameBank, sameBranch] = await Promise.all([
    prisma.bank.findFirst({ where: { code } }),
    prisma.bankBranch.findFirst({ where: { branchCode: code, ...(excludingId ? { id: { not: excludingId } } : {}) } }),
  ]);
  return !sameBank && !sameBranch;
}

export const bankRouter = Router();
bankRouter.use(requireAuth);
bankRouter.get("/next-code", async (_req, res) => res.json({ code: await nextCode() }));
bankRouter.get("/:bankId/branches/next-code", async (_req, res) => res.json({ code: await nextCode() }));
bankRouter.get("/", async (_req, res) => res.json({ data: await prisma.bank.findMany({ include: { branches: { orderBy: { branchName: "asc" } } }, orderBy: { name: "asc" } }) }));
bankRouter.post("/", requireAnyRole("ADMIN"), async (req, res) => {
  const data = bankSchema.parse(req.body);
  if (!await bankCodeAvailable(data.code)) return res.status(400).json({ error: "This code is already used by a Bank or Branch." });
  try { res.status(201).json(await prisma.bank.create({ data })); }
  catch (error) { if (duplicate(error)) res.status(400).json({ error: "Bank name or code already exists." }); else throw error; }
});
bankRouter.put("/:id", requireAnyRole("ADMIN"), async (req, res) => {
  const bankId = id.parse(req.params.id), data = bankSchema.parse(req.body);
  if (!await bankCodeAvailable(data.code, bankId)) return res.status(400).json({ error: "This code is already used by a Bank or Branch." });
  res.json(await prisma.bank.update({ where: { id: bankId }, data }));
});
bankRouter.delete("/:id", requireAnyRole("ADMIN"), async (req, res) => { await prisma.bank.delete({ where: { id: id.parse(req.params.id) } }); res.status(204).send(); });
bankRouter.post("/:bankId/branches", requireAnyRole("ADMIN"), async (req, res) => {
  const data = branchSchema.parse(req.body);
  if (!await branchCodeAvailable(data.branchCode)) return res.status(400).json({ error: "This code is already used by a Bank or Branch." });
  try { res.status(201).json(await prisma.bankBranch.create({ data: { ...data, bankId: id.parse(req.params.bankId) } })); }
  catch (error) { if (duplicate(error)) res.status(400).json({ error: "Branch name or code already exists." }); else throw error; }
});
bankRouter.put("/branches/:id", requireAnyRole("ADMIN"), async (req, res) => {
  const branchId = id.parse(req.params.id), data = branchSchema.parse(req.body);
  if (!await branchCodeAvailable(data.branchCode, branchId)) return res.status(400).json({ error: "This code is already used by a Bank or Branch." });
  res.json(await prisma.bankBranch.update({ where: { id: branchId }, data }));
});
bankRouter.delete("/branches/:id", requireAnyRole("ADMIN"), async (req, res) => { await prisma.bankBranch.delete({ where: { id: id.parse(req.params.id) } }); res.status(204).send(); });
