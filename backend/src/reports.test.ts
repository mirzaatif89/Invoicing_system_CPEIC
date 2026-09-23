import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { numberToWordsPKR } from "./lib/reportOutput.js";

const mocks = vi.hoisted(() => ({
  user: { count: vi.fn(), findUnique: vi.fn() },
  invoice: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  payee: { findUnique: vi.fn() }, accountCode: { findUnique: vi.fn(), findMany: vi.fn() },
  budgetDocument: { findUnique: vi.fn() },
  budgetDocumentItem: { aggregate: vi.fn() }, invoiceItem: { aggregate: vi.fn() }, setting: { findMany: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";
const token = jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" });
const auth = { Authorization: `Bearer ${token}` };
const invoice = { id: 1, serialNo: 10, date: new Date("2026-08-27T00:00:00Z"), accountCodeId: 2, accountCode: { id: 2, code: "A1", name: "Head One" }, items: [{ id: 1, payeeId: 3, amount: "1000", incomeTax: "100", salesTax: "50", chequeNo: "CH1", purpose: "Test", lineSerial: 1, payee: { id: 3, code: "P1", name: "Vendor One" } }] };
beforeEach(() => { vi.clearAllMocks(); mocks.invoice.findFirst.mockResolvedValue(invoice); mocks.invoice.findMany.mockResolvedValue([invoice]); mocks.setting.findMany.mockResolvedValue([]); mocks.setting.findUnique.mockResolvedValue(null); mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: null } }); mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: null } }); });

describe("Reports API", () => {
  it("formats Pakistani rupee amounts in words", () => {
    expect(numberToWordsPKR(555555)).toBe("Rupees:- Five Hundred Fifty-Five Thousand Five Hundred Fifty-Five Only");
  });
  it("assembles invoice printing data with tax and net totals", async () => {
    mocks.invoice.findFirst.mockResolvedValue(invoice);
    const response = await request(app).get("/api/reports/invoices/10").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.rows[0]).toEqual(expect.objectContaining({ amount: 1000, incomeTax: 100, salesTax: 50, netAmount: 850 }));
    expect(response.body.totals).toEqual(expect.objectContaining({ amount: 1000, incomeTax: 100, salesTax: 50, netAmount: 850 }));
  });
  it("renders invoice printing data as the Asaan Assignment Account PDF", async () => {
    mocks.invoice.findFirst.mockResolvedValue(invoice);
    const response = await request(app).get("/api/reports/invoices/10?format=pdf").set(auth);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(response.headers["content-disposition"]).toContain('inline; filename="invoice-schedule-10.pdf"');
    expect(response.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(response.body.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it("calculates previous expense before the printed invoice", async () => {
    mocks.invoice.findFirst.mockResolvedValue({ ...invoice, serialNo: 11, date: new Date("2026-08-28T00:00:00Z"), items: [{ ...invoice.items[0], amount: "300" }] });
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: "5000" } });
    mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: "1000" } });
    const response = await request(app).get("/api/reports/invoices/11?format=pdf").set(auth);
    expect(response.status).toBe(200);
    const previousWhere = mocks.invoiceItem.aggregate.mock.calls[0][0].where.invoice;
    expect(previousWhere.OR[0].date.lt).toEqual(new Date("2026-08-28T00:00:00Z"));
    expect(previousWhere.OR[1].serialNo.lt).toBe(11);
    expect(response.body.toString("latin1")).toContain("%PDF");
  });
  it("calculates vendor tax report totals", async () => {
    mocks.payee.findUnique.mockResolvedValue({ id: 3, code: "P1", name: "Vendor One" });
    const response = await request(app).get("/api/reports/vendor-tax?payeeCode=P1&dateFrom=2026-07-01&dateTo=2027-06-30").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.totals).toEqual(expect.objectContaining({ amount: 1000, incomeTax: 100, salesTax: 50, netAmount: 850 }));
  });
  it("calculates budget position from budget and invoice totals", async () => {
    mocks.accountCode.findMany.mockResolvedValue([{ id: 2, code: "A1", name: "Head One" }]);
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: "5000" } });
    mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: "1000" } });
    const response = await request(app).get("/api/reports/budget-position?fiscalYear=2026-27").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.rows[0]).toEqual({ code: "A1", name: "Head One", totalBudget: 5000, totalExpense: 1000, balance: 4000 });
  });
  it("aggregates head-wise invoice payments", async () => {
    const response = await request(app).get("/api/reports/head-wise-payment?dateFrom=2026-07-01&dateTo=2027-06-30").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.rows).toEqual([{ code: "A1", name: "Head One", amount: 1000, netAmount: 850 }]);
    expect(response.body.totals).toEqual(expect.objectContaining({ amount: 1000, netAmount: 850 }));
  });
  it("aggregates vendor-wise invoice payments", async () => {
    const response = await request(app).get("/api/reports/vendor-wise-payment?dateFrom=2026-07-01&dateTo=2027-06-30").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.rows).toEqual([{ code: "P1", name: "Vendor One", amount: 1000, netAmount: 850 }]);
  });
});
