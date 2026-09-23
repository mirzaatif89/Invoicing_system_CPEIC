import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { automaticFiscalYearStart } from "../lib/fiscalYear.js";
import { instituteDefaults, instituteSettingKeys } from "../lib/instituteSettings.js";

const allowedKey = z.literal("currentFiscalYearOverride");
const instituteKeys = instituteSettingKeys;
const ldDefaults = { ldGracePeriodDays: 5, ldRatePercentPerDay: 0.067, ldMaxCapPercent: 10 as number | null };
const ldKeys = ["ldGracePeriodDays", "ldRatePercentPerDay", "ldMaxCapPercent"] as const;
const ldSchema = z.object({ ldGracePeriodDays: z.coerce.number().int().min(0), ldRatePercentPerDay: z.coerce.number().min(0), ldMaxCapPercent: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().min(0).nullable()) });
export const settingsRouter = Router();
settingsRouter.use(requireAuth);
settingsRouter.get("/institute", async (_req, res) => {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...instituteKeys] } } });
  const values = { ...instituteDefaults };
  rows.forEach((row) => { if (row.value !== null && instituteKeys.includes(row.key as typeof instituteKeys[number])) values[row.key as typeof instituteKeys[number]] = row.value; });
  res.json(values);
});
settingsRouter.put("/institute", requireRole("ADMIN"), async (req, res) => {
  const values = z.object(Object.fromEntries(instituteKeys.map((key) => [key, z.string().max(500)])) as Record<typeof instituteKeys[number], z.ZodString>).parse(req.body);
  await prisma.$transaction(instituteKeys.map((key) => prisma.setting.upsert({ where: { key }, update: { value: values[key] }, create: { key, value: values[key] } })));
  res.json(values);
});
settingsRouter.get("/ld-charges", async (_req, res) => {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...ldKeys] } } });
  const values = { ...ldDefaults };
  rows.forEach((row) => { if (row.value != null) (values as Record<string, number | null>)[row.key] = row.key === "ldMaxCapPercent" ? Number(row.value) : Number(row.value); });
  res.json(values);
});
settingsRouter.put("/ld-charges", requireRole("ADMIN"), async (req, res) => {
  const values = ldSchema.parse(req.body);
  await prisma.$transaction(ldKeys.map((key) => prisma.setting.upsert({ where: { key }, update: { value: values[key] == null ? null : String(values[key]) }, create: { key, value: values[key] == null ? null : String(values[key]) } })));
  res.json(values);
});
settingsRouter.get("/:key", async (req, res) => {
  const key = allowedKey.parse(req.params.key), setting = await prisma.setting.findUnique({ where: { key } });
  const automatic = automaticFiscalYearStart();
  res.json({ key, value: setting?.value ?? null, automaticValue: `${automatic}-${String(automatic + 1).slice(-2)}` });
});
settingsRouter.put("/:key", requireRole("ADMIN"), async (req, res) => {
  const key = allowedKey.parse(req.params.key), value = z.object({ value: z.string().regex(/^\d{4}-(?:\d{2}|\d{4})$/).nullable() }).parse(req.body).value;
  res.json(await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } }));
});
