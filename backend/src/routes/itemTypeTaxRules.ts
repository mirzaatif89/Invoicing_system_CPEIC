import { Prisma } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const category = z.enum(["MEDICINE", "DISPOSABLE", "LOCAL", "IMPORTED"]);
const nullableCategory = z.preprocess((value) => value === "" || value == null ? null : value, category.nullable());
const ruleSchema = z.object({ natureCategory: nullableCategory.refine((value) => value == null || value === "MEDICINE" || value === "DISPOSABLE"), originCategory: nullableCategory.refine((value) => value == null || value === "LOCAL" || value === "IMPORTED"), incomeTaxPercent: z.coerce.number().min(0).max(100), salesTaxPercent: z.coerce.number().min(0).max(100), active: z.coerce.boolean().default(true), notes: z.preprocess((value) => value === "" ? null : value, z.string().trim().max(500).nullable().optional()) });
const idSchema = z.coerce.number().int().positive();
const duplicate = (error: unknown, res: Response) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? (res.status(400).json({ error: "A rule already exists for this Nature and Origin combination." }), true) : false;
export const itemTypeTaxRuleRouter = Router();
itemTypeTaxRuleRouter.use(requireAuth);
itemTypeTaxRuleRouter.get("/", async (req, res) => { const natureCategory = nullableCategory.optional().parse(req.query.natureCategory); const originCategory = nullableCategory.optional().parse(req.query.originCategory); res.json({ data: await prisma.itemTypeTaxRule.findMany({ where: { ...(natureCategory ? { natureCategory } : {}), ...(originCategory ? { originCategory } : {}) }, orderBy: [{ natureCategory: "asc" }, { originCategory: "asc" }, { id: "asc" }] }) }); });
itemTypeTaxRuleRouter.post("/", requireAnyRole("ADMIN"), async (req, res) => { try { res.status(201).json(await prisma.itemTypeTaxRule.create({ data: ruleSchema.parse(req.body) })); } catch (error) { if (!duplicate(error, res)) throw error; } });
itemTypeTaxRuleRouter.put("/:id", requireAnyRole("ADMIN"), async (req, res) => { try { res.json(await prisma.itemTypeTaxRule.update({ where: { id: idSchema.parse(req.params.id) }, data: ruleSchema.parse(req.body) })); } catch (error) { if (!duplicate(error, res)) throw error; } });
itemTypeTaxRuleRouter.delete("/:id", requireAnyRole("ADMIN"), async (req, res) => { await prisma.itemTypeTaxRule.delete({ where: { id: idSchema.parse(req.params.id) } }); res.status(204).send(); });
