import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

const mocks = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
  setting: { findUnique: vi.fn(), upsert: vi.fn() },
}));
vi.mock("./lib/prisma.js", () => ({ prisma: mocks }));
import { app } from "./app.js";
const adminToken = jwt.sign({ username: "admin", role: "ADMIN" }, config.JWT_SECRET, { subject: "1" });
const userToken = jwt.sign({ username: "staff", role: "USER" }, config.JWT_SECRET, { subject: "2" });
const adminAuth = { Authorization: `Bearer ${adminToken}` }, userAuth = { Authorization: `Bearer ${userToken}` };

beforeEach(() => { vi.clearAllMocks(); });

describe("Password change", () => {
  it("verifies current password and saves a hash for the logged-in user", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 2, passwordHash: await bcrypt.hash("Current123", 4) });
    mocks.user.update.mockResolvedValue({ id: 2 });
    const response = await request(app).post("/api/auth/change-password").set(userAuth).send({ currentPassword: "Current123", newPassword: "NewStrong123" });
    expect(response.status).toBe(200);
    expect(mocks.user.update.mock.calls[0][0].where.id).toBe(2);
    expect(await bcrypt.compare("NewStrong123", mocks.user.update.mock.calls[0][0].data.passwordHash)).toBe(true);
  });
  it("rejects an incorrect current password", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 2, passwordHash: await bcrypt.hash("Current123", 4) });
    const response = await request(app).post("/api/auth/change-password").set(userAuth).send({ currentPassword: "WrongPassword", newPassword: "NewStrong123" });
    expect(response.status).toBe(400);
  });
});

describe("User management", () => {
  it("lists, creates and updates users for admins", async () => {
    mocks.user.findMany.mockResolvedValue([{ id: 2, username: "staff", role: "USER", active: true }]);
    expect((await request(app).get("/api/users").set(adminAuth)).body.data).toHaveLength(1);
    mocks.user.create.mockResolvedValue({ id: 3, username: "newuser", role: "ACCOUNTANT", active: true });
    const created = await request(app).post("/api/users").set(adminAuth).send({ username: "newuser", password: "Temporary123", role: "ACCOUNTANT" });
    expect(created.status).toBe(201);
    expect(await bcrypt.compare("Temporary123", mocks.user.create.mock.calls[0][0].data.passwordHash)).toBe(true);
    mocks.user.update.mockResolvedValue({ id: 3, username: "newuser", role: "USER", active: false });
    const updated = await request(app).put("/api/users/3").set(adminAuth).send({ role: "USER", active: false });
    expect(updated.status).toBe(200);
  });
  it("blocks non-admin users", async () => { expect((await request(app).get("/api/users").set(userAuth)).status).toBe(403); });
});

describe("Fiscal-year setting", () => {
  it("returns automatic fallback and lets admins save or clear an override", async () => {
    mocks.setting.findUnique.mockResolvedValue(null);
    const fetched = await request(app).get("/api/settings/currentFiscalYearOverride").set(userAuth);
    expect(fetched.status).toBe(200);
    expect(fetched.body.value).toBeNull();
    mocks.setting.upsert.mockResolvedValue({ key: "currentFiscalYearOverride", value: "2026-27" });
    const saved = await request(app).put("/api/settings/currentFiscalYearOverride").set(adminAuth).send({ value: "2026-27" });
    expect(saved.status).toBe(200);
    expect(mocks.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { value: "2026-27" } }));
  });
  it("blocks non-admin setting updates", async () => { expect((await request(app).put("/api/settings/currentFiscalYearOverride").set(userAuth).send({ value: null })).status).toBe(403); });
});
