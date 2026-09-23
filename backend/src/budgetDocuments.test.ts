import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const mocks = vi.hoisted(() => ({
  user: { count: vi.fn(), findUnique: vi.fn() },
  accountCode: { count: vi.fn(), findUnique: vi.fn() },
  budgetDocument: {
    aggregate: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn(),
    findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(),
  },
  budgetDocumentItem: { deleteMany: vi.fn(), aggregate: vi.fn() },
  invoiceItem: { aggregate: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";

const token = jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" });
const auth = { Authorization: `Bearer ${token}` };
const body = {
  date: "2026-08-27", budgetType: "Original", details: "FY allocation",
  items: [{ accountCodeId: 2, amount: 5000 }, { accountCodeId: 3, amount: 3000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.$transaction.mockImplementation(async (callback: (tx: typeof mocks) => unknown) => callback(mocks));
  mocks.budgetDocument.aggregate.mockResolvedValue({ _max: { documentNo: 9 } });
  mocks.accountCode.count.mockResolvedValue(2);
});

describe("Budget document API", () => {
  it("returns its own next document number", async () => {
    const response = await request(app).get("/api/budget-documents/next-number").set(auth);
    expect(response.status).toBe(200);
    expect(response.body.documentNo).toBe(10);
  });
  it("creates a multi-account document with automatic line serials", async () => {
    mocks.budgetDocument.create.mockImplementation(async ({ data }) => ({ id: 1, ...data }));
    const response = await request(app).post("/api/budget-documents").set(auth).send(body);
    expect(response.status).toBe(201);
    const data = mocks.budgetDocument.create.mock.calls[0][0].data;
    expect(data.documentNo).toBe(10);
    expect(data.items.create.map((item: { lineSerial: number }) => item.lineSerial)).toEqual([1, 2]);
  });
  it("requires at least one item", async () => {
    const response = await request(app).post("/api/budget-documents").set(auth).send({ ...body, items: [] });
    expect(response.status).toBe(400);
  });
  it("rejects an unknown account code", async () => {
    mocks.accountCode.count.mockResolvedValue(1);
    const response = await request(app).post("/api/budget-documents").set(auth).send(body);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/account codes/i);
  });
  it("updates the header and replaces all items", async () => {
    mocks.budgetDocumentItem.deleteMany.mockResolvedValue({ count: 2 });
    mocks.budgetDocument.update.mockResolvedValue({ id: 1 });
    const response = await request(app).put("/api/budget-documents/1").set(auth).send({ ...body, budgetType: "Revised" });
    expect(response.status).toBe(200);
    expect(mocks.budgetDocumentItem.deleteMany).toHaveBeenCalledWith({ where: { budgetDocumentId: 1 } });
  });
  it("deletes a document for an authorized role", async () => {
    mocks.budgetDocument.delete.mockResolvedValue({});
    const response = await request(app).delete("/api/budget-documents/1").set(auth);
    expect(response.status).toBe(204);
  });
  it("returns the sum of budget items across documents in the same fiscal year", async () => {
    mocks.accountCode.findUnique.mockResolvedValue({ id: 2, code: "A01151" });
    mocks.budgetDocumentItem.aggregate.mockResolvedValue({ _sum: { amount: "8000" } });
    mocks.invoiceItem.aggregate.mockResolvedValue({ _sum: { amount: "1200" } });
    const response = await request(app)
      .get("/api/account-codes/A01151/budget-summary?fiscalYear=2026-27")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ totalBudget: 8000, totalExpense: 1200, balance: 6800 });
    expect(mocks.budgetDocumentItem.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: {
        accountCodeId: 2,
        budgetDocument: { date: { gte: new Date("2026-07-01T00:00:00Z"), lte: new Date("2027-06-30T23:59:59Z") } },
      },
    });
  });
});
