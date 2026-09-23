import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const mocks = vi.hoisted(() => ({
  setting: { findUnique: vi.fn() }, budgetDocumentItem: { aggregate: vi.fn() }, invoiceItem: { aggregate: vi.fn(), groupBy: vi.fn() }, invoice: { count: vi.fn(), findMany: vi.fn() }, budgetDocument: { count: vi.fn() }, payee: { count: vi.fn(), findMany: vi.fn() }, accountCode: { count: vi.fn() }, user: { count: vi.fn() },
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";

const auth = { Authorization: `Bearer ${jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" })}` };
beforeEach(() => { vi.clearAllMocks(); mocks.setting.findUnique.mockResolvedValue(null); });

describe("Dashboard API", () => {
  it("returns invoice-only fiscal-year totals and rankings", async () => {
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: "10000" } });
    mocks.invoiceItem.aggregate.mockResolvedValueOnce({ _sum: { amount: "3000" } }).mockResolvedValueOnce({ _sum: { incomeTax: "300" } }).mockResolvedValueOnce({ _sum: { salesTax: "150" } });
    mocks.invoice.count.mockResolvedValue(2); mocks.budgetDocument.count.mockResolvedValue(2); mocks.payee.count.mockResolvedValue(8); mocks.accountCode.count.mockResolvedValue(4);
    mocks.invoiceItem.groupBy.mockResolvedValueOnce([{ invoiceId: 10, _sum: { amount: "3000" } }]).mockResolvedValueOnce([{ payeeId: 7, _sum: { amount: "3000" } }]);
    mocks.invoice.findMany.mockResolvedValue([{ id: 10, accountCode: { code: "A1", name: "Medicines" } }]);
    mocks.payee.findMany.mockResolvedValue([{ id: 7, code: "P1", name: "Vendor One" }]);
    const response = await request(app).get("/api/dashboard/summary?fiscalYear=2026").set(auth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ totalBudget: 10000, totalExpense: 3000, totalBalance: 7000, totalIncomeTaxDeducted: 300, totalSalesTaxDeducted: 150, invoiceCount: 2, payeeCount: 8 });
  });

  it("returns twelve invoice-only July-to-June monthly buckets", async () => {
    mocks.invoiceItem.groupBy.mockResolvedValue([{ invoiceId: 1, _sum: { amount: "1000" } }, { invoiceId: 2, _sum: { amount: "2000" } }]);
    mocks.invoice.findMany.mockResolvedValue([{ id: 1, date: new Date("2026-07-10") }, { id: 2, date: new Date("2026-08-10") }]);
    const response = await request(app).get("/api/dashboard/monthly-payments?fiscalYear=2026").set(auth);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(12);
    expect(response.body[0]).toEqual({ month: "Jul 2026", totalPayments: 1000 });
    expect(response.body[1]).toEqual({ month: "Aug 2026", totalPayments: 2000 });
    expect(response.body[6]).toEqual({ month: "Jan 2027", totalPayments: 0 });
  });
});
