import PDFDocument from "pdfkit";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getInstituteSettings } from "../lib/instituteSettings.js";
import { sendChequeAuthoritySchedule } from "../lib/reportOutput.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";

const idSchema = z.coerce.number().int().positive();
const createSchema = z.object({ date: z.coerce.date(), chequeIds: z.array(z.coerce.number().int().positive()).min(1) });
const updateSchema = z.object({ daoReferenceNo: z.string().trim().max(150).nullable().optional(), daoReferenceDate: z.coerce.date().nullable().optional() });
const listDates = z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), unpaidOnly: z.enum(["true", "false"]).optional() });

const chequeInclude = {
  invoice: { include: { accountCode: true } },
  bankBranch: { include: { bank: true } },
} as const;

const mapCheque = (cheque: any) => ({
  id: cheque.id, chequeNo: cheque.chequeNo, chequeSerial: cheque.chequeSerial, chequeDate: cheque.chequeDate,
  amount: Number(cheque.amount), recipientName: cheque.recipientName, paid: cheque.paid, label: cheque.label || cheque.type,
  accountCode: cheque.invoice.accountCode, invoiceSerial: cheque.invoice.serialNo,
  poNumbers: [...new Set(cheque.invoice.items?.map((item: any) => item.poNumber).filter(Boolean) || [])],
  bankBranch: cheque.bankBranch ? { bankName: cheque.bankBranch.bank.name, branchName: cheque.bankBranch.branchName } : null,
});

export const chequeScheduleRouter = Router();
chequeScheduleRouter.use(requireAuth);

chequeScheduleRouter.get("/unscheduled-cheques", async (req, res) => {
  const q = listDates.parse(req.query);
  const cheques = await prisma.invoiceCheque.findMany({
    where: {
      chequeAuthorityScheduleId: null,
      ...(q.unpaidOnly === "true" ? { paid: false } : {}),
      ...(q.dateFrom || q.dateTo ? { chequeDate: { ...(q.dateFrom ? { gte: new Date(`${q.dateFrom}T00:00:00Z`) } : {}), ...(q.dateTo ? { lte: new Date(`${q.dateTo}T23:59:59Z`) } : {}) } } : {}),
    },
    include: { ...chequeInclude, invoice: { include: { accountCode: true, items: { select: { poNumber: true } } } } },
    orderBy: [{ chequeDate: "asc" }, { id: "asc" }],
  });
  res.json({ data: cheques.map(mapCheque) });
});

chequeScheduleRouter.post("/", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const input = createSchema.parse(req.body);
  const chequeIds = [...new Set(input.chequeIds)];
  try {
    const schedule = await prisma.$transaction(async (tx) => {
      const count = await tx.invoiceCheque.count({ where: { id: { in: chequeIds }, chequeAuthorityScheduleId: null } });
      if (count !== chequeIds.length) throw Object.assign(new Error("One or more selected cheques are already assigned to a schedule."), { status: 409 });
      const max = await tx.chequeAuthoritySchedule.aggregate({ _max: { serialNo: true } });
      const created = await tx.chequeAuthoritySchedule.create({ data: { serialNo: (max._max.serialNo || 0) + 1, date: input.date, createdById: req.user!.id } });
      const assigned = await tx.invoiceCheque.updateMany({ where: { id: { in: chequeIds }, chequeAuthorityScheduleId: null }, data: { chequeAuthorityScheduleId: created.id } });
      if (assigned.count !== chequeIds.length) throw Object.assign(new Error("Selected cheques changed while creating the schedule. Please retry."), { status: 409 });
      return created;
    });
    res.status(201).json(schedule);
  } catch (error) {
    if (error instanceof Error && "status" in error) { res.status(Number((error as any).status)).json({ error: error.message }); return; }
    throw error;
  }
});

chequeScheduleRouter.get("/", async (_req, res) => {
  const schedules = await prisma.chequeAuthoritySchedule.findMany({
    include: { _count: { select: { items: true } }, items: { select: { amount: true } } },
    orderBy: [{ date: "desc" }, { serialNo: "desc" }],
  });
  res.json({ data: schedules.map((schedule) => ({ id: schedule.id, serialNo: schedule.serialNo, date: schedule.date, daoReferenceNo: schedule.daoReferenceNo, daoReferenceDate: schedule.daoReferenceDate, chequeCount: schedule._count.items, totalAmount: schedule.items.reduce((sum, item) => sum + Number(item.amount), 0) })) });
});

chequeScheduleRouter.get("/:id", async (req, res) => {
  const schedule = await prisma.chequeAuthoritySchedule.findUnique({ where: { id: idSchema.parse(req.params.id) }, include: { items: { include: { ...chequeInclude, invoice: { include: { accountCode: true } } }, orderBy: { id: "asc" } } } });
  if (!schedule) { res.status(404).json({ error: "Cheque authority schedule not found." }); return; }
  const settings = await getInstituteSettings();
  if (req.query.format === "pdf") {
    const document = new PDFDocument({ size: "A4", layout: "portrait", margin: 18 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="assignment-account-cheques-${schedule.serialNo}.pdf"`);
    document.pipe(res);
    sendChequeAuthoritySchedule(document, { serialNo: schedule.serialNo, date: schedule.date.toISOString().slice(0, 10), daoReferenceNo: schedule.daoReferenceNo, daoReferenceDate: schedule.daoReferenceDate?.toISOString().slice(0, 10) || null, settings, rows: schedule.items.map((cheque) => ({ chequeNo: cheque.chequeNo, date: (cheque.chequeDate || schedule.date).toISOString().slice(0, 10), payee: cheque.recipientName || "-", amount: Number(cheque.amount), accountCode: `${cheque.invoice.accountCode.code}  ${cheque.invoice.accountCode.name}` })) });
    document.end();
    return;
  }
  res.json({ ...schedule, settings, items: schedule.items.map(mapCheque) });
});

chequeScheduleRouter.patch("/:id", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const input = updateSchema.parse(req.body);
  try {
    const schedule = await prisma.chequeAuthoritySchedule.update({ where: { id: idSchema.parse(req.params.id) }, data: input });
    res.json(schedule);
  } catch { res.status(404).json({ error: "Cheque authority schedule not found." }); }
});
