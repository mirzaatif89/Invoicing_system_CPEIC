import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const idSchema = z.coerce.number().int().positive();
const shelfSchema = z.object({
  itemCategory: z.enum(["IMPORTED", "LOCAL"]).default("LOCAL"),
  remainingPercentMin: z.coerce.number().min(0).max(100),
  remainingPercentMax: z.coerce.number().min(0).max(100).nullable().optional(),
  penaltyPercent: z.coerce.number().min(0).max(100),
  active: z.coerce.boolean().default(true),
  notes: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.remainingPercentMax != null && value.remainingPercentMax < value.remainingPercentMin) ctx.addIssue({ code: "custom", path: ["remainingPercentMax"], message: "Remaining % To cannot be less than Remaining % From" });
});

function handle(error: unknown, res: import("express").Response, label: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    res.status(404).json({ error: `${label} not found` });
    return true;
  }
  return false;
}

export const shelfLifePenaltySlabRouter = Router();
shelfLifePenaltySlabRouter.use(requireAuth);
shelfLifePenaltySlabRouter.get("/", async (req, res) => {
  const itemCategory = z.enum(["IMPORTED", "LOCAL"]).optional().parse(req.query.itemCategory);
  res.json({ data: await prisma.shelfLifePenaltySlab.findMany({ where: itemCategory ? { itemCategory } : undefined, orderBy: [{ remainingPercentMin: "asc" }, { id: "asc" }] }) });
});
shelfLifePenaltySlabRouter.post("/", requireAnyRole("ADMIN"), async (req, res) => res.status(201).json(await prisma.shelfLifePenaltySlab.create({ data: shelfSchema.parse(req.body) })));
shelfLifePenaltySlabRouter.put("/:id", requireAnyRole("ADMIN"), async (req, res) => {
  try { res.json(await prisma.shelfLifePenaltySlab.update({ where: { id: idSchema.parse(req.params.id) }, data: shelfSchema.parse(req.body) })); }
  catch (error) { if (!handle(error, res, "Shelf life penalty slab")) throw error; }
});
shelfLifePenaltySlabRouter.delete("/:id", requireAnyRole("ADMIN"), async (req, res) => {
  try { await prisma.shelfLifePenaltySlab.delete({ where: { id: idSchema.parse(req.params.id) } }); res.status(204).send(); }
  catch (error) { if (!handle(error, res, "Shelf life penalty slab")) throw error; }
});
