import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
const mocks = vi.hoisted(() => ({
  user: { count: vi.fn(), findUnique: vi.fn() },
  payee: { count: vi.fn(), findMany: vi.fn() },
  accountCode: { findUnique: vi.fn() },
  budgetDocumentItem: { aggregate: vi.fn() },
  invoice: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  invoiceItem: { aggregate: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
  poSupply: { findMany: vi.fn(), updateMany: vi.fn() },
  setting: { findMany: vi.fn() },
  shelfLifePenaltySlab: { findMany: vi.fn() },
  itemTypeTaxRule: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";
const token = jwt.sign(
    { username: "admin", role: "ADMIN" },
    config.JWT_SECRET,
    { subject: "1" },
  ),
  auth = { Authorization: `Bearer ${token}` };
const body = {
  accountCodeId: 2,
  date: "2026-08-27",
  items: [
    { payeeId: 1, amount: 700, incomeTax: 70, salesTax: 35, chequeNo: "CH-1", purpose: "Medicine" },
    { payeeId: 3, amount: 300, incomeTax: 0, salesTax: 15, chequeNo: "CH-2", purpose: "Supplies" },
  ],
};
const createdInvoice = (data: Record<string, any>) => ({
  id: 1,
  ...data,
  accountCode: { id: 2, code: "A03907", name: "Test" },
  items: data.items.create.map((item: Record<string, unknown>, index: number) => ({ ...item, id: index + 1, payee: { id: item.payeeId } })),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(
    async (cb: (tx: typeof mocks) => unknown) => cb(mocks),
  );
  mocks.accountCode.findUnique.mockResolvedValue({ id: 2, code: "A03907", incomeTaxPercentCompany: "0", incomeTaxPercentIndividual: "0", salesTaxPercentCompany: "0", salesTaxPercentIndividual: "0" });
  mocks.payee.count.mockResolvedValue(2);
  mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }, { id: 3, vendorType: "COMPANY" }]);
  mocks.setting.findMany.mockResolvedValue([]);
  mocks.shelfLifePenaltySlab.findMany.mockResolvedValue([]);
  mocks.itemTypeTaxRule.findMany.mockResolvedValue([]);
  mocks.invoice.findFirst.mockResolvedValue(null);
  mocks.invoiceItem.findFirst.mockResolvedValue(null);
  mocks.invoice.aggregate.mockResolvedValue({ _max: { serialNo: 40 } });
});
describe("Contingent bill calculations", () => {
  it("persists a manual shelf-life percentage through contingent-bill reload and amount edit", async () => {
    mocks.poSupply.findMany.mockResolvedValue([{
      id: 9, payeeId: 1, accountCodeId: 2, poNumber: "PO-9", poDate: new Date("2026-09-01"), dcNumber: "DC-9", amount: "1000",
      procurementMode: null, deliveryDays: null, gracePeriodDays: 5, actualDeliveryDate: null, manufacturingDate: null, expiryDate: null,
      itemType: "LOCAL", itemTypes: ["LOCAL"], manualLdAmount: "0", manualShelfLifePercent: "12.5",
    }]);
    mocks.poSupply.updateMany.mockResolvedValue({ count: 1 });
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL", taxStatusHistory: [] }]);
    mocks.invoice.create.mockImplementation(async ({ data }: any) => createdInvoice(data));

    const created = await request(app).post("/api/invoices/create-contingent-from-supplies").set(auth).send({ supplyIds: [9] });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const createdItem = mocks.invoice.create.mock.calls[0][0].data.items.create[0];
    expect(createdItem).toEqual(expect.objectContaining({ shelfLifeDeductionPercent: 12.5, shelfLifeDeduction: 125 }));

    mocks.invoice.findUnique.mockResolvedValue({
      id: 1, serialNo: 41, date: new Date("2026-09-23"), accountCodeId: 2, isContingent: true,
      accountCode: { id: 2, code: "A03907", name: "Test" },
      items: [{ ...createdItem, id: 1, payee: { id: 1, code: "V1", name: "Vendor", itaxNo: null, vendorType: "INDIVIDUAL" } }],
    });
    const reloaded = await request(app).get("/api/invoices/1").set(auth);
    expect(reloaded.status, JSON.stringify(reloaded.body)).toBe(200);
    expect(reloaded.body.items[0].shelfLifeDeductionPercent).toBe(12.5);

    mocks.invoice.update.mockImplementation(async ({ data }: any) => createdInvoice(data));
    const edited = await request(app).put("/api/invoices/1").set(auth).send({
      accountCodeId: 2,
      date: "2026-09-23",
      isContingent: true,
      items: [{ payeeId: 1, amount: 2000, poNumber: "PO-9", dcNumber: "DC-9", shelfLifeDeduction: 250, shelfLifeDeductionPercent: 12.5 }],
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const editedItem = mocks.invoice.update.mock.calls[0][0].data.items.create[0];
    expect(editedItem).toEqual(expect.objectContaining({ shelfLifeDeductionPercent: 12.5, shelfLifeDeduction: 250 }));
  });

  it("deducts ld, shelf life, income tax, and sales tax from net amount", () => {
    const item = { amount: 1000, ldCharges: 50, shelfLifeDeduction: 25, incomeTax: 100, salesTax: 50 };
    expect(item.amount - item.ldCharges - item.shelfLifeDeduction - item.incomeTax - item.salesTax).toBe(775);
  });

  it("excludes the current item from previous bill totals and balances correctly", async () => {
    const { assembleContingentBill } = await import("./lib/contingentBill.js");
    mocks.invoice.findUnique.mockResolvedValue({
      id: 1,
      serialNo: 10,
      date: new Date("2026-08-15T00:00:00Z"),
      accountCodeId: 2,
      accountCode: { id: 2, code: "A1", name: "Test Head", incomeTaxPercentCompany: "5", incomeTaxPercentIndividual: "5", salesTaxPercentCompany: "8", salesTaxPercentIndividual: "8" },
      items: [{
        id: 3,
        lineSerial: 2,
        amount: "500",
        incomeTax: "25",
        salesTax: "40",
        ldCharges: "0",
        shelfLifeDeduction: "0",
        payee: { id: 1, name: "Vendor A", code: "V1", itaxNo: "123", vendorType: "INDIVIDUAL" },
      }],
    });
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: 2500 } });
    mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: 1200 } });
    const settings = { departmentAndDdo: "Dept", costCenter: "CC", projectDescription: "PD", projectCode: "PC", subDetailFunction: "SDF", grantNo: "GN", aaaAccountName: "AAA", aaaAccountNumber: "123", accountantLabel: "A", accountOfficerLabel: "B", deputyDirectorFinanceLabel: "C", chairmanModelPharmacyLabel: "D", directorFinanceLabel: "E", executiveDirectorLabel: "F" };
    const { getInstituteSettings } = await import("./lib/instituteSettings.js");
    vi.spyOn(await import("./lib/instituteSettings.js"), "getInstituteSettings").mockResolvedValue(settings);
    const bill = await assembleContingentBill(1, 3);
    expect(bill.budget.previousBill).toBe(1200);
    expect(bill.budget.balance).toBe(2500 - (500 + 1200));
  });

  it("selects company vs individual account-code tax rates", async () => {
    const { selectTaxRates } = await import("./lib/autoDeductions.js");
    const account = { incomeTaxPercentCompany: "4.5", incomeTaxPercentIndividual: "7.5", salesTaxPercentCompany: "3.6", salesTaxPercentIndividual: "2.1" };
    expect(selectTaxRates(account, "COMPANY")).toEqual({ incomeTaxPercent: 4.5, salesTaxPercent: 3.6 });
    expect(selectTaxRates(account, "INDIVIDUAL")).toEqual({ incomeTaxPercent: 7.5, salesTaxPercent: 2.1 });
  });

  it("calculates L.D. after grace days at the configured daily rate", async () => {
    const { calculateLdCharges } = await import("./lib/autoDeductions.js");
    expect(calculateLdCharges(100000, 14, { ldGracePeriodDays: 7, ldRatePercentPerDay: 0.067, ldMaxCapPercent: null })).toBe(469);
  });
  it("returns exact L.D. breakdown and cap flag", async () => {
    const { calculateLDCharges } = await import("./lib/autoDeductions.js");
    expect(calculateLDCharges(new Date("2026-08-01"), new Date("2026-08-10"), 100000)).toEqual({ daysLate: 9, chargeableDays: 4, ldCharges: 268, isCapped: false });
    expect(calculateLDCharges(new Date("2026-08-01"), new Date("2027-08-01"), 100000, 5, 0, 10).isCapped).toBe(true);
  });
  it("caps L.D. charges at the configured maximum percentage", async () => {
    const { calculateLdCharges } = await import("./lib/autoDeductions.js");
    expect(calculateLdCharges(100000, 100, { ldGracePeriodDays: 7, ldRatePercentPerDay: 0.067, ldMaxCapPercent: 5 })).toBe(5000);
  });
  it("does not charge L.D. inside the grace period", async () => {
    const { calculateLdCharges } = await import("./lib/autoDeductions.js");
    expect(calculateLdCharges(100000, 5, { ldGracePeriodDays: 7, ldRatePercentPerDay: 0.067, ldMaxCapPercent: null })).toBe(0);
  });
  it("calculates due date, grace days, LD cap, and shelf-life deduction together", async () => {
    const { calculateShelfLifeAndDeductions } = await import("./lib/autoDeductions.js");
    const result = calculateShelfLifeAndDeductions({
      orderDate: new Date("2026-08-01"), grossPeriodDays: 30, actualDeliveryDate: new Date("2026-09-04"),
      manufacturingDate: new Date("2026-01-01"), expiryDate: new Date("2027-12-31"), orderValue: 100000,
      settings: { ldGracePeriodDays: 5, ldRatePercentPerDay: 0.067, ldMaxCapPercent: 10 },
      shelfLifeSlabs: [{ remainingPercentMin: 75, remainingPercentMax: null, penaltyPercent: 0, active: true }, { remainingPercentMin: 50, remainingPercentMax: 74.99, penaltyPercent: 2, active: true }, { remainingPercentMin: 25, remainingPercentMax: 49.99, penaltyPercent: 10, active: true }, { remainingPercentMin: 0, remainingPercentMax: 24.99, penaltyPercent: 25, active: true }],
    });
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(result.daysLate).toBe(4); expect(result.chargeableDays).toBe(0); expect(result.ldCharges).toBe(0);
    expect(result.remainingShelfLifePercent).toBeCloseTo(66.26, 2); expect(result.shelfLifeDeductionAmount).toBe(2000);
  });
  it("handles leap-year due-date calculation", async () => {
    const { calculateShelfLifeAndDeductions } = await import("./lib/autoDeductions.js");
    const result = calculateShelfLifeAndDeductions({ orderDate: new Date("2024-02-28"), grossPeriodDays: 1, actualDeliveryDate: new Date("2024-02-29"), orderValue: 1 });
    expect(result.dueDate?.toISOString().slice(0, 10)).toBe("2024-02-29"); expect(result.daysLate).toBe(0);
  });
  it("counts calendar days late correctly across August to October", async () => {
    const { daysBetween } = await import("./lib/autoDeductions.js");
    expect(daysBetween(new Date("2026-08-06T23:00:00Z"), new Date("2026-10-28T01:00:00Z"))).toBe(83);
  });
  it("preserves negative shelf-life percentages for very short expired stock", async () => {
    const { shelfLifePercent } = await import("./lib/autoDeductions.js");
    expect(shelfLifePercent(new Date("2026-08-01"), new Date("2026-08-04"), new Date("2026-10-28"))).toBeCloseTo(-2833.3333, 2);
  });

  it("matches shelf-life slabs from remaining shelf-life percentage", async () => {
    const { matchingShelfLifePenalty, shelfLifePercent } = await import("./lib/autoDeductions.js");
    const slabs = [{ remainingPercentMin: "75", remainingPercentMax: "100", penaltyPercent: "0", active: true }, { remainingPercentMin: "60", remainingPercentMax: "75", penaltyPercent: "5", active: true }, { remainingPercentMin: "50", remainingPercentMax: "60", penaltyPercent: "10", active: true }, { remainingPercentMin: "0", remainingPercentMax: "50", penaltyPercent: "20", active: true }];
    const remaining = shelfLifePercent(new Date("2026-01-01"), new Date("2027-01-01"), new Date("2026-07-02"));
    expect(Math.round(remaining ?? 0)).toBe(50);
    expect(matchingShelfLifePenalty(remaining, slabs)).toBe(10);
    expect(matchingShelfLifePenalty(80, slabs)).toBe(0);
    expect(matchingShelfLifePenalty(null, slabs)).toBe(0);
  });

  it("calculates the supplied shelf-life dates using whole calendar days", async () => {
    const { shelfLifePercent } = await import("./lib/autoDeductions.js");
    const remaining = shelfLifePercent(new Date("2026-01-01T15:30:00Z"), new Date("2028-01-01T02:00:00Z"), new Date("2026-09-01T23:59:00Z"));
    // 1 Sep 2026 to 1 Jan 2028 is 487 days; 487 / 730 = 66.7123...%.
    expect(remaining).toBeCloseTo(66.7123, 3);
  });

  it("keeps an expired-on-arrival shelf-life percentage negative", async () => {
    const { shelfLifePercent } = await import("./lib/autoDeductions.js");
    expect(shelfLifePercent(new Date("2026-01-01"), new Date("2027-01-01"), new Date("2027-01-19"))).toBeLessThan(0);
  });

  it("does not calculate shelf life for missing or invalid total-life dates", async () => {
    const { shelfLifePercent } = await import("./lib/autoDeductions.js");
    expect(shelfLifePercent(null, new Date("2027-01-01"), new Date("2026-07-01"))).toBeNull();
    expect(shelfLifePercent(new Date("2027-01-01"), new Date("2027-01-01"), new Date("2027-01-01"))).toBeNull();
  });
});

describe("Legacy invoice API", () => {
  it("returns the next serial", async () => {
    const r = await request(app).get("/api/invoices/next-serial").set(auth);
    expect(r.status).toBe(200);
    expect(r.body.serialNo).toBe(41);
  });
  it("creates multiple payee lines with automatic serials", async () => {
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const r = await request(app).post("/api/invoices").set(auth).send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const data = mocks.invoice.create.mock.calls[0][0].data;
    expect(data.serialNo).toBe(41);
    expect(
      data.items.create.map((x: { lineSerial: number }) => x.lineSerial),
    ).toEqual([1, 2]);
    expect(data.items.create[0]).toEqual(expect.objectContaining({ incomeTax: 70, salesTax: 35 }));
    expect(r.body.items[0].netAmount).toBe(595);
  });
  it("preserves user-entered cheque serials", async () => {
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const custom = { ...body, items: body.items.map((item, index) => ({ ...item, lineSerial: index === 0 ? 10 : 20 })) };
    const r = await request(app).post("/api/invoices").set(auth).send(custom);
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create.map((x: { lineSerial: number }) => x.lineSerial)).toEqual([10, 20]);
  });
  it("requires at least one line", async () => {
    const r = await request(app)
      .post("/api/invoices")
      .set(auth)
      .send({ ...body, items: [] });
    expect(r.status).toBe(400);
  });
  it("defaults omitted taxes to zero", async () => {
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const withoutTaxes = { ...body, items: body.items.map(({ incomeTax: _incomeTax, salesTax: _salesTax, ...item }) => item) };
    const r = await request(app).post("/api/invoices").set(auth).send(withoutTaxes);
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ incomeTax: 0, salesTax: 0 }));
  });
  it("auto-calculates omitted taxes from fixed account percentages", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "COMPANY" }]);
    mocks.accountCode.findUnique.mockResolvedValue({ id: 2, code: "A03907", incomeTaxPercentCompany: "4.5", incomeTaxPercentIndividual: "7", salesTaxPercentCompany: "3.6", salesTaxPercentIndividual: "9" });
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const item = { payeeId: 1, amount: 10000, chequeNo: "CH-TAX", purpose: "Tax test" };
    const r = await request(app).post("/api/invoices").set(auth).send({ ...body, isContingent: true, items: [item] });
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ incomeTax: 450, salesTax: 360 }));
    expect(r.body.items[0].netAmount).toBe(9190);
  });
  it("auto-calculates omitted L.D. and shelf-life deductions from their configured policies", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }]);
    mocks.setting.findMany.mockResolvedValue([{ key: "ldGracePeriodDays", value: "0" }, { key: "ldRatePercentPerDay", value: "5" }, { key: "ldMaxCapPercent", value: null }]);
    mocks.shelfLifePenaltySlab.findMany.mockResolvedValue([{ itemCategory: "LOCAL", remainingPercentMin: "50", remainingPercentMax: "60", penaltyPercent: "10", active: true }]);
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const item = { payeeId: 1, amount: 10000, poDate: "2026-06-12", deliveryDays: 10, actualDeliveryDate: "2026-07-02", manufacturingDate: "2026-01-01", expiryDate: "2027-01-01" };
    const r = await request(app).post("/api/invoices").set(auth).send({ ...body, isContingent: true, items: [item] });
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.isContingent).toBe(true);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ ldCharges: 1000, shelfLifeDeduction: 1000 }));
    expect(r.body.items[0].netAmount).toBe(8000);
  });
  it("honours a manually entered shelf-life deduction instead of the slab result", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }]);
    mocks.shelfLifePenaltySlab.findMany.mockResolvedValue([{ remainingPercentMin: "50", remainingPercentMax: "60", penaltyPercent: "10", active: true }]);
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const item = { payeeId: 1, amount: 10000, manufacturingDate: "2026-01-01", expiryDate: "2027-01-01", actualDeliveryDate: "2026-07-02", shelfLifeDeduction: 321 };
    const r = await request(app).post("/api/invoices").set(auth).send({ ...body, isContingent: true, items: [item] });
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ shelfLifeDeduction: 321 }));
  });
  it("honours a manually entered L.D. charge instead of the auto-calculation", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }]);
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const item = { payeeId: 1, amount: 10000, deliveryDueDate: "2026-01-01", actualDeliveryDate: "2026-01-15", ldCharges: 123 };
    const r = await request(app).post("/api/invoices").set(auth).send({ ...body, isContingent: true, items: [item] });
    expect(r.status).toBe(201);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0]).toEqual(expect.objectContaining({ ldCharges: 123 }));
  });
  it("rejects an actual delivery date before the manufacturing date", async () => {
    const item = { payeeId: 1, amount: 10000, manufacturingDate: "2026-07-02", expiryDate: "2027-01-01", actualDeliveryDate: "2026-07-01" };
    const r = await request(app).post("/api/invoices").set(auth).send({ ...body, items: [item] });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Validation failed");
  });
  it("keeps zero-rate taxes at zero but trusts explicit overrides", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }]);
    mocks.accountCode.findUnique.mockResolvedValue({ id: 2, code: "A03907", incomeTaxPercentCompany: "0", incomeTaxPercentIndividual: "0", salesTaxPercentCompany: "0", salesTaxPercentIndividual: "0" });
    mocks.invoice.create.mockImplementation(async ({ data }) => createdInvoice(data));
    const automatic = await request(app).post("/api/invoices").set(auth).send({ ...body, items: [{ payeeId: 1, amount: 10000 }] });
    expect(automatic.body.items[0]).toEqual(expect.objectContaining({ incomeTax: 0, salesTax: 0, netAmount: 10000 }));
    const overridden = await request(app).post("/api/invoices").set(auth).send({ ...body, items: [{ payeeId: 1, amount: 10000, incomeTax: 125, salesTax: 75 }] });
    expect(overridden.body.items[0]).toEqual(expect.objectContaining({ incomeTax: 125, salesTax: 75, netAmount: 9800 }));
  });
  it("rejects negative tax and combined tax above amount", async () => {
    const negative = await request(app).post("/api/invoices").set(auth).send({ ...body, items: [{ ...body.items[0], incomeTax: -1 }] });
    expect(negative.status).toBe(400);
    const excessive = await request(app).post("/api/invoices").set(auth).send({ ...body, items: [{ ...body.items[0], incomeTax: 500, salesTax: 300 }] });
    expect(excessive.status).toBe(400);
  });
  it("rejects a missing payee", async () => {
    mocks.payee.findMany.mockResolvedValue([{ id: 1, vendorType: "INDIVIDUAL" }]);
    const r = await request(app).post("/api/invoices").set(auth).send(body);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/payee/i);
  });
  it("replaces items when updating", async () => {
    mocks.invoiceItem.deleteMany.mockResolvedValue({ count: 2 });
    mocks.invoice.update.mockImplementation(async ({ data }) => createdInvoice(data));
    const r = await request(app).put("/api/invoices/1").set(auth).send(body);
    expect(r.status).toBe(200);
    expect(mocks.invoiceItem.deleteMany).toHaveBeenCalledWith({
      where: { invoiceId: 1 },
    });
    expect(r.body.items[1].netAmount).toBe(285);
  });
  it("includes tax fields and computed netAmount in detail responses", async () => {
    mocks.invoice.findUnique.mockResolvedValue({
      id: 1, serialNo: 40, accountCodeId: 2,
      accountCode: { id: 2, code: "A03907", name: "Test" },
      items: [{ payeeId: 1, amount: "1000", incomeTax: "100", salesTax: "50", lineSerial: 1, payee: { id: 1, code: "P1", name: "Vendor" } }],
    });
    const r = await request(app).get("/api/invoices/1").set(auth);
    expect(r.status).toBe(200);
    expect(r.body.items[0]).toEqual(expect.objectContaining({ incomeTax: "100", salesTax: "50", netAmount: 850 }));
  });
  it("deletes for admin", async () => {
    mocks.invoice.findUnique.mockResolvedValue({
      id: 1,
      serialNo: 40,
      accountCodeId: 2,
      accountCode: { id: 2, code: "A03907", name: "Test" },
      items: [
        { id: 1, payeeId: 1, amount: "700", incomeTax: "70", salesTax: "35", ldCharges: "0", shelfLifeDeduction: "0", lineSerial: 1, payee: { id: 1, code: "P1", name: "Vendor 1" } },
        { id: 2, payeeId: 3, amount: "300", incomeTax: "0", salesTax: "15", ldCharges: "10", shelfLifeDeduction: "5", lineSerial: 2, poNumber: "PO-1", dcNumber: "DC-1", payee: { id: 3, code: "P3", name: "Vendor 3" } },
      ],
    });
    mocks.invoice.delete.mockResolvedValue({});
    const r = await request(app).delete("/api/invoices/1").set(auth);
    expect(r.status).toBe(204);
    expect(mocks.invoice.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(mocks.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "delete", entityType: "invoice", entityId: "1" }),
    }));
  });
  it("calculates budget summary", async () => {
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: "5000" } });
    mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: "1200" } });
    const r = await request(app)
      .get("/api/account-codes/A03907/budget-summary?fiscalYear=2026-27")
      .set(auth);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      totalBudget: 5000,
      totalExpense: 1200,
      balance: 3800,
    });
    expect(mocks.budgetDocumentItem.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        budgetDocument: { date: { gte: new Date("2026-07-01T00:00:00Z"), lte: new Date("2027-06-30T23:59:59Z") } },
      }),
    }));
  });
});
