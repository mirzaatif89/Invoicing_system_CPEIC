import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const mocks = vi.hoisted(() => ({
  user: { count: vi.fn() },
  accountCode: { findUnique: vi.fn() },
  payee: { findMany: vi.fn() },
  setting: { findMany: vi.fn() },
  shelfLifePenaltySlab: { findMany: vi.fn() },
  itemTypeTaxRule: { findMany: vi.fn() },
  invoice: { aggregate: vi.fn(), create: vi.fn() },
  poSupply: { findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";

const token = jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" });
const auth = { Authorization: `Bearer ${token}` };
const amount = 1_000;
const day = (offset: number) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
};
const account = {
  id: 101,
  incomeTaxPercentIndividualActive: "5",
  incomeTaxPercentIndividualInactive: "10",
  incomeTaxPercentCompanyActive: "6",
  incomeTaxPercentCompanyInactive: "12",
  salesTaxPercentIndividual: "0",
  salesTaxPercentCompany: "0",
};

function createdInvoice(data: any) {
  return {
    id: 501,
    ...data,
    accountCode: { id: 101, code: "TEST-TAX", name: "Taxpayer status test" },
    items: data.items.create.map((item: any, index: number) => ({
      id: index + 1,
      ...item,
      payee: { id: item.payeeId, code: "P-STATUS", name: "Status vendor", vendorType: "INDIVIDUAL" },
    })),
  };
}

function setStatusHistory(history: Array<{ status: "ACTIVE" | "INACTIVE"; effectiveFrom: Date; validUntil: Date | null }>) {
  mocks.payee.findMany.mockResolvedValue([{ id: 201, vendorType: "INDIVIDUAL", taxStatusHistory: history }]);
}

async function createFromSupply() {
  const response = await request(app).post("/api/invoices/create-contingent-from-supplies").set(auth).send({ supplyIds: [301] });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response;
}

async function createDatedContingentBill(date: Date) {
  const response = await request(app).post("/api/invoices").set(auth).send({
    accountCodeId: 101,
    date: date.toISOString(),
    isContingent: true,
    items: [{ payeeId: 201, amount, poNumber: "PO-TAX", dcNumber: "DC-TAX", itemType: "LOCAL" }],
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(async (callback: (tx: typeof mocks) => unknown) => callback(mocks));
  mocks.accountCode.findUnique.mockResolvedValue(account);
  mocks.setting.findMany.mockResolvedValue([]);
  mocks.shelfLifePenaltySlab.findMany.mockResolvedValue([]);
  mocks.itemTypeTaxRule.findMany.mockResolvedValue([]);
  mocks.invoice.aggregate.mockResolvedValue({ _max: { serialNo: 0 } });
  mocks.invoice.create.mockImplementation(async ({ data }: { data: unknown }) => createdInvoice(data));
  mocks.poSupply.findMany.mockResolvedValue([{
    id: 301,
    poNumber: "PO-TAX",
    poDate: day(-1),
    accountCodeId: 101,
    payeeId: 201,
    dcNumber: "DC-TAX",
    procurementMode: "TENDER",
    deliveryDays: 0,
    gracePeriodDays: 5,
    actualDeliveryDate: null,
    manufacturingDate: null,
    expiryDate: null,
    itemType: "LOCAL",
    itemTypes: ["LOCAL"],
    amount: String(amount),
    manualLdAmount: "0",
    manualShelfLifeAmount: "0",
  }]);
  mocks.poSupply.updateMany.mockResolvedValue({ count: 1 });
});

describe("taxpayer-status income tax calculation", () => {
  it("uses the Active rate when the vendor has an ACTIVE status effective before the bill date", async () => {
    setStatusHistory([{ status: "ACTIVE", effectiveFrom: day(-30), validUntil: null }]);
    const response = await createFromSupply();
    expect(response.body.items[0].incomeTax).toBe(50);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0].incomeTax).toBe(50);
  });

  it("uses the Inactive rate when the vendor has an INACTIVE status effective before the bill date", async () => {
    setStatusHistory([{ status: "INACTIVE", effectiveFrom: day(-30), validUntil: null }]);
    const response = await createFromSupply();
    expect(response.body.items[0].incomeTax).toBe(100);
  });

  it("falls back to INACTIVE when the vendor has no tax status history", async () => {
    setStatusHistory([]);
    const response = await createFromSupply();
    expect(response.body.items[0].incomeTax).toBe(100);
  });

  it("treats an ACTIVE status whose validUntil is in the past as INACTIVE", async () => {
    setStatusHistory([{ status: "ACTIVE", effectiveFrom: day(-60), validUntil: day(-10) }]);
    const response = await createFromSupply();
    expect(response.body.items[0].incomeTax).toBe(100);
  });

  it("uses the status in effect on the bill date instead of a later current status", async () => {
    setStatusHistory([
      { status: "ACTIVE", effectiveFrom: day(-60), validUntil: null },
      { status: "INACTIVE", effectiveFrom: day(-5), validUntil: null },
    ]);
    const response = await createDatedContingentBill(day(-30));
    expect(response.body.items[0].incomeTax).toBe(50);
    expect(mocks.invoice.create.mock.calls[0][0].data.items.create[0].incomeTax).toBe(50);
  });
});
