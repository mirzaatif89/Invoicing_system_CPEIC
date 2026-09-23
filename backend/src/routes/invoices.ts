import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAnyRole, requireAuth } from "../middleware/auth.js";
import { createContingentBillPdf } from "../lib/contingentBill.js";
import { calculateDueDate, calculateShelfLifeAndDeductions, defaultLdChargeSettings, matchItemTypeTaxRule, roundMoney, selectTaxRates, type ItemTypeTaxRuleLike, type LdChargeSettings } from "../lib/autoDeductions.js";
import { resolveTaxpayerStatus } from "../lib/taxpayerStatus.js";

const itemSchema = z.object({
  payeeId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  incomeTax: z.coerce.number().nonnegative().optional(),
  salesTax: z.coerce.number().nonnegative().optional(),
  poNumber: z.string().trim().max(100).nullable().optional(),
  poDate: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce.date().nullable().optional(),
  ),
  dcNumber: z.string().trim().max(100).nullable().optional(),
  procurementMode: z.enum(["TENDER", "QUOTATION"]).nullable().optional(),
  deliveryDueDate: z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.date().nullable().optional()),
  actualDeliveryDate: z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.date().nullable().optional()),
  manufacturingDate: z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.date().nullable().optional()),
  expiryDate: z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.date().nullable().optional()),
  orderDate: z.preprocess((value) => (value === "" || value == null ? null : value), z.coerce.date().nullable().optional()),
  gracePeriodDays: z.coerce.number().int().nonnegative().nullable().optional(),
  itemType: z.enum(["IMPORTED", "LOCAL", "MEDICINE", "DISPOSABLE"]).optional(),
  itemTypes: z.array(z.enum(["IMPORTED", "LOCAL", "MEDICINE", "DISPOSABLE"])).min(1).optional(),
  deliveryDays: z.coerce.number().int().nonnegative().nullable().optional(),
  ldCharges: z.coerce.number().nonnegative().optional(),
  shelfLifeDeduction: z.coerce.number().nonnegative().optional(),
  shelfLifeDeductionPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  chequeNo: z.string().trim().max(100).nullable().optional(),
  bankBranchId: z.coerce.number().int().positive().nullable().optional(),
  purpose: z.string().trim().max(1000).nullable().optional(),
  lineSerial: z.coerce.number().int().positive().optional(),
}).superRefine((item, ctx) => {
  if (item.incomeTax !== undefined && item.incomeTax > item.amount)
    ctx.addIssue({ code: "custom", path: ["incomeTax"], message: "Income Tax cannot exceed Amount" });
  if (item.salesTax !== undefined && item.salesTax > item.amount)
    ctx.addIssue({ code: "custom", path: ["salesTax"], message: "Sales Tax cannot exceed Amount" });
  if ((item.incomeTax ?? 0) + (item.salesTax ?? 0) + (item.ldCharges ?? 0) + (item.shelfLifeDeduction ?? 0) > item.amount)
    ctx.addIssue({ code: "custom", path: ["incomeTax"], message: "Total deductions cannot exceed Amount" });
  if (item.manufacturingDate && item.actualDeliveryDate && item.actualDeliveryDate < item.manufacturingDate)
    ctx.addIssue({ code: "custom", path: ["actualDeliveryDate"], message: "Actual Delivery Date cannot be before Manufacturing Date" });
});
const bodySchema = z
  .object({
    accountCodeId: z.coerce.number().int().positive(),
    date: z.coerce.date(),
    isContingent: z.boolean().optional().default(false),
    sourceInvoiceSerial: z.coerce.number().int().positive().nullable().optional(),
    items: z.array(itemSchema).min(1, "At least one payee line is required"),
  });
const idSchema = z.coerce.number().int().positive();
const issueChequeSchema = z.object({
  chequeNo: z.string().trim().min(1).max(100),
  bankBranchId: z.coerce.number().int().positive(),
  chequePaid: z.boolean(),
});
const listSchema = z.object({
  search: z.string().trim().optional().default(""),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
    accountCodeId: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
    payeeId: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  isContingent: z.preprocess((value) => value === "true" ? true : value === "false" ? false : undefined, z.boolean().optional()),
});
const include = {
  accountCode: { select: { id: true, code: true, name: true, incomeTaxPercentCompany: true, incomeTaxPercentIndividual: true, salesTaxPercentCompany: true, salesTaxPercentIndividual: true, printFundLabel: true, sanctionPurposeText: true } },
  items: {
    orderBy: { lineSerial: "asc" as const },
    include: { payee: { select: { id: true, code: true, name: true, itaxNo: true, vendorType: true } } },
  },
} as const;

async function nextSerial(db: Pick<typeof prisma, "invoice">, isContingent = false) {
  const result = await db.invoice.aggregate({ where: { isContingent }, _max: { serialNo: true } });
  return (result._max.serialNo ?? 0) + 1;
}
async function validateReferences(
  db: Pick<typeof prisma, "accountCode" | "payee">,
  accountCodeId: number,
  payeeIds: number[],
) {
  const [account, payees] = await Promise.all([
    db.accountCode.findUnique({
      where: { id: accountCodeId },
      select: {
        id: true,
        incomeTaxPercentCompany: true,
        incomeTaxPercentIndividual: true,
        incomeTaxPercentCompanyActive: true,
        incomeTaxPercentCompanyInactive: true,
        incomeTaxPercentIndividualActive: true,
        incomeTaxPercentIndividualInactive: true,
        salesTaxPercentCompany: true,
        salesTaxPercentIndividual: true,
      },
    }),
    db.payee.findMany({ where: { id: { in: [...new Set(payeeIds)] } }, select: { id: true, vendorType: true, taxStatusHistory: true } }),
  ]);
  if (!account)
    throw Object.assign(new Error("Account code not found"), { status: 400 });
  if (payees.length !== new Set(payeeIds).size)
    throw Object.assign(new Error("One or more payees were not found"), {
      status: 400,
    });
  return { account, payeesById: new Map(payees.map((payee) => [payee.id, payee])) };
}
async function ensureUniqueFinalSupplyInvoices(
  db: Pick<typeof prisma, "invoiceItem">,
  items: z.infer<typeof itemSchema>[],
  isContingent: boolean,
  invoiceId?: number,
) {
  if (isContingent) return;
  const poNumbers = [...new Set(items.map((item) => item.poNumber).filter((value): value is string => Boolean(value)))];
  if (!poNumbers.length) return;
  const existing = await db.invoiceItem.findMany({ where: { poNumber: { in: poNumbers }, invoice: { isContingent: false, ...(invoiceId && { id: { not: invoiceId } }) } }, select: { payeeId: true, poNumber: true, dcNumber: true } });
  const duplicate = items.find((item) => item.poNumber && existing.some((row) => row.poNumber === item.poNumber && row.payeeId === item.payeeId && row.dcNumber === (item.dcNumber || null)));
  if (duplicate) throw Object.assign(new Error(`PO No. ${duplicate.poNumber}, DC No. ${duplicate.dcNumber || "-"} already has a final Invoice. It cannot be invoiced again.`), { status: 409 });
}
async function ensureUniqueChequeNumbers(
  db: Pick<typeof prisma, "invoiceItem">,
  items: z.infer<typeof itemSchema>[],
  excludeInvoiceId?: number,
) {
  const seen = new Set<string>();
  for (const item of items) {
    const chequeNo = item.chequeNo?.trim();
    if (!chequeNo) continue;
    const key = chequeNo.toLocaleLowerCase();
    // The same cheque is valid for several selected supplies in one invoice.
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = await db.invoiceItem.findFirst({
      where: { chequeNo, ...(excludeInvoiceId && { invoiceId: { not: excludeInvoiceId } }) },
      select: { poNumber: true, invoice: { select: { serialNo: true } } },
    });
    if (existing) throw Object.assign(new Error(`Cheque No. ${chequeNo} already exists against PO No. ${existing.poNumber || "-"} (Invoice Serial ${existing.invoice.serialNo}).`), { status: 400 });
  }
}
const itemData = (
  items: z.infer<typeof itemSchema>[],
  account: Record<string, unknown>,
  payeesById: Map<number, { vendorType: "COMPANY" | "INDIVIDUAL"; taxStatusHistory: Array<{ status: "ACTIVE" | "INACTIVE"; effectiveFrom: Date; validUntil: Date | null }> }>,
  invoiceDate: Date,
  ldSettings: LdChargeSettings,
  shelfSlabs: Array<{ remainingPercentMin: unknown; remainingPercentMax: unknown | null; penaltyPercent: unknown; active: boolean }>,
  itemTypeTaxRules: ItemTypeTaxRuleLike[] = [],
  isContingent = false,
) =>
  items.map((item, index) => {
    const payee = payeesById.get(item.payeeId);
    const rates = selectTaxRates(account, payee?.vendorType ?? "INDIVIDUAL", matchItemTypeTaxRule(item.itemTypes ?? [item.itemType ?? "LOCAL"], itemTypeTaxRules), resolveTaxpayerStatus(payee?.taxStatusHistory ?? [], invoiceDate));
    const orderAndPoDate = item.poDate ?? item.orderDate;
    const calculatedDeliveryDueDate = calculateDueDate(item.poDate, item.deliveryDays);
    const effectiveSettings = { ...ldSettings, ldGracePeriodDays: item.gracePeriodDays ?? 5 };
    const calculations = calculateShelfLifeAndDeductions({ deliveryDueDate: calculatedDeliveryDueDate, actualDeliveryDate: item.actualDeliveryDate, manufacturingDate: item.manufacturingDate, expiryDate: item.expiryDate, orderValue: item.amount, settings: effectiveSettings, shelfLifeDeductionPercent: item.shelfLifeDeductionPercent ?? undefined, shelfLifeSlabs: shelfSlabs.filter((slab) => (slab as { itemCategory?: string }).itemCategory === (item.itemType ?? "LOCAL")) });
    return {
    payeeId: item.payeeId,
    amount: item.amount,
    incomeTax: item.incomeTax ?? roundMoney(item.amount * rates.incomeTaxPercent / 100),
    salesTax: item.salesTax ?? roundMoney(item.amount * rates.salesTaxPercent / 100),
    poNumber: item.poNumber || null,
    poDate: orderAndPoDate || null,
    dcNumber: item.dcNumber || null,
    procurementMode: item.procurementMode || null,
    deliveryDueDate: calculatedDeliveryDueDate || null,
    actualDeliveryDate: item.actualDeliveryDate || null,
    manufacturingDate: item.manufacturingDate || null,
    expiryDate: item.expiryDate || null,
    orderDate: orderAndPoDate || null,
    gracePeriodDays: item.gracePeriodDays ?? null,
    itemType: item.itemType ?? "LOCAL",
    itemTypes: item.itemTypes ?? [item.itemType ?? "LOCAL"],
    deliveryDays: item.deliveryDays ?? null,
    // LD and shelf-life deductions belong only to the Contingent Bill.
    // A final Invoice deducts Income Tax and Sales Tax only.
    ldCharges: isContingent ? (item.ldCharges ?? calculations.ldCharges) : 0,
    shelfLifeDeduction: isContingent ? (item.shelfLifeDeduction ?? calculations.shelfLifeDeductionAmount) : 0,
    shelfLifeDeductionPercent: isContingent ? calculations.shelfLifeDeductionPercent : null,
    chequeNo: item.chequeNo || null,
    bankBranchId: item.bankBranchId || null,
    purpose: item.purpose || null,
    lineSerial: item.lineSerial ?? index + 1,
  }; });
// Cheques are issued in whole rupees. Keep the net payable rounded here so a
// calculated tax/shelf-life fraction can never appear in the cheque form.
export const calculateNetAmount = (item: { amount: unknown; incomeTax: unknown; salesTax: unknown; ldCharges?: unknown; shelfLifeDeduction?: unknown }) => Math.round(Number(item.amount) - Number(item.incomeTax) - Number(item.salesTax) - Number(item.ldCharges ?? 0) - Number(item.shelfLifeDeduction ?? 0));
async function ldSettings(db: Pick<typeof prisma, "setting">): Promise<LdChargeSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: ["ldGracePeriodDays", "ldRatePercentPerDay", "ldMaxCapPercent"] } } });
  const values = { ...defaultLdChargeSettings };
  rows.forEach((row) => {
    if (row.value != null && Number.isFinite(Number(row.value))) (values as Record<string, number | null>)[row.key] = Number(row.value);
  });
  return values;
}
const withNetAmounts = <T extends { items: Array<{ amount: unknown; incomeTax: unknown; salesTax: unknown; ldCharges?: unknown; shelfLifeDeduction?: unknown }> }>(invoice: T) => ({
  ...invoice,
  items: invoice.items.map((item) => ({
    ...item,
    netAmount: calculateNetAmount(item),
  })),
});
function handle(error: unknown, res: Response) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({ error: "Invoice serial conflict; please retry" });
    return true;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    res.status(404).json({ error: "Invoice not found" });
    return true;
  }
  if (error instanceof Error && "status" in error) {
    res.status(Number(error.status)).json({ error: error.message });
    return true;
  }
  return false;
}

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);
invoiceRouter.get("/next-serial", async (_req, res) =>
  res.json({ serialNo: await nextSerial(prisma, z.enum(["true", "false"]).optional().parse(_req.query.isContingent) === "true") }),
);
invoiceRouter.get("/validate-cheque", async (req, res) => {
  const field = z.enum(["chequeNo", "chequeSerial"]).default("chequeNo").parse(req.query.field);
  const value = z.string().trim().min(1).max(100).parse(
    field === "chequeSerial" ? req.query.chequeSerial : req.query.chequeNo,
  );
  const invoiceId = z.coerce.number().int().positive().optional().parse(req.query.invoiceId);
  const chequeId = z.coerce.number().int().positive().optional().parse(req.query.chequeId);
  const bankBranchId = z.preprocess(
    (value) => value === "" || value === undefined || value === null ? null : value,
    z.coerce.number().int().positive().nullable(),
  ).parse(req.query.bankBranchId);
  const [existingCheque, existingLegacyItem] = await Promise.all([
    prisma.invoiceCheque.findFirst({
      where: {
        ...(field === "chequeSerial" ? { chequeSerial: value } : { chequeNo: value, bankBranchId }),
        ...(chequeId ? { id: { not: chequeId } } : invoiceId ? { invoiceId: { not: invoiceId } } : {}),
      },
      select: { type: true, invoice: { select: { serialNo: true } } },
    }),
    field === "chequeNo"
      ? prisma.invoiceItem.findFirst({
          where: { chequeNo: value, bankBranchId, ...(invoiceId && { invoiceId: { not: invoiceId } }) },
          select: { poNumber: true, invoice: { select: { serialNo: true } } },
        })
      : Promise.resolve(null),
  ]);
  const existing = existingCheque || existingLegacyItem;
  const message = existingCheque
    ? `${field === "chequeSerial" ? "Cheque serial" : "Cheque No."} ${value} already exists for ${existingCheque.type} (Invoice Serial ${existingCheque.invoice.serialNo}).`
    : existingLegacyItem
      ? `Cheque No. ${value} already exists against PO No. ${existingLegacyItem.poNumber || "-"} (Invoice Serial ${existingLegacyItem.invoice.serialNo}).`
      : undefined;
  res.json({ available: !existing, message });
});
invoiceRouter.get("/po-details", async (req, res) => {
  const search = z.string().trim().optional().default("").parse(req.query.search), payeeId = z.coerce.number().int().positive().optional().parse(req.query.payeeId);
  const items = await prisma.invoiceItem.findMany({
    where: { poNumber: { not: null, ...(search && { contains: search }) }, ...(payeeId ? { payeeId } : {}) },
    select: { id: true, lineSerial: true, poNumber: true, poDate: true, dcNumber: true, amount: true, incomeTax: true, salesTax: true, ldCharges: true, shelfLifeDeduction: true, chequeNo: true, chequePaid: true, incomeTaxPaid: true, salesTaxPaid: true, purpose: true, payee: { select: { code: true, name: true } }, invoice: { select: { id: true, serialNo: true, date: true, isContingent: true } } },
    orderBy: [{ poNumber: "asc" }, { invoice: { date: "desc" } }, { id: "desc" }],
  });
  const grouped = new Map<string, Array<(typeof items)[number]>>();
  for (const item of items) { const poNumber = item.poNumber!; grouped.set(poNumber, [...(grouped.get(poNumber) || []), item]); }
  res.json({ data: [...grouped.entries()].map(([poNumber, supplies]) => {
    const contingentSupplies = supplies.filter((item) => item.invoice.isContingent);
    const invoiceChequeRows = supplies.filter((item) => !item.invoice.isContingent);
    const visibleSupplies = contingentSupplies.map((supply) => {
      const cheque = invoiceChequeRows.find((invoiceItem) => invoiceItem.payee.code === supply.payee.code && (!supply.dcNumber || !invoiceItem.dcNumber || invoiceItem.dcNumber === supply.dcNumber));
      return { ...supply, chequeNo: cheque?.chequeNo || null, chequeSerial: cheque?.lineSerial || null, invoiceSerial: cheque?.invoice.serialNo || null, invoiceItemId: cheque?.id || null, chequePaid: cheque?.chequePaid || false };
    });
    // Creating a cheque does not mean it has been paid. Count it only after
    // the user explicitly marks its cheque status as Paid.
    const paidAmount = roundMoney(visibleSupplies.reduce((sum, supply) => sum + (supply.invoiceItemId && supply.chequePaid ? calculateNetAmount(supply) : 0), 0));
    const netTotal = roundMoney(contingentSupplies.reduce((sum, item) => sum + Number(item.amount) - Number(item.incomeTax) - Number(item.salesTax) - Number(item.ldCharges) - Number(item.shelfLifeDeduction), 0));
    return { poNumber, supplyCount: contingentSupplies.length, grossTotal: roundMoney(contingentSupplies.reduce((sum, item) => sum + Number(item.amount), 0)), netTotal, chequeCreatedCount: visibleSupplies.filter((supply) => supply.invoiceItemId).length, paidAmount, pendingAmount: Math.max(0, roundMoney(netTotal - paidAmount)), supplies: visibleSupplies };
  }) });
});
invoiceRouter.get("/load-by-po", async (req, res) => {
  const poNumber = z.string().trim().min(1).max(100).parse(req.query.poNumber);
  const itemIds = z.string().trim().optional().parse(req.query.itemIds)?.split(",").filter(Boolean).map((value) => idSchema.parse(value));
  const invoices = await prisma.invoice.findMany({ where: { isContingent: true, items: { some: { poNumber } } }, include, orderBy: [{ date: "asc" }, { serialNo: "asc" }] });
  const matchedItems = invoices.flatMap((invoice) => invoice.items.filter((item) => item.poNumber === poNumber && (!itemIds?.length || itemIds.includes(item.id))));
  if (!matchedItems.length) { res.status(404).json({ error: `No contingent supplies found against PO No. ${poNumber}.` }); return; }
  const finalItems = await prisma.invoiceItem.findMany({ where: { poNumber, invoice: { isContingent: false } }, select: { payeeId: true, dcNumber: true } });
  const alreadyInvoiced = matchedItems.filter((item) => finalItems.some((finalItem) => finalItem.payeeId === item.payeeId && finalItem.dcNumber === item.dcNumber));
  if (alreadyInvoiced.length) {
    res.status(409).json({ error: `${alreadyInvoiced.length} selected supply order(s) already have a final Invoice/cheque and cannot be invoiced again.` });
    return;
  }
  const accountIds = new Set(invoices.filter((invoice) => invoice.items.some((item) => item.poNumber === poNumber)).map((invoice) => invoice.accountCodeId));
  if (accountIds.size !== 1) { res.status(400).json({ error: `PO No. ${poNumber} has supplies under multiple account codes and cannot be loaded into one invoice.` }); return; }
  const source = invoices.find((invoice) => invoice.accountCodeId === [...accountIds][0])!;
  res.json({ accountCodeId: source.accountCodeId, accountCode: source.accountCode, date: source.date, items: matchedItems });
});
invoiceRouter.get("/contingent-final-status", async (req, res) => {
  const itemIds = z.string().trim().min(1).parse(req.query.itemIds).split(",").map((value) => idSchema.parse(value));
  const supplies = await prisma.invoiceItem.findMany({ where: { id: { in: [...new Set(itemIds)] }, invoice: { isContingent: true } }, select: { id: true, payeeId: true, poNumber: true, dcNumber: true } });
  const poNumbers = [...new Set(supplies.map((item) => item.poNumber).filter((value): value is string => Boolean(value)))];
  const finalItems = await prisma.invoiceItem.findMany({ where: { poNumber: { in: poNumbers }, invoice: { isContingent: false } }, select: { id: true, payeeId: true, poNumber: true, dcNumber: true, chequeNo: true, chequePaid: true, invoice: { select: { id: true, serialNo: true } } } });
  res.json({ data: supplies.map((supply) => {
    const finalItem = finalItems.find((item) => item.poNumber === supply.poNumber && item.payeeId === supply.payeeId && item.dcNumber === supply.dcNumber);
    return { contingentItemId: supply.id, finalInvoiceId: finalItem?.invoice.id ?? null, finalInvoiceSerial: finalItem?.invoice.serialNo ?? null, chequeNo: finalItem?.chequeNo ?? null, chequePaid: finalItem?.chequePaid ?? false };
  }) });
});
invoiceRouter.post("/create-contingent-from-supplies", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const supplyIds = z.object({ supplyIds: z.array(z.coerce.number().int().positive()).min(1) }).parse(req.body).supplyIds;
  if (new Set(supplyIds).size !== supplyIds.length) { res.status(400).json({ error: "A supply can only be selected once." }); return; }
  try {
    const row = await prisma.$transaction(async (tx) => {
      const supplies = await tx.poSupply.findMany({ where: { id: { in: supplyIds }, contingentInvoiceId: null }, orderBy: { id: "asc" } });
      if (supplies.length !== supplyIds.length) throw Object.assign(new Error("One or more selected supplies have already been used in a Contingent Bill."), { status: 409 });
      const poNumbers = new Set(supplies.map((supply) => supply.poNumber));
      const accountIds = new Set(supplies.map((supply) => supply.accountCodeId));
      if (poNumbers.size !== 1 || accountIds.size !== 1) throw Object.assign(new Error("Select supplies from one PO and one account code only."), { status: 400 });
      const inputItems = supplies.map((supply, index) => itemSchema.parse({
        payeeId: supply.payeeId, amount: Number(supply.amount), poNumber: supply.poNumber, poDate: supply.poDate,
        orderDate: supply.poDate, dcNumber: supply.dcNumber, procurementMode: supply.procurementMode,
        deliveryDays: supply.deliveryDays, gracePeriodDays: supply.gracePeriodDays,
        actualDeliveryDate: supply.actualDeliveryDate, manufacturingDate: supply.manufacturingDate,
        expiryDate: supply.expiryDate, itemType: supply.itemType, itemTypes: (supply.itemTypes as string[] | null) ?? [supply.itemType], lineSerial: index + 1,
        ldCharges: Number(supply.manualLdAmount),
        // When a user deliberately selects manual percentage mode, use that
        // percentage. Otherwise shelf-life remains fully policy calculated.
        shelfLifeDeduction: supply.manualShelfLifePercent == null ? undefined : Number(supply.amount) * Number(supply.manualShelfLifePercent) / 100,
        shelfLifeDeductionPercent: supply.manualShelfLifePercent == null ? undefined : Number(supply.manualShelfLifePercent),
      }));
      const { account, payeesById } = await validateReferences(tx as typeof prisma, supplies[0].accountCodeId, inputItems.map((item) => item.payeeId));
      const [configuredLdSettings, shelfSlabs, itemTypeTaxRules] = await Promise.all([
        ldSettings(tx as typeof prisma),
        tx.shelfLifePenaltySlab.findMany({ where: { active: true }, orderBy: { remainingPercentMin: "asc" } }),
        tx.itemTypeTaxRule.findMany({ where: { active: true } }),
      ]);
      const invoice = await tx.invoice.create({
        data: { serialNo: await nextSerial(tx as typeof prisma, true), date: new Date(), isContingent: true, accountCodeId: supplies[0].accountCodeId, createdById: req.user!.id, items: { create: itemData(inputItems, account, payeesById, new Date(), configuredLdSettings, shelfSlabs, itemTypeTaxRules, true) } },
        include,
      });
      const linked = await tx.poSupply.updateMany({ where: { id: { in: supplyIds }, contingentInvoiceId: null }, data: { contingentInvoiceId: invoice.id } });
      if (linked.count !== supplyIds.length) throw Object.assign(new Error("Selected supplies changed while creating the bill. Please retry."), { status: 409 });
      return invoice;
    });
    res.status(201).json(withNetAmounts(row));
  } catch (error) { if (!handle(error, res)) throw error; }
});
invoiceRouter.patch("/items/:itemId/cheque-status", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const itemId = idSchema.parse(req.params.itemId);
  const chequePaid = z.boolean().parse(req.body.chequePaid);
  const item = await prisma.invoiceItem.findUnique({ where: { id: itemId }, select: { id: true, invoiceId: true, payeeId: true, poNumber: true, dcNumber: true, chequeNo: true, invoice: { select: { isContingent: true } } } });
  if (!item) { res.status(404).json({ error: "Invoice item not found." }); return; }
  const chequeItem = item.invoice.isContingent
    ? await prisma.invoiceItem.findFirst({ where: { payeeId: item.payeeId, poNumber: item.poNumber, dcNumber: item.dcNumber, chequeNo: { not: null }, invoice: { isContingent: false } }, orderBy: { id: "desc" } })
    : item;
  if (!chequeItem?.chequeNo) { res.status(400).json({ error: "A cheque must be created before its paid status can be changed." }); return; }
  const updated = await prisma.invoiceItem.updateMany({ where: { invoiceId: chequeItem.invoiceId, chequeNo: chequeItem.chequeNo }, data: { chequePaid } });
  res.json({ chequeNo: chequeItem.chequeNo, chequePaid, updated: updated.count });
});
const chequeTypeSchema = z.enum(["VENDOR", "SHELF_LIFE", "INCOME_TAX", "SALES_TAX", "OTHER"]);
const standardChequeLabels = { VENDOR: "Vendor Payment", SHELF_LIFE: "Shelf Life", INCOME_TAX: "Income Tax", SALES_TAX: "Sales Tax (GST)" } as const;
const chequeSchema = z.object({ type: chequeTypeSchema, label: z.string().trim().max(150).nullable().optional(), chequeNo: z.string().trim().min(1).max(50), chequeSerial: z.string().trim().max(50).nullable().optional(), chequeDate: z.coerce.date().nullable().optional(), amount: z.coerce.number().nonnegative(), bankBranchId: z.coerce.number().int().positive().nullable().optional(), paid: z.boolean(), recipientName: z.string().trim().max(150).nullable().optional(), notes: z.string().trim().max(300).nullable().optional() }).superRefine((input, ctx) => { if (input.type === "OTHER" && !input.label) ctx.addIssue({ code: "custom", path: ["label"], message: "A label is required for an Other cheque." }); });
async function contingentChequeInvoice(invoiceId: number) { return prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: { include: { payee: { select: { name: true } } } }, cheques: { include: { bankBranch: { include: { bank: true } } } } } }); }
invoiceRouter.get("/:id/cheques", async (req, res) => {
  const invoice = await contingentChequeInvoice(idSchema.parse(req.params.id));
  if (!invoice || !invoice.isContingent) { res.status(404).json({ error: "Contingent Bill not found." }); return; }
  // Cheque issue is based strictly on Gross Amount, Income Tax and Sales Tax.
  // Shelf-life and LD remain Contingent Bill deductions; they do not create a
  // separate cheque or reduce the vendor cheque at this stage.
  const amounts = { VENDOR: invoice.items.reduce((sum, item) => sum + Number(item.amount) - Number(item.incomeTax) - Number(item.salesTax), 0), INCOME_TAX: invoice.items.reduce((sum, item) => sum + Number(item.incomeTax), 0), SALES_TAX: invoice.items.reduce((sum, item) => sum + Number(item.salesTax), 0) };
  res.json({ suggested: (["VENDOR", "SALES_TAX", "INCOME_TAX"] as const).map((type) => ({ type, label: standardChequeLabels[type], suggestedAmount: Math.round(amounts[type]) })), saved: invoice.cheques.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) });
});
function chequeInput(input: z.infer<typeof chequeSchema>, vendorName: string | undefined) {
  const label = input.type === "OTHER" ? input.label! : standardChequeLabels[input.type];
  return { ...input, amount: Math.round(input.amount), chequeSerial: input.chequeSerial?.trim() || null, label, recipientName: input.recipientName || (input.type === "VENDOR" ? vendorName || null : null) };
}
function chequeAmountIsWithinBill(invoice: { items: Array<{ amount: unknown }>; cheques: Array<{ id: number; amount: unknown }> }, amount: number, excludeChequeId?: number) {
  const grossAmount = invoice.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const otherChequeAmount = invoice.cheques.filter((cheque) => cheque.id !== excludeChequeId).reduce((sum, cheque) => sum + Number(cheque.amount), 0);
  return { grossAmount: Math.round(grossAmount), chequeTotal: Math.round(otherChequeAmount + amount), valid: Math.round(otherChequeAmount + amount) <= Math.round(grossAmount) };
}

async function hasAllocatedBudget(accountCodeId: number, invoiceDate: Date) {
  const year = invoiceDate.getUTCMonth() >= 6 ? invoiceDate.getUTCFullYear() : invoiceDate.getUTCFullYear() - 1;
  const budget = await prisma.budgetDocumentItem.aggregate({
    _sum: { amount: true },
    where: {
      accountCodeId,
      budgetDocument: {
        date: {
          gte: new Date(`${year}-07-01T00:00:00Z`),
          lte: new Date(`${year + 1}-06-30T23:59:59Z`),
        },
      },
    },
  });
  return Number(budget._sum.amount ?? 0) > 0;
}
invoiceRouter.post("/:id/cheques", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const invoiceId = idSchema.parse(req.params.id), input = chequeSchema.parse(req.body);
  const invoice = await contingentChequeInvoice(invoiceId);
  if (!invoice || !invoice.isContingent) { res.status(404).json({ error: "Contingent Bill not found." }); return; }
  // A cheque can only be issued against an account head that has an allocated
  // budget in the contingent bill's fiscal year.
  if (!await hasAllocatedBudget(invoice.accountCodeId, invoice.date)) {
    res.status(400).json({ error: "No budget has been added for this account code. Add the account budget before creating a cheque." });
    return;
  }
  const amountCheck = chequeAmountIsWithinBill(invoice, input.amount);
  if (!amountCheck.valid) { res.status(400).json({ error: `Invalid amount: total cheques (${amountCheck.chequeTotal.toLocaleString()}) cannot exceed this bill's payable amount (${amountCheck.grossAmount.toLocaleString()}).` }); return; }
  const [duplicateNo, duplicateSerial] = await Promise.all([
    prisma.invoiceCheque.findFirst({ where: { chequeNo: input.chequeNo, bankBranchId: input.bankBranchId } }),
    input.chequeSerial?.trim() ? prisma.invoiceCheque.findFirst({ where: { chequeSerial: input.chequeSerial.trim() } }) : Promise.resolve(null),
  ]);
  if (duplicateNo) { res.status(400).json({ error: "This cheque number is already used for this bank branch." }); return; }
  if (duplicateSerial) { res.status(400).json({ error: "This cheque/schedule serial number is already used." }); return; }
  res.status(201).json(await prisma.invoiceCheque.create({ data: { invoiceId, ...chequeInput(input, invoice.items[0]?.payee.name) } }));
});
invoiceRouter.put("/:id/cheques/:chequeId", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const invoiceId = idSchema.parse(req.params.id), chequeId = idSchema.parse(req.params.chequeId), input = chequeSchema.parse(req.body);
  const invoice = await contingentChequeInvoice(invoiceId);
  if (!invoice || !invoice.isContingent) { res.status(404).json({ error: "Contingent Bill not found." }); return; }
  const cheque = await prisma.invoiceCheque.findFirst({ where: { id: chequeId, invoiceId } });
  if (!cheque) { res.status(404).json({ error: "Cheque not found." }); return; }
  const amountCheck = chequeAmountIsWithinBill(invoice, input.amount, chequeId);
  if (!amountCheck.valid) { res.status(400).json({ error: `Invalid amount: total cheques (${amountCheck.chequeTotal.toLocaleString()}) cannot exceed this bill's payable amount (${amountCheck.grossAmount.toLocaleString()}).` }); return; }
  const [duplicateNo, duplicateSerial] = await Promise.all([
    prisma.invoiceCheque.findFirst({ where: { chequeNo: input.chequeNo, bankBranchId: input.bankBranchId, id: { not: chequeId } } }),
    input.chequeSerial?.trim() ? prisma.invoiceCheque.findFirst({ where: { chequeSerial: input.chequeSerial.trim(), id: { not: chequeId } } }) : Promise.resolve(null),
  ]);
  if (duplicateNo) { res.status(400).json({ error: "This cheque number is already used for this bank branch." }); return; }
  if (duplicateSerial) { res.status(400).json({ error: "This cheque/schedule serial number is already used." }); return; }
  res.json(await prisma.invoiceCheque.update({ where: { id: chequeId }, data: chequeInput(input, invoice.items[0]?.payee.name) }));
});
invoiceRouter.delete("/:id/cheques/:chequeId", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => { const invoiceId = idSchema.parse(req.params.id), chequeId = idSchema.parse(req.params.chequeId); const deleted = await prisma.invoiceCheque.deleteMany({ where: { id: chequeId, invoiceId } }); if (!deleted.count) { res.status(404).json({ error: "Cheque not found." }); return; } res.status(204).send(); });
invoiceRouter.post("/:id/mark-done", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const contingentInvoiceId = idSchema.parse(req.params.id);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const contingent = await tx.invoice.findUnique({
        where: { id: contingentInvoiceId },
        include: { items: true, cheques: true },
      });
      if (!contingent || !contingent.isContingent) {
        throw Object.assign(new Error("Contingent Bill not found."), { status: 404 });
      }
      if (!contingent.cheques.length) {
        throw Object.assign(new Error("Create at least one cheque before marking this bill as done."), { status: 400 });
      }
      await tx.invoiceCheque.updateMany({ where: { invoiceId: contingent.id }, data: { paid: true } });
      let finalInvoice = await tx.invoice.findFirst({
        where: { isContingent: false, sourceInvoiceSerial: contingent.serialNo },
      });
      if (!finalInvoice) {
        finalInvoice = await tx.invoice.create({
          data: {
            serialNo: await nextSerial(tx as typeof prisma, false),
            date: new Date(),
            isContingent: false,
            sourceInvoiceSerial: contingent.serialNo,
            accountCodeId: contingent.accountCodeId,
            createdById: req.user!.id,
            items: {
              create: contingent.items.map((item) => ({
                payeeId: item.payeeId,
                amount: item.amount,
                incomeTax: item.incomeTax,
                salesTax: item.salesTax,
                appliedIncomeTaxRate: item.appliedIncomeTaxRate,
                taxCertificateId: item.taxCertificateId,
                poNumber: item.poNumber,
                poDate: item.poDate,
                dcNumber: item.dcNumber,
                procurementMode: item.procurementMode,
                deliveryDueDate: item.deliveryDueDate,
                actualDeliveryDate: item.actualDeliveryDate,
                manufacturingDate: item.manufacturingDate,
                expiryDate: item.expiryDate,
                orderDate: item.orderDate,
                grossPeriodDays: item.grossPeriodDays,
                gracePeriodDays: item.gracePeriodDays,
                itemType: item.itemType,
                itemTypes: item.itemTypes ?? undefined,
                deliveryDays: item.deliveryDays,
                ldCharges: 0,
                shelfLifeDeduction: 0,
                chequePaid: true,
                incomeTaxPaid: true,
                salesTaxPaid: true,
                purpose: item.purpose,
                lineSerial: item.lineSerial,
              })),
            },
          },
        });
      }
      return finalInvoice;
    });
    res.json({ message: "Payment marked as done and budget expense posted.", finalInvoiceId: result.id, finalInvoiceSerial: result.serialNo });
  } catch (error) {
    if (!handle(error, res)) throw error;
  }
});
invoiceRouter.post("/:id/mark-unpaid", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const contingentInvoiceId = idSchema.parse(req.params.id);
  try {
    await prisma.$transaction(async (tx) => {
      const contingent = await tx.invoice.findUnique({
        where: { id: contingentInvoiceId },
        select: { id: true, serialNo: true, isContingent: true },
      });
      if (!contingent || !contingent.isContingent) {
        throw Object.assign(new Error("Contingent Bill not found."), { status: 404 });
      }
      await tx.invoiceCheque.updateMany({ where: { invoiceId: contingent.id }, data: { paid: false } });
      // The final invoice created by Mark as Done is the budget posting. Remove
      // that linked posting so changing a mistaken payment back to unpaid also
      // restores the available budget.
      await tx.invoice.deleteMany({
        where: { isContingent: false, sourceInvoiceSerial: contingent.serialNo },
      });
    });
    res.json({ message: "Payment marked as unpaid and its budget posting was reversed." });
  } catch (error) {
    if (!handle(error, res)) throw error;
  }
});
invoiceRouter.patch("/items/:itemId/tax-status", requireAnyRole("ADMIN", "ACCOUNTANT"), async (req, res) => {
  const itemId = idSchema.parse(req.params.itemId);
  const { tax, paid } = z.object({ tax: z.enum(["income", "sales"]), paid: z.boolean() }).parse(req.body);
  const item = await prisma.invoiceItem.findUnique({ where: { id: itemId }, select: { incomeTax: true, salesTax: true, invoice: { select: { isContingent: true } } } });
  if (!item || item.invoice.isContingent) { res.status(404).json({ error: "Final invoice item not found." }); return; }
  if (Number(tax === "income" ? item.incomeTax : item.salesTax) <= 0) { res.status(400).json({ error: `This item has no ${tax === "income" ? "Income Tax" : "Sales Tax"} deduction.` }); return; }
  const field = tax === "income" ? "incomeTaxPaid" : "salesTaxPaid";
  res.json(await prisma.invoiceItem.update({ where: { id: itemId }, data: { [field]: paid } }));
});
invoiceRouter.get("/", async (req, res) => {
  const q = listSchema.parse(req.query),
    where: Prisma.InvoiceWhereInput = {};
  if (q.isContingent !== undefined) where.isContingent = q.isContingent;
  const itemFilters: Prisma.InvoiceItemWhereInput[] = [];
  if (q.search) {
    if (q.isContingent) itemFilters.push({ poNumber: { contains: q.search } });
    else {
      const serial = Number(q.search);
      if (Number.isInteger(serial)) where.serialNo = serial;
    }
  }
  if (q.accountCodeId) where.accountCodeId = q.accountCodeId;
  if (q.payeeId) itemFilters.push({ payeeId: q.payeeId });
  if (itemFilters.length) where.items = { some: { AND: itemFilters } };
  if (q.dateFrom || q.dateTo)
    where.date = {
      ...(q.dateFrom && { gte: new Date(`${q.dateFrom}T00:00:00Z`) }),
      ...(q.dateTo && { lte: new Date(`${q.dateTo}T23:59:59Z`) }),
    };
  const [data, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include,
      orderBy: [{ date: "desc" }, { serialNo: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.invoice.count({ where }),
  ]);
  res.json({
    data: data.map(withNetAmounts),
    pagination: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      pages: Math.ceil(total / q.pageSize),
    },
  });
});
invoiceRouter.get("/:id/items/:itemId/contingent-bill.pdf", async (req, res) => {
  const selectedItemIds = typeof req.query.itemIds === "string"
    ? req.query.itemIds.split(",").filter(Boolean).map((value) => idSchema.parse(value))
    : undefined;
  const { buffer, filename } = await createContingentBillPdf(
    idSchema.parse(req.params.id),
    idSchema.parse(req.params.itemId),
    selectedItemIds,
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(buffer);
});
// Print the whole Contingent Bill: every DC/item under this bill is included
// in one combined calculation and PDF, rather than printing its first DC.
invoiceRouter.get("/:id/contingent-bill.pdf", async (req, res) => {
  const { buffer, filename } = await createContingentBillPdf(idSchema.parse(req.params.id));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.send(buffer);
});
// A contingent bill remains its own document.  The final invoice is created
// when payment is marked done; expose its serial so callers can print the
// separate Asaan Assignment Account invoice schedule.
invoiceRouter.get("/:id/final-invoice", async (req, res) => {
  const contingent = await prisma.invoice.findUnique({
    where: { id: idSchema.parse(req.params.id) },
    select: { serialNo: true, isContingent: true },
  });
  if (!contingent || !contingent.isContingent) {
    res.status(404).json({ error: "Contingent Bill not found." });
    return;
  }
  const finalInvoice = await prisma.invoice.findFirst({
    where: { isContingent: false, sourceInvoiceSerial: contingent.serialNo },
    select: { id: true, serialNo: true },
  });
  if (!finalInvoice) {
    res.status(409).json({ error: "Mark this payment as done before printing its final invoice." });
    return;
  }
  res.json(finalInvoice);
});
invoiceRouter.get("/:id/printable-invoice", async (req, res) => {
  const contingent = await prisma.invoice.findUnique({
    where: { id: idSchema.parse(req.params.id) },
    select: { serialNo: true, isContingent: true },
  });
  if (!contingent || !contingent.isContingent) {
    res.status(404).json({ error: "Contingent Bill not found." });
    return;
  }
  const finalInvoice = await prisma.invoice.findFirst({
    where: { isContingent: false, sourceInvoiceSerial: contingent.serialNo },
    select: { serialNo: true },
  });
  res.json({ finalInvoiceSerial: finalInvoice?.serialNo ?? null });
});
invoiceRouter.get("/:id", async (req, res) => {
  const row = await prisma.invoice.findUnique({
    where: { id: idSchema.parse(req.params.id) },
    include,
  });
  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(withNetAmounts(row));
});
invoiceRouter.post("/", async (req, res) => {
  const input = bodySchema.parse(req.body);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const { account, payeesById } = await validateReferences(
        tx as typeof prisma,
        input.accountCodeId,
        input.items.map((x) => x.payeeId),
      );
      await ensureUniqueChequeNumbers(tx as typeof prisma, input.items);
      await ensureUniqueFinalSupplyInvoices(tx as typeof prisma, input.items, input.isContingent);
      const [configuredLdSettings, shelfSlabs, itemTypeTaxRules] = await Promise.all([
        ldSettings(tx as typeof prisma),
        tx.shelfLifePenaltySlab.findMany({ where: { active: true }, orderBy: { remainingPercentMin: "asc" } }),
        tx.itemTypeTaxRule.findMany({ where: { active: true } }),
      ]);
      if (input.sourceInvoiceSerial) {
        const source = await tx.invoice.findFirst({ where: { serialNo: input.sourceInvoiceSerial, isContingent: true }, select: { isContingent: true } });
        if (!source || !source.isContingent) throw Object.assign(new Error("Source Contingent Bill serial was not found."), { status: 400 });
      }
      const serialNo = await nextSerial(tx as typeof prisma, input.isContingent);
      return tx.invoice.create({
        data: {
          serialNo,
          date: input.date,
          isContingent: input.isContingent,
          sourceInvoiceSerial: input.sourceInvoiceSerial || null,
          accountCodeId: input.accountCodeId,
          createdById: req.user!.id,
          items: { create: itemData(input.items, account, payeesById, input.date, configuredLdSettings, shelfSlabs, itemTypeTaxRules, input.isContingent) },
        },
        include,
      });
    });
    res.status(201).json(withNetAmounts(row));
  } catch (error) {
    if (!handle(error, res)) throw error;
  }
});
invoiceRouter.put("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id),
    input = bodySchema.parse(req.body);
  try {
    const row = await prisma.$transaction(async (tx) => {
      const { account, payeesById } = await validateReferences(
        tx as typeof prisma,
        input.accountCodeId,
        input.items.map((x) => x.payeeId),
      );
      await ensureUniqueChequeNumbers(tx as typeof prisma, input.items, id);
      await ensureUniqueFinalSupplyInvoices(tx as typeof prisma, input.items, input.isContingent, id);
      const [configuredLdSettings, shelfSlabs, itemTypeTaxRules] = await Promise.all([
        ldSettings(tx as typeof prisma),
        tx.shelfLifePenaltySlab.findMany({ where: { active: true }, orderBy: { remainingPercentMin: "asc" } }),
        tx.itemTypeTaxRule.findMany({ where: { active: true } }),
      ]);
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          date: input.date,
          accountCodeId: input.accountCodeId,
          updatedById: req.user!.id,
          items: { create: itemData(input.items, account, payeesById, input.date, configuredLdSettings, shelfSlabs, itemTypeTaxRules, input.isContingent) },
        },
        include,
      });
    });
    res.json(withNetAmounts(row));
  } catch (error) {
    if (!handle(error, res)) throw error;
  }
});
invoiceRouter.delete(
  "/:id",
  requireAnyRole("ADMIN", "ACCOUNTANT"),
  async (req, res) => {
    try {
      const id = idSchema.parse(req.params.id);
      await prisma.$transaction(async (tx) => {
        const snapshot = await tx.invoice.findUnique({ where: { id }, include });
        if (!snapshot) throw Object.assign(new Error("Invoice not found"), { status: 404 });
        // A PO Supply is the source record for a generated Contingent Bill.
        // Deleting that bill must preserve its DCs and make them pending again,
        // so the user can select them into a new Contingent Bill.
        if (snapshot.isContingent) {
          await tx.poSupply.updateMany({
            where: { contingentInvoiceId: id },
            data: { contingentInvoiceId: null },
          });
        }
        await tx.invoice.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "delete",
            entityType: "invoice",
            entityId: String(id),
            details: {
              deletedBy: req.user!.username,
              deletedAt: new Date().toISOString(),
              snapshot: JSON.parse(JSON.stringify(snapshot)),
            },
          },
        });
      });
      res.status(204).send();
    } catch (error) {
      if (!handle(error, res)) throw error;
    }
  },
);
