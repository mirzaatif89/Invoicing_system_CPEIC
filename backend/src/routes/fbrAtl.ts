import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { checkFbrAtl, checkFbrStatl } from "../lib/fbrAtl.js";

const querySchema = z.object({ registrationNo: z.string().trim().min(6).max(30), date: z.string().date().optional() });
export const fbrAtlRouter = Router();
fbrAtlRouter.use(requireAuth);
fbrAtlRouter.get("/:kind/status", async (req, res) => {
  const kind = z.enum(["income", "sales"]).parse(req.params.kind), query = querySchema.parse(req.query);
  try {
    const direct = kind === "sales" && query.date ? await checkFbrStatl(query.registrationNo, query.date) : null;
    res.json({ kind, requestedDate: query.date || null, checkedAt: new Date().toISOString(), mode: direct ? "FBR_REALTIME_API" : "FBR_OFFICIAL_ATL", ...(direct || await checkFbrAtl(kind, query.registrationNo)) });
  }
  catch (error) { res.status(502).json({ error: error instanceof Error ? `FBR service unavailable: ${error.message}` : "FBR service unavailable" }); }
});
