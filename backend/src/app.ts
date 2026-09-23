import express from "express";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { payeeRouter } from "./routes/payees.js";
import { accountCodeRouter } from "./routes/accountCodes.js";
import { invoiceRouter } from "./routes/invoices.js";
import { budgetDocumentRouter } from "./routes/budgetDocuments.js";
import { reportsRouter } from "./routes/reports.js";
import { usersRouter } from "./routes/users.js";
import { settingsRouter } from "./routes/settings.js";
import { adminRouter } from "./routes/admin.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { fbrAtlRouter } from "./routes/fbrAtl.js";
import { fbrPortalRouter } from "./routes/fbrPortal.js";
import { shelfLifePenaltySlabRouter } from "./routes/penaltySlabs.js";
import { poSupplyRouter } from "./routes/poSupplies.js";
import { itemTypeTaxRuleRouter } from "./routes/itemTypeTaxRules.js";
import { bankRouter } from "./routes/banks.js";
import { chequeScheduleRouter } from "./routes/chequeSchedules.js";
import { prisma } from "./lib/prisma.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", async (_req, res) => {
  try {
    const users = await prisma.user.count();
    res.json({ status: "ok", database: "connected", users, service: "institute-accounts-api" });
  } catch {
    res.status(503).json({ status: "degraded", database: "disconnected", service: "institute-accounts-api" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/payees", payeeRouter);
app.use("/api/account-codes", accountCodeRouter);
app.use("/api/invoices", invoiceRouter);
app.use("/api/budget-documents", budgetDocumentRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/fbr-atl", fbrAtlRouter);
app.use("/api/fbr-portal", fbrPortalRouter);
app.use("/api/shelf-life-penalty-slabs", shelfLifePenaltySlabRouter);
app.use("/api/po-supplies", poSupplyRouter);
app.use("/api/item-type-tax-rules", itemTypeTaxRuleRouter);
app.use("/api/banks", bankRouter);
app.use("/api/cheque-schedules", chequeScheduleRouter);
if (config.DESKTOP_WEB_DIR && fs.existsSync(config.DESKTOP_WEB_DIR)) {
  app.use(express.static(config.DESKTOP_WEB_DIR));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(config.DESKTOP_WEB_DIR!, "index.html")));
}
app.use(notFound);
app.use(errorHandler);
