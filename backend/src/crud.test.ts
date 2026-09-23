import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { config } from "./config.js";

const mocks = vi.hoisted(() => ({
  payee: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  accountCode: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
  user: { findUnique: vi.fn(), count: vi.fn() },
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));

import { app } from "./app.js";

const token = jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" });
const auth = { Authorization: `Bearer ${token}` };
const duplicateError = () => new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.payee.count.mockResolvedValue(1);
  mocks.accountCode.count.mockResolvedValue(1);
});

describe("Payee API", () => {
  const body = { code: "529", name: "Test Vendor", address_line_1: "Wazirabad", address_line_2: "Punjab", phone: "0300", itax_no: "IT-123" };
  it("creates a payee with legacy fields", async () => { mocks.payee.create.mockResolvedValue({ id: 1, code: body.code, name: body.name }); const r = await request(app).post("/api/payees").set(auth).send(body); expect(r.status).toBe(201); expect(mocks.payee.create.mock.calls[0][0].data).toMatchObject({ addressLine1: "Wazirabad", addressLine2: "Punjab", itaxNo: "IT-123" }); });
  it("suggests the next numeric payee code", async () => { mocks.payee.findMany.mockResolvedValue([{ code: "528" }, { code: "ABC" }, { code: "500" }]); const r = await request(app).get("/api/payees/next-code").set(auth); expect(r.status).toBe(200); expect(r.body.code).toBe("529"); });
  it("rejects duplicate codes", async () => { mocks.payee.create.mockRejectedValue(duplicateError()); const r = await request(app).post("/api/payees").set(auth).send(body); expect(r.status).toBe(409); });
  it("lists payees", async () => { mocks.payee.findMany.mockResolvedValue([{ id: 1, code: "P001" }]); const r = await request(app).get("/api/payees?search=test").set(auth); expect(r.status).toBe(200); expect(r.body.data).toHaveLength(1); });
  it("updates a payee", async () => { mocks.payee.update.mockResolvedValue({ id: 1, code: body.code, name: "Updated" }); const r = await request(app).put("/api/payees/1").set(auth).send({ ...body, name: "Updated" }); expect(r.status).toBe(200); expect(r.body.name).toBe("Updated"); });
  it("deletes a payee", async () => { mocks.payee.delete.mockResolvedValue({}); const r = await request(app).delete("/api/payees/1").set(auth); expect(r.status).toBe(204); });
});

describe("Account Code API", () => {
  const body = { code: "A03202", name: "Telephone & Trunk Calls", category: "Operating" };
  it("creates an account code", async () => { mocks.accountCode.create.mockResolvedValue({ id: 1, ...body }); const r = await request(app).post("/api/account-codes").set(auth).send(body); expect(r.status).toBe(201); });
  it("rejects duplicate codes", async () => { mocks.accountCode.create.mockRejectedValue(duplicateError()); const r = await request(app).post("/api/account-codes").set(auth).send(body); expect(r.status).toBe(409); });
  it("lists account codes", async () => { mocks.accountCode.findMany.mockResolvedValue([{ id: 1, ...body }]); const r = await request(app).get("/api/account-codes").set(auth); expect(r.status).toBe(200); expect(r.body.data).toHaveLength(1); });
  it("updates an account code", async () => { mocks.accountCode.update.mockResolvedValue({ id: 1, ...body, name: "Updated" }); const r = await request(app).put("/api/account-codes/1").set(auth).send({ ...body, name: "Updated" }); expect(r.status).toBe(200); });
  it("applies tax rates to every account code", async () => {
    mocks.accountCode.updateMany.mockResolvedValue({ count: 98 });
    const taxRates = { incomeTaxPercentCompanyActive: 4.5, incomeTaxPercentCompanyInactive: 9, incomeTaxPercentIndividualActive: 5, incomeTaxPercentIndividualInactive: 10, salesTaxPercentCompany: 3.6, salesTaxPercentIndividual: 4 };
    const r = await request(app).put("/api/account-codes/bulk-tax-rates").set(auth).send(taxRates);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ updated: 98 });
    expect(mocks.accountCode.updateMany).toHaveBeenCalledWith({ data: taxRates });
  });
  it("deletes an account code", async () => { mocks.accountCode.delete.mockResolvedValue({}); const r = await request(app).delete("/api/account-codes/1").set(auth); expect(r.status).toBe(204); });
});
